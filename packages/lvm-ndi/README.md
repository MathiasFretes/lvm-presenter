# LVM NDI 0.1

Original LVM sender adapter for Windows. It uses the official NDI SDK at build time and its runtime at execution time. No SDK header or binary is committed here. This package is isolated from Presenter’s existing NDI implementation.

## Build prerequisites

- Windows x64, PowerShell 7, Visual Studio C++ Build Tools, Python and local `node-gyp`.
- `ndi:setup` first searches normal NDI 6 install locations, `LOCALAPPDATA/LVM/ndi-sdk`, `NDI_SDK_DIR`, `LVM_NDI_SDK_DIR`, and the package cache. If no SDK is found, it downloads the official NDI 6.3.2 installer and the published innoextract 1.9 Windows binary, checks pinned SHA-256 hashes and the installer's Vizrt signature, then extracts them into the ignored `.ndi-cache/` folder. It does not run the installer or install the SDK system-wide.

From this directory:

```powershell
npm ci
npm run ndi:setup
npm run ndi:build
npm test
npm run ndi:verify
```

`ndi:setup` records only local paths in ignored `.ndi-cache/ndi-setup.json`; it does not copy SDK files into Git. It uses the [official NDI hosted installer](https://downloads.ndi.tv/SDK/NDI_SDK/NDI%206%20SDK.exe), which was verified as version 6.3.2 when this workflow was written. If NDI changes that file, the pinned hash blocks an unreviewed replacement. Set `LVM_NDI_AUTO_DOWNLOAD=0` to require a pre-provisioned SDK in CI, or provide `NDI_SDK_DIR`. The [NDI download page](https://ndi.video/for-developers/ndi-sdk/download/) remains the fallback if the direct file becomes unavailable.

Runtime loading also checks `NDI_RUNTIME_DIR_V6` and `NDI_RUNTIME_DIR_V5`. The runtime DLL must be named `Processing.NDI.Lib.x64.dll`. The extracted SDK contains `NDI SDK License Agreement.pdf`. Review those terms before product packaging or redistribution; the [current developer page](https://ndi.video/for-developers/) describes permitted software uses.

The API accepts BGRA or RGBA 8-bit non-premultiplied frames with an even width, 30 or 60 fps. `send()` copies the frame and calls the synchronous NDI sender function. `ndi:verify` checks native loading and sends one small frame into the SDK; it does not verify that a receiver displays it. Capture and Electron output wiring are separate integration steps. No network E2E has been run yet.

## Acceptance gate

Build the addon against the official SDK, start `LVM Presenter - Congregación`, send 1920×1080 frames for several minutes, and verify picture and stability in an NDI receiver. Test runtime-missing and sender-stop behavior. This requires the SDK/runtime and an NDI receiver on the target system.
