import type { LvmRemotePresentationState } from "../../types/IPC/ToMain"
import type { Project, Projects } from "../../types/Projects"
import type { Show, Shows } from "../../types/Show"

// Match the order used by the Presenter layout reference: parent, then children.
// This is read-only; a remote snapshot must never repair or change a show.
function slidesFor(show: Show | undefined, layoutId?: string) {
    if (!show) return []
    const layout = show.layouts[layoutId || ""] || show.layouts[show.settings.activeLayout]
    if (!layout) return []

    const ids: string[] = []
    for (const ref of layout.slides) {
        if (!show.slides[ref.id]) continue
        ids.push(ref.id)
        for (const rawChild of show.slides[ref.id].children || []) {
            const children = Array.isArray(rawChild) ? rawChild : [rawChild]
            for (const child of children) if (show.slides[child]) ids.push(child)
        }
    }
    return ids.map((id, index) => ({
        id,
        index,
        label: show.slides[id].group?.trim() || `Diapositiva ${index + 1}`
    }))
}

function projectFor(projects: Projects, selectedId: string | null, showId: string | undefined, projectIndex: number | undefined): [string, Project] | null {
    const selected = selectedId ? projects[selectedId] : undefined
    if (selected && (!showId || selected.shows.some((ref) => ref.id === showId))) return [selectedId!, selected]
    if (showId) {
        const match = Object.entries(projects).find(([_, project]) =>
            project.shows.some((ref, index) => ref.id === showId && (projectIndex === undefined || index === projectIndex)))
        if (match) return match
    }
    return selected && selectedId ? [selectedId, selected] : null
}

export function buildLvmRemoteSnapshot(input: {
    projects: Projects
    selectedProjectId: string | null
    shows: Shows
    showId?: string
    projectedSlide?: { index?: number; projectIndex?: number }
    isLive: boolean
    isCleared: boolean
}): LvmRemotePresentationState {
    const selected = projectFor(input.projects, input.selectedProjectId, input.showId, input.projectedSlide?.projectIndex)
    const items = selected?.[1].shows.map((ref, index) => {
        const show = input.shows[ref.id]
        const kind = typeof ref.data?.lvmServiceKind === "string"
            ? ref.data.lvmServiceKind.toLowerCase()
            : show?.reference?.type === "scripture" ? "scripture" : ref.type || "show"
        return {
            id: ref.id,
            index,
            title: ref.name || show?.name || `Elemento ${index + 1}`,
            kind,
            slides: (ref.type || "show") === "show" ? slidesFor(show, ref.layout) : []
        }
    }) || []
    const explicitIndex = input.projectedSlide?.projectIndex
    const itemIndex = explicitIndex !== undefined && items[explicitIndex]?.id === input.showId
        ? explicitIndex
        : items.findIndex((item) => item.id === input.showId)
    const activeItem = itemIndex >= 0 ? items[itemIndex] : null
    const activeShow = input.showId ? input.shows[input.showId] : undefined
    const slideIndex = input.projectedSlide?.index

    return {
        project: selected ? { id: selected[0], title: selected[1].name } : null,
        items,
        show: input.showId ? { id: input.showId, title: activeItem?.title || activeShow?.name || "Presentación" } : null,
        current: typeof slideIndex === "number" ? {
            itemIndex,
            slideIndex,
            slideCount: Math.max(1, activeItem?.slides.length || slidesFor(activeShow).length)
        } : null,
        output: { isLive: input.isLive, isCleared: input.isCleared }
    }
}
