# Presenter flow audit

## Project to output

`src/frontend/components/show/Projects.svelte` lists project folders and sends `Main.IMPORT` for `.project` files. Electron reads that file in `src/electron/data/import.ts`, then sends it through `src/frontend/IPC/responsesMain.ts` to `src/frontend/converters/project.ts::importProject`. That importer creates show records and the project through `history`. A `Project` owns ordered `ProjectShowRef` entries (`src/types/Projects.ts`); each `Show` owns slide data and one or more layouts (`src/types/Show.ts`). `ProjectContentList.svelte` opens the selected show; `components/show/Slides.svelte` resolves layout refs and clicking a slide calls output helpers (`setOutput`/`updateOut`). Output components under `components/output/` render the selected slide. The service adapter targets only the `.project` import format, leaving this path intact.

## Bible to output

The Bible drawer at `src/frontend/components/drawer/bible/Scripture.svelte` lets an operator browse versions/books/chapters and select verses. `src/frontend/components/drawer/bible/scripture.ts::createScriptureShow` turns the selection into a Show; `src/frontend/components/context/menuClick.ts` also invokes it from verse context actions. The generated Show follows the same slide and output path as other shows. The LVM fixture embeds the verse text and version directly and imports it as a regular one-slide Show. This avoids a runtime Bible download in the offline slice; Bible library ingestion and licensing remain a separate concern.

## Boundary and remaining work

The adapter accepts a versioned service file and emits FreeShow's documented-by-code export shape (`components/export/project.ts`). The first implementation uses the default text item geometry from `converters/chordpro.ts`, one slide per song section, and simple text slides for other items. The local project import is the stable handoff point. Native in-app Service editing, shared branding, data synchronization, richer layouts, and automatic output selection are later product work.
