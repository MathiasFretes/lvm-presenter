import assert from "node:assert/strict"
import { readFile, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { serviceToProject } from "./serviceToProject.mjs"

const example = JSON.parse(await readFile(new URL("../../examples/sunday-service.project", import.meta.url), "utf8"))
const hostileService = JSON.parse(await readFile(new URL("../../examples/hostile-service.json", import.meta.url), "utf8"))
const hostileProject = JSON.parse(await readFile(new URL("../../examples/hostile-service.project", import.meta.url), "utf8"))

test("example is a six item FreeShow project with ordered slides", () => {
    assert.equal(example.project.shows.length, 6)
    assert.equal(Object.keys(example.shows).length, 6)
    assert.deepEqual(
        example.project.shows.map(({ name }) => name),
        ["Canto de ejemplo", "Segundo canto de ejemplo", "Tercer canto de ejemplo", "Salmo 23:1", "Encuentro de jóvenes", "El buen pastor"]
    )
    const first = example.shows[example.project.shows[0].id]
    assert.equal(first.layouts[first.settings.activeLayout].slides.length, 2)
    assert.deepEqual(first.slides["song-1-1"].items[0].lines[0].chords[0], {
        id: "song-1-1-0-0",
        pos: 0,
        key: "G"
    })
    assert.equal(first.slides["song-1-1"].items[0].lines[0].text[0].value, "Texto de muestra para ensayo")
})

test("invalid contracts are rejected before import", () => {
    assert.throws(() => serviceToProject({ schemaVersion: "1", id: "x", title: "x", startsAt: "2026-09-27", items: [{}] }), /unsupported version 1/)
    assert.throws(() => serviceToProject({ schemaVersion: "0.1", id: "x", title: "x", startsAt: "2026-09-27T19:00:00Z", setlist: { id: "x", name: "x" }, items: [{ id: "x", kind: "UNKNOWN" }] }), /unsupported kind UNKNOWN/)
})

test("repeated sections, accents, emoji, chord offsets, and two verses survive conversion", () => {
    assert.deepEqual(serviceToProject(hostileService), hostileProject)
    assert.equal(hostileProject.project.shows.length, 5)
    const song = hostileProject.shows[hostileProject.project.shows[0].id]
    assert.equal(song.layouts[song.settings.activeLayout].slides.length, 7)
    const line = song.slides["song-1-1"].items[0].lines[0]
    assert.equal(line.text[0].value, "Señor, tú 😀 estás aquí")
    assert.equal(line.chords[2].pos, line.text[0].value.indexOf("estás"))
    assert.equal(hostileProject.project.shows[2].name, "Salmo 23:2")
})

test("invalid UTF-16 chord positions and missing nested fields are rejected", () => {
    const invalid = structuredClone(hostileService)
    invalid.items[0].song.sections[0].lines[0].chords[2].index = 11 // inside the emoji surrogate pair
    assert.throws(() => serviceToProject(invalid), /invalid UTF-16 offset/)
    delete invalid.items[0].song.sections[0].lines[0].chords[2].index
    assert.throws(() => serviceToProject(invalid), /invalid UTF-16 offset/)
    const missing = structuredClone(hostileService)
    delete missing.items[1].scripture.text
    assert.throws(() => serviceToProject(missing), /service.items\[1\].scripture.text/)
})

test("CLI rejects corrupt and future JSON without creating an output file", async () => {
    const folder = await mkdtemp(join(tmpdir(), "lvm-invalid-"))
    const input = join(folder, "input.json")
    const output = join(folder, "output.project")
    const script = new URL("../../scripts/lvm/service-to-project.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")
    try {
        for (const content of ["{bad json", JSON.stringify({ ...hostileService, schemaVersion: "0.2" })]) {
            await writeFile(input, content)
            const run = spawnSync(process.execPath, [script, input, output], { encoding: "utf8" })
            assert.equal(run.status, 1)
            assert.match(run.stderr, /Cannot import LVM Service:/)
            assert.equal(existsSync(output), false)
        }
    } finally {
        await unlink(input)
        await rmdir(folder)
    }
})
