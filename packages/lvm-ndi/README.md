# LVM NDI 0.1

Original LVM sender adapter for Windows. It uses the official NDI SDK at build time and its runtime at execution time. No SDK header or binary is committed here. This package is isolated from Presenter’s existing NDI implementation.

## Build prerequisites

- Official NDI SDK obtained under its current terms. The build needs its headers, but the SDK does not have to be installed permanently on a developer PC; a CI or build machine can hold it.
- Windows x64, Visual Studio C++ Build Tools, Python and local `node-gyp`.
- A folder containing `Include/Processing.NDI.Lib.h`. `ndi:setup` searches the normal NDI 6 install locations, `LOCALAPPDATA/LVM/ndi-sdk`, `NDI_SDK_DIR`, and `LVM_NDI_SDK_DIR`.

From this directory:

```powershell
npm ci
npm run ndi:setup
npm run ndi:build
npm test
npm run ndi:verify
```

`ndi:setup` records only local paths in ignored `build/ndi-setup.json`; it does not copy SDK files into Git. If it cannot find the SDK, it points to the official [NDI SDK download form](https://ndi.video/for-developers/ndi-sdk/download/). That form needs the licensee's own details and cannot be bypassed by a build script. An authorized CI process can provide the SDK through its own secure provisioning and set `NDI_SDK_DIR`.

Runtime loading also checks `NDI_RUNTIME_DIR_V6` and `NDI_RUNTIME_DIR_V5`. The runtime DLL must be named `Processing.NDI.Lib.x64.dll`. Packaging and any SDK redistribution require a separate review of the applicable NDI terms; the [current developer page](https://ndi.video/for-developers/) describes permitted software uses, and the exact SDK license controls distribution.

The API accepts BGRA or RGBA 8-bit non-premultiplied frames with an even width, 30 or 60 fps. `send()` copies the frame and calls the synchronous NDI sender function. `ndi:verify` checks native loading and sends one small frame into the SDK; it does not verify that a receiver displays it. Capture and Electron output wiring are separate integration steps. No network E2E has been run yet.

## Acceptance gate

Build the addon against the official SDK, start `LVM Presenter - Congregación`, send 1920×1080 frames for several minutes, and verify picture and stability in an NDI receiver. Test runtime-missing and sender-stop behavior. This requires the SDK/runtime and an NDI receiver on the target system.
