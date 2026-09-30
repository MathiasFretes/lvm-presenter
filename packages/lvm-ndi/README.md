# LVM NDI 0.1

Original LVM sender adapter for Windows. It uses the official NDI SDK at build time and its runtime at execution time. No SDK header or binary is committed here. This package is isolated from Presenter’s existing NDI implementation.

## Build prerequisites

- Official NDI SDK installed and its terms reviewed.
- Visual Studio C++ Build Tools, Python and `node-gyp` for the Electron/Node version being targeted.
- Windows x64. Supply the SDK folder containing `Include/Processing.NDI.Lib.h`.

From this directory:

```powershell
npx node-gyp rebuild --ndi_sdk_dir="C:\Program Files\NDI\NDI 6 SDK"
$env:LVM_NDI_RUNTIME_DIR = 'C:\Program Files\NDI\NDI 6 Runtime\v6'
npm test
```

Runtime loading also checks `NDI_RUNTIME_DIR_V6` and `NDI_RUNTIME_DIR_V5`. The runtime DLL must be named `Processing.NDI.Lib.x64.dll`. Packaging and any SDK redistribution require a separate license review. Current NDI documentation says the standard SDK is free for non-commercial use; commercial use requires checking its current terms with NDI.

The API accepts BGRA or RGBA 8-bit non-premultiplied frames with an even width, 30 or 60 fps. `send()` copies the frame and calls the synchronous NDI sender function. Capture and Electron output wiring are a separate integration step. No network E2E has been run yet.

## Acceptance gate

Build the addon against the official SDK, start `LVM Presenter - Congregación`, send 1920×1080 frames for several minutes, and verify picture and stability in an NDI receiver. Test runtime-missing and sender-stop behavior. This requires the SDK/runtime and an NDI receiver on the target system.
