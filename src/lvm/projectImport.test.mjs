import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { parseProjectImport } from "./projectImport.mjs"

const service = await readFile(new URL("../../examples/hostile-service.json", import.meta.url), "utf8")
const project = JSON.parse(await readFile(new URL("../../examples/hostile-service.project", import.meta.url), "utf8"))
test("opens the actual Service JSON as the canonical project without a CLI conversion", () => {
    assert.deepEqual(parseProjectImport(service), project)
})
test("preserves existing Presenter projects", () => {
    assert.deepEqual(parseProjectImport(JSON.stringify(project)), project)
})
test("rejects malformed or unsupported Service before an import mutates stores", () => {
    assert.throws(() => parseProjectImport("{"), SyntaxError)
    assert.throws(() => parseProjectImport("[]"), /Expected/)
    assert.throws(() => parseProjectImport("{}"), /Expected/)
    const changed = JSON.parse(service)
    changed.schemaVersion = "9"
    assert.throws(() => parseProjectImport(JSON.stringify(changed)), /unsupported version/)
    changed.schemaVersion = "0.1"
    changed.items[0].kind = "UNSUPPORTED"
    assert.throws(() => parseProjectImport(JSON.stringify(changed)), /unsupported kind/)
})
