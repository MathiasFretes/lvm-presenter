#include <node_api.h>
#include <windows.h>
#include <Processing.NDI.Lib.h>
#include <cstdint>
#include <string>
#include <vector>

namespace {

const NDIlib_v5* api = nullptr;
HMODULE library = nullptr;
int active_senders = 0;

struct Sender {
    NDIlib_send_instance_t instance = nullptr;
    int width = 0;
    int height = 0;
    int fps = 0;
    NDIlib_FourCC_video_type_e format = NDIlib_FourCC_type_BGRA;
};

napi_value fail(napi_env env, const char* message) {
    napi_throw_error(env, nullptr, message);
    return nullptr;
}

bool get_int(napi_env env, napi_value object, const char* key, int32_t* result) {
    napi_value value;
    return napi_get_named_property(env, object, key, &value) == napi_ok &&
           napi_get_value_int32(env, value, result) == napi_ok;
}

bool get_string(napi_env env, napi_value object, const char* key, std::string* result) {
    napi_value value;
    size_t length = 0;
    if (napi_get_named_property(env, object, key, &value) != napi_ok ||
        napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok || length > 253) return false;
    std::vector<char> bytes(length + 1);
    if (napi_get_value_string_utf8(env, value, bytes.data(), bytes.size(), &length) != napi_ok) return false;
    result->assign(bytes.data(), length);
    return true;
}

bool load_runtime() {
    if (api) return true;
    const wchar_t* names[] = { L"LVM_NDI_RUNTIME_DIR", L"NDI_RUNTIME_DIR_V6", L"NDI_RUNTIME_DIR_V5" };
    for (const wchar_t* name : names) {
        wchar_t directory[32768];
        DWORD length = GetEnvironmentVariableW(name, directory, 32768);
        if (length == 0 || length >= 32768) continue;
        std::wstring path(directory, length);
        if (path.back() != L'\\' && path.back() != L'/') path += L'\\';
        path += L"Processing.NDI.Lib.x64.dll";
        library = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (library) break;
    }
    if (!library) return false;
    using load_function = const NDIlib_v5* (*)();
    auto load = reinterpret_cast<load_function>(GetProcAddress(library, "NDIlib_v5_load"));
    if (load) api = load();
    if (api) return true;
    FreeLibrary(library);
    library = nullptr;
    return false;
}

void close_sender(Sender* sender) {
    if (!sender || !sender->instance) return;
    api->NDIlib_send_destroy(sender->instance);
    sender->instance = nullptr;
    if (--active_senders == 0) api->NDIlib_destroy();
}

void finalize_sender(napi_env, void* data, void*) {
    auto* sender = static_cast<Sender*>(data);
    close_sender(sender);
    delete sender;
}

Sender* get_sender(napi_env env, napi_value value) {
    Sender* sender = nullptr;
    if (napi_get_value_external(env, value, reinterpret_cast<void**>(&sender)) != napi_ok ||
        !sender || !sender->instance) return nullptr;
    return sender;
}

napi_value create(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 1)
        return fail(env, "NDI sender config is required");
    std::string name, format;
    int32_t width, height, fps;
    if (!get_string(env, args[0], "name", &name) || name.empty() ||
        !get_string(env, args[0], "format", &format) ||
        !get_int(env, args[0], "width", &width) || !get_int(env, args[0], "height", &height) ||
        !get_int(env, args[0], "fps", &fps) || width < 2 || width > 7680 || width % 2 ||
        height < 1 || height > 4320 || (fps != 30 && fps != 60) ||
        (format != "BGRA" && format != "RGBA")) return fail(env, "Invalid NDI sender config");
    if (!load_runtime()) return fail(env, "NDI runtime not found; set LVM_NDI_RUNTIME_DIR to its DLL directory");
    if (active_senders == 0 && !api->NDIlib_initialize()) return fail(env, "NDI runtime initialization failed");

    NDIlib_send_create_t options{};
    options.p_ndi_name = name.c_str();
    options.clock_video = false;
    options.clock_audio = false;
    auto instance = api->NDIlib_send_create(&options);
    if (!instance) {
        if (active_senders == 0) api->NDIlib_destroy();
        return fail(env, "NDI sender creation failed");
    }
    auto* sender = new Sender{};
    sender->instance = instance;
    sender->width = width;
    sender->height = height;
    sender->fps = fps;
    sender->format = format == "BGRA" ? NDIlib_FourCC_type_BGRA : NDIlib_FourCC_type_RGBA;
    ++active_senders;
    napi_value handle;
    if (napi_create_external(env, sender, finalize_sender, nullptr, &handle) != napi_ok) {
        close_sender(sender);
        delete sender;
        return fail(env, "Could not create NDI sender handle");
    }
    return handle;
}

napi_value send(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 3)
        return fail(env, "NDI send requires handle, Buffer, and stride");
    auto* sender = get_sender(env, args[0]);
    if (!sender) return fail(env, "NDI sender is stopped");
    void* data = nullptr;
    size_t size = 0;
    int32_t stride = 0;
    if (napi_get_buffer_info(env, args[1], &data, &size) != napi_ok ||
        napi_get_value_int32(env, args[2], &stride) != napi_ok ||
        stride < sender->width * 4 ||
        size < static_cast<size_t>(stride) * (sender->height - 1) + sender->width * 4)
        return fail(env, "Invalid NDI video buffer or stride");
    // A private copy keeps the SDK's synchronous send independent of JS buffer ownership.
    const size_t needed = static_cast<size_t>(stride) * (sender->height - 1) + sender->width * 4;
    std::vector<uint8_t> pixels(static_cast<uint8_t*>(data), static_cast<uint8_t*>(data) + needed);
    NDIlib_video_frame_v2_t frame{};
    frame.xres = sender->width;
    frame.yres = sender->height;
    frame.FourCC = sender->format;
    frame.frame_rate_N = sender->fps;
    frame.frame_rate_D = 1;
    frame.picture_aspect_ratio = static_cast<float>(sender->width) / sender->height;
    frame.frame_format_type = NDIlib_frame_format_type_progressive;
    frame.timecode = NDIlib_send_timecode_synthesize;
    frame.p_data = pixels.data();
    frame.line_stride_in_bytes = stride;
    api->NDIlib_send_send_video_v2(sender->instance, &frame);
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

napi_value destroy(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 1)
        return fail(env, "NDI sender handle is required");
    auto* sender = get_sender(env, args[0]);
    if (!sender) return fail(env, "NDI sender is already stopped");
    close_sender(sender);
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

napi_value init(napi_env env, napi_value exports) {
    napi_property_descriptor methods[] = {
        { "create", nullptr, create, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "send", nullptr, send, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "destroy", nullptr, destroy, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    napi_define_properties(env, exports, 3, methods);
    return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
