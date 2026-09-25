import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { serviceToProject } from './serviceToProject.mjs'

const example = JSON.parse(await readFile(new URL('../../examples/sunday-service.project', import.meta.url), 'utf8'))

test('example is a six item FreeShow project with ordered slides', () => {
    assert.equal(example.project.shows.length, 6)
    assert.equal(Object.keys(example.shows).length, 6)
    assert.deepEqual(example.project.shows.map(({ name }) => name), [
        'Canto de ejemplo', 'Segundo canto de ejemplo', 'Tercer canto de ejemplo',
        'Salmo 23:1', 'Encuentro de jóvenes', 'El buen pastor'
    ])
    const first = example.shows[example.project.shows[0].id]
    assert.equal(first.layouts[first.settings.activeLayout].slides.length, 2)
    assert.deepEqual(first.slides['song-1-1'].items[0].lines[0].chords[0], {
        id: 'song-1-1-0-0', pos: 0, key: 'G'
    })
    assert.equal(first.slides['song-1-1'].items[0].lines[0].text[0].value, 'Texto de muestra para ensayo')
})

test('invalid contracts are rejected before import', () => {
    assert.throws(() => serviceToProject({ schemaVersion: '1', id: 'x', title: 'x', startsAt: '2026-09-27', items: [{}] }), /Unsupported/)
    assert.throws(() => serviceToProject({ schemaVersion: '0.1', id: 'x', title: 'x', startsAt: '2026-09-27', items: [{ id: 'x', kind: 'UNKNOWN' }] }), /Unsupported service item/)
})
