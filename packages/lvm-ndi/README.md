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

The API accepts BGRA or RGBA 8-bit non-premultiplied frames with an even width, 30 or 60 fps. `send()` uses a reusable native buffer and calls the synchronous NDI sender function. `ndi:verify` checks native loading and sends one small frame into the SDK; it does not verify that a receiver displays it. Capture and Electron output wiring are separate integration steps.

## Video E2E

After `ndi:build`, start an NDI receiver on the same machine or LAN. From this package directory, run:

```powershell
node scripts/e2e-sender.mjs --fps 30 --seconds 600
node scripts/e2e-sender.mjs --fps 60 --seconds 600
```

Select `LAPTOP-NAME (LVM Presenter Test)` in the receiver. The pattern contains color bars, a frame counter, and a moving block; check that the colors and orientation are correct and the counter advances. The script reuses its frame buffer and emits a JSON report in ignored `.ndi-cache/reports/` with send timing, effective FPS, errors, skipped intervals, CPU time, and memory samples. Keep the receiver attached throughout each run. Its visual output is a manual E2E gate; the JSON report cannot prove that an image appeared. Run 60 fps only after the receiver displays the 30 fps stream. No part of this test connects the sender to Presenter Output Manager.

## Acceptance gate

Build the addon against the official SDK, run the independent 1920×1080 sender for 10 minutes at 30 fps and then 60 fps, and verify picture and stability in an NDI receiver. Test runtime-missing and sender-stop behavior. This requires the SDK/runtime and an NDI receiver on the target system. See [the M7.8C test record](docs/video-e2e.md) for observed results and limitations.

## Presenter integration

The isolated M7.8D integration and its E2E procedure are documented in [Presenter integration](docs/presenter-integration.md). Presenter now exposes LVM NDI in Outputs: choose an NDI output or enable it on an existing output, set the source name and 30/60 fps, then read the live state and error in Settings. Only one LVM NDI source can run at a time. This output sends video only; a dedicated invisible NDI output is excluded from local audio routing. The development flag remains for isolated scripts.

For Windows packaging, build the addon with `ndi:build` before `electron-builder`. The packaging config includes the public package entry point and unpacks `lvm_ndi.node`. The official NDI runtime must be installed on the target machine; this repository does not bundle or redistribute its DLL. A build without the addon leaves NDI unavailable and reports that state in the Presenter UI. Release validation must inspect the packaged app and its runtime behavior before calling NDI distribution ready.

An unsigned `win-unpacked` package was assembled locally for M7.8E. Its ASAR contains `packages/lvm-ndi/src/index.mjs`, the native addon resides under `app.asar.unpacked`, and neither `.ndi-cache` nor the NDI runtime DLL is inside the package. A signed installer and end-user runtime installation remain separate release checks.
