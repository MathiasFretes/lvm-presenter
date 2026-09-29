# LVM Service import 0.1

FreeShow remains the projection engine. The pure adapter `src/lvm/serviceToProject.mjs` converts the portable LVM Service JSON to FreeShow's existing `.project` format; `scripts/lvm/service-to-project.mjs` is a local CLI. It does not add an API, database, or renderer.

Use Node 22.23.0 (`.node-version`), run `npm ci`, and then:

```powershell
npm run lvm:service-to-project -- C:\la-voz-misionera\fixtures\sunday-service.json examples\sunday-service.project
npm run build
npm start
```

In FreeShow, use **Projects → Add → Import** to choose `examples/sunday-service.project`, open **Culto General**, select a show, and click a slide to present it. The committed example was generated from the canonical fixture in Worship. It includes three songs, one scripture slide, one announcement slide, and one sermon slide. Every song section becomes a slide. Lyrics and chord positions are translated into FreeShow `Line` data, preserving chords even when an output theme hides them. The translation name and citation text are part of the scripture slide.

The adapter accepts `schemaVersion: "0.1"` and requires local scripture text. It rejects missing or duplicate item IDs and unsupported item types. It currently supports `SONG`, `SCRIPTURE`, `ANNOUNCEMENT`, and `SERMON`. Project and show IDs are deterministic for a given service; reimporting may replace an earlier version with the same service ID, so save or duplicate a customized project before reimporting. Themes, media, timers, and live updates remain outside this contract.

M5 adds strict nested validation before the project is built. Unknown fields, missing text, malformed chord offsets, and future schema versions produce a path-specific error and no output file. Chord positions are UTF-16 code-unit offsets, and offsets inside an emoji surrogate pair are rejected. The portable contract contains no layout dimensions; `ITEM_STYLE` is a Presenter rendering choice. `examples/hostile-service.json` is a copy of Worship's canonical M5 fixture for independent CI, with `examples/hostile-service.project` generated from it.

## Verification

- `npm run test:lvm`: contract mapping and invalid input.
- `npm run test:unit`: existing FreeShow unit suite.
- `npm run build`: local production Electron and frontend build. CI compiles the frontend, server files, and Electron TypeScript separately; the inherited `postbuild` bundles native Opus files that are absent when installation scripts are disabled.
- `npm run test:playwright -- --grep "offline Sunday service"`: local Windows check with native dependencies installed; launches Electron with isolated local data, imports the example file, opens a show, and sends a slide to the output preview. The CI job runs the contract, unit suite, and build with install scripts disabled because the inherited `grandiose` git dependency requires a native NDI toolchain on the hosted runner.
- `npx playwright test --config config/testing/playwright.config.ts config/testing/lvmService.test.ts`: local Windows checks for both fixtures. The M5 case blocks HTTP and HTTPS in Electron, imports the hostile project, saves it to disk, closes the app, relaunches with the same isolated data, opens the song, and sends its repeated chorus to the output preview.
