import { describe, expect, it } from "vitest"
import type { Projects } from "../../types/Projects"
import type { Shows } from "../../types/Show"
import { buildLvmRemoteSnapshot } from "./lvmRemoteSnapshot"

const projects: Projects = {
    sunday: {
        name: "Culto Domingo", created: 1, parent: "/",
        shows: [
            { id: "welcome", name: "Bienvenida", type: "show" },
            { id: "song", name: "Cuán grande es Él", type: "show", data: { lvmServiceKind: "SONG" } },
            { id: "bible", name: "Salmo 23", type: "show", data: { lvmServiceKind: "SCRIPTURE" } }
        ]
    }
}
const slides = (values: [string, string | null][]) => Object.fromEntries(values.map(([id, group]) =>
    [id, { group, children: [], color: null, settings: {}, notes: "", items: [] }]))
const shows: Shows = {
    welcome: { name: "Bienvenida", settings: { activeLayout: "main", template: null }, slides: slides([["w1", null]]), layouts: { main: { name: "Main", notes: "", slides: [{ id: "w1" }] } } } as Shows[string],
    song: { name: "Cuán grande es Él", settings: { activeLayout: "main", template: null }, slides: {
        ...slides([["verse", "Verso"], ["chorus", "Coro"]]),
        verse: { ...slides([["verse", "Verso"]]).verse, children: ["chorus"] }
    }, layouts: { main: { name: "Main", notes: "", slides: [{ id: "verse" }] } } } as Shows[string],
    bible: { name: "Salmo 23", settings: { activeLayout: "main", template: null }, slides: slides([["b1", "Escritura"]]), layouts: { main: { name: "Main", notes: "", slides: [{ id: "b1" }] } } } as Shows[string]
}

describe("LVM remote rich snapshot", () => {
    it("sends ordered project items, types, and flattened slide labels", () => {
        const state = buildLvmRemoteSnapshot({ projects, selectedProjectId: "sunday", shows,
            showId: "song", projectedSlide: { index: 1, projectIndex: 1 }, isLive: true, isCleared: false })
        expect(state.project?.title).toBe("Culto Domingo")
        expect(state.items?.map((item) => [item.title, item.kind])).toEqual([
            ["Bienvenida", "show"], ["Cuán grande es Él", "song"], ["Salmo 23", "scripture"]
        ])
        expect(state.items?.[1].slides.map((slide) => slide.label)).toEqual(["Verso", "Coro"])
        expect(state.current).toEqual({ itemIndex: 1, slideIndex: 1, slideCount: 2 })
    })

    it("keeps the projected item active even when operator selection changes during blackout", () => {
        const state = buildLvmRemoteSnapshot({ projects, selectedProjectId: "sunday", shows,
            showId: "song", projectedSlide: { index: 0, projectIndex: 1 }, isLive: true, isCleared: true })
        expect(state.current?.itemIndex).toBe(1)
        expect(state.output.isCleared).toBe(true)
    })
})
