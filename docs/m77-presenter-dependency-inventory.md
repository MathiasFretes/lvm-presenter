# M7.7 Presenter independence inventory

Status: audited before removal. Scope: the Electron build blockers and their visible controls. `main` is unchanged.

| Dependency / route | Current use and files | LVM replacement | Decision |
| --- | --- | --- | --- |
| `grandiose` | Legacy NDI sender in `src/electron/ndi/{NdiSender,ndiWorker,talk}.ts`; receiver in `NdiReceiver.ts` and the NDI section of `capture/streamReceiverProcess.ts`. Audio, capture and output helpers import the sender. The package is already absent from `package.json` and the lockfile. | `packages/lvm-ndi` replaces **sender only** and is proven with Presenter output frames. | Retire legacy sender and its UI/configuration path. Disable NDI **input** until a first-party receiver exists; do not claim the sender replaces input. Keep OMT input working. |
| `macadam` / Blackmagic / DeckLink | `src/electron/blackmagic/*`, output and capture helpers, audio sink and `BLACKMAGIC` IPC. `macadamLoader.ts` currently always returns `null`; hardware output/input therefore cannot start even before this cleanup. The package is already absent. | None. | Mark DeckLink unavailable and keep it optional. Do not implement a new sender or receiver in M7.7. Ensure its absence cannot break TypeScript or Presenter startup. |
| `slideshow` | `src/electron/output/ppt/presentation.ts` still references an undefined `Slideshow` class and is exposed through three main IPC actions; `PowerPointPreview.svelte` requests it. The package is already absent. | None. | Disable external PowerPoint/Keynote control with a clear unavailable response. Keep `libreConverter.ts` and `pptToShow.ts`: file conversion/import is a separate existing feature. |

The older NDI input, DeckLink hardware and external slideshow controls are **not** covered by LVM NDI 0.1. They remain future capabilities and must not be presented as working features in the product. This milestone preserves the presentation engine, local outputs, LVM NDI sender, and file import/conversion.

## Final gate

- `a524130` is an ancestor of `0529207`: this cleanup includes the completed LVM NDI integration.
- `grandiose`: DEAD. `macadam`: OPTIONAL capability with no installed package. `slideshow`: DEAD external controller. None of these three packages is declared in `package.json` or `package-lock.json`; no lockfile regeneration is needed.
- `npm ci`, Electron TypeScript build, production build, 164 unit tests and an isolated Presenter startup/shutdown smoke passed. No SDK binary, DLL, LIB or `.node` file was added to Git.
- `npm run test:svelte` reports 189 errors, 62 warnings and 242 hints on both `main` and this branch. Comparing errors by file and message found zero new diagnostics, zero removed diagnostics and zero errors in Svelte files changed by M7.7. These diagnostics remain existing project debt outside this cleanup.
