# M7.8D — Presenter integration (development gate)

The LVM sender now consumes the final BGRA frame of an existing Presenter output. It does not render a second presentation.

```text
Presentation Engine → Output.svelte → OutputLifecycle
                                      ├─ visible window / frame subscription
                                      └─ offscreen window / OSR paint
                                                 ↓
                                        CaptureTransmitter
                                                 ↓
                                        LvmNdiBridge → NdiOutput
                                                 ↓
                                        packages/lvm-ndi public API
                                                 ↓
                                        NDI runtime → receiver
```

The existing local output continues through its normal renderer. The `lvmNdi` capture consumer is enabled only for the selected output, and its failures are contained in `NdiOutput` with `inactive`, `starting`, `active`, and `error` states. The older Presenter NDI sender is not imported by `NdiOutput` or `LvmNdiBridge` and was not removed in this milestone.

## Development configuration

Set `LVM_NDI_OUTPUT_ID` to an exact Presenter output ID, or `first` to bind the first output opened after launch. Unset it to disable LVM NDI. `LVM_NDI_SOURCE_NAME` defaults to `LVM Presenter`; `LVM_NDI_FPS` accepts `30` (default) or `60`. The SDK runtime must be available as described in the package README. These are development flags, not product settings.

The integrated E2E script starts Presenter with an isolated profile, creates a 1920×1080 output, and changes a text slide in `Output.svelte` every two seconds. It uses the public package API through the Presenter bridge. With a completed Electron and frontend build, run from the repository root:

```powershell
$env:LVM_ELECTRON_EXE = 'C:\path\to\electron.exe' # if Electron is not installed in this worktree
node scripts/lvm/ndi-presenter-e2e.mjs --mode off --fps 30 --seconds 60 --output osr
node scripts/lvm/ndi-presenter-e2e.mjs --mode on --fps 30 --seconds 600 --output osr
node scripts/lvm/ndi-presenter-e2e.mjs --mode on --fps 60 --seconds 600 --output osr
```

Select the `LVM Presenter` source in Studio Monitor before the two ON runs. Verify that the text counter advances; script metrics alone cannot establish receiver visibility. Reports and any screenshots are saved under ignored `packages/lvm-ndi/.ndi-cache/integrated-runs/`. The script temporarily points `public/index.html` to the compiled frontend bundle and restores its original bytes on normal completion. `--output display` exercises the visible window and its frame subscription; `osr` exercises the offscreen output path. The script records per-process CPU/working set, main-process RSS, send timing, sender FPS, renderer `requestAnimationFrame` intervals, and UI evaluation latency. The latter is an interaction probe, not an exact paint-time measurement.

## NDI SDK 6.3 deprecations

The initial addon used `NDIlib_v5_load` and deprecated `NDIlib_*` members of the dynamically loaded function table. The SDK 6.3.2 header marks those declarations deprecated. The addon now resolves `NDIlib_v6_3_load` and uses `initialize`, `destroy`, `send_create`, `send_destroy`, and `send_send_video_v2`. The old `send_send_video` variant is also deprecated; this addon already used the current `v2` frame API. Native compilation and verification passed without deprecation warnings. Synchronous send and the reusable native pixel buffer remain in place.

## Integrated Windows measurements — 30 September 2026

Presenter rendered an updating text slide at 1920×1080. Studio Monitor displayed the `LVM Presenter` source at both 1080/30p and 1080/60p, with the counter advancing. The offscreen output used Presenter's existing `Output.svelte` and OSR frame path; it did not call the independent test-pattern sender.

| Path | Duration | Frames | Effective NDI FPS | Mean / peak send | Main-process RSS after warmup | Mean UI probe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NDI off, OSR, 30 target | 40 s | 0 | — | — | 289–297 MiB | 5.9 ms |
| NDI on, OSR, 30 target | 603 s | 17,684 | 29.11 | 14.54 / 99.19 ms | 286–313 MiB | 11.7 ms |
| NDI off, OSR, 60 target | 60 s | 0 | — | — | 286–288 MiB | 4.7 ms |
| NDI on, OSR, 60 target | 605 s | 35,627 | 58.42 | 14.46 / 101.94 ms | 285–315 MiB | 24.6 ms |
| NDI on, visible window, 30 target | 602 s | 17,715 | 29.18 | 5.53 / 63.33 ms | 199–270 MiB | 9.3 ms |
| NDI on, visible window, 60 target | 60 s | 3,739 | 57.13 | 6.11 / 47.07 ms | 246–282 MiB | 12.4 ms |

The main Electron process averaged 7.9% CPU in the OSR 30 run and 13.9% in the OSR 60 run, compared with 1.3% and 1.6% in the shorter NDI-off references. These percentages are reported by Electron's `app.getAppMetrics()` on this Windows machine. Renderer `requestAnimationFrame` intervals stayed near 16.7 ms in all OSR runs; they measure frame cadence, not GPU paint duration. No sender error or crash occurred; after removing the output, the sender reported `inactive`. RSS fluctuated after warmup without a sustained upward trend. The off references are shorter than the ten-minute ON runs, so their memory bands are not equivalent leak tests.

The initial visible-window `capturePage` path reached only 16.91 fps at a 30 fps target. The LVM-only consumer now uses Electron's `beginFrameSubscription(false, callback)` to receive full presentation frames from that same visible window, then reuses the latest frame at the configured send cadence. The local display remains visible, and Studio Monitor showed the same changing slide. This yielded 29.18 fps for ten minutes at 1080p30. If another capture consumer is enabled, Presenter leaves the exclusive subscription and returns to its shared capture path.

The visible-window 1080p60 run was stopped after one minute at the user's request. It reached 57.13 fps without an error. This is a measured limit for that path, not a ten-minute stability result; no further FPS runs are required for M7.8D. Studio Monitor is an external receiver used only to verify the NDI image, not a Presenter product window. The harness does not launch or own Studio Monitor. No sender async or double buffering was introduced.

## Cleanup gate

Closing an output through Presenter or directly through its window now stops capture, ends the LVM frame subscription, destroys the NDI sender, and removes the output from the registry. Presenter waits for output cleanup before quitting. The short `node scripts/lvm/ndi-presenter-lifecycle.mjs` check repeats create/remove/reopen, closes an output window directly, then starts Presenter again and quits with an active output. It uses an isolated profile, removes it afterward, verifies its Electron process exited, and never starts Studio Monitor. The longer measurement harness also separates and deletes its temporary profile while retaining its measurement reports.

## Scope and gate

No settings UI, audio, receiver, tally, metadata, async sender, or second NDI source is included. M7.8D closes after review of the integrated receiver image, existing ON/OFF measurements, unit tests, and cleanup. The SDK, runtime DLLs, and generated addon must remain outside Git. Product settings and packaging belong to M7.8E.
