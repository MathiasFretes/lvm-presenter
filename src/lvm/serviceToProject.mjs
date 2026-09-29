const ITEM_STYLE = "top:88px;left:50px;height:904px;width:1820px;"
const LAYOUT_ID = "lvm-default"

function fail(path, message) {
    throw new Error(`${path}: ${message}`)
}

function object(value, path, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object")
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "unknown field")
}

function string(value, path, optional = false) {
    if (optional && value === undefined) return
    if (typeof value !== "string" || !value.trim()) fail(path, "expected non-empty text")
}

function uniqueId(value, path, ids) {
    string(value, path)
    if (ids.has(value)) fail(path, `duplicate id ${value}`)
    ids.add(value)
}

function validChordIndex(text, index) {
    if (!Number.isInteger(index) || index < 0 || index > text.length) return false
    if (index > 0 && index < text.length) {
        const previous = text.charCodeAt(index - 1)
        const current = text.charCodeAt(index)
        if (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff) return false
    }
    return true
}

export function validateService(service) {
    object(service, "service", ["schemaVersion", "id", "title", "startsAt", "setlist", "items"])
    if (service.schemaVersion !== "0.1") fail("service.schemaVersion", `unsupported version ${String(service.schemaVersion)}; expected 0.1`)
    string(service.id, "service.id")
    string(service.title, "service.title")
    string(service.startsAt, "service.startsAt")
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(service.startsAt) || Number.isNaN(Date.parse(service.startsAt))) {
        fail("service.startsAt", "expected an ISO 8601 date and time with timezone")
    }
    object(service.setlist, "service.setlist", ["id", "name"])
    string(service.setlist.id, "service.setlist.id")
    string(service.setlist.name, "service.setlist.name")
    if (!Array.isArray(service.items) || !service.items.length) fail("service.items", "expected at least one item")
    const ids = new Set()
    service.items.forEach((item, itemIndex) => {
        const path = `service.items[${itemIndex}]`
        object(item, path, ["id", "kind", "song", "scripture", "announcement", "sermon"])
        uniqueId(item.id, `${path}.id`, ids)
        const payloadKey = { SONG: "song", SCRIPTURE: "scripture", ANNOUNCEMENT: "announcement", SERMON: "sermon" }[item.kind]
        if (!payloadKey) fail(`${path}.kind`, `unsupported kind ${String(item.kind)}`)
        for (const key of ["song", "scripture", "announcement", "sermon"]) {
            if (key !== payloadKey && key in item) fail(`${path}.${key}`, "payload does not match kind")
        }
        if (item.kind === "SONG") {
            const song = item.song
            object(song, `${path}.song`, ["id", "title", "key", "sections"])
            string(song.id, `${path}.song.id`)
            string(song.title, `${path}.song.title`)
            if (typeof song.key !== "string") fail(`${path}.song.key`, "expected text")
            if (!Array.isArray(song.sections) || !song.sections.length) fail(`${path}.song.sections`, "expected at least one section")
            song.sections.forEach((section, sectionIndex) => {
                const sectionPath = `${path}.song.sections[${sectionIndex}]`
                object(section, sectionPath, ["kind", "label", "lines"])
                string(section.kind, `${sectionPath}.kind`)
                string(section.label, `${sectionPath}.label`)
                if (!Array.isArray(section.lines) || !section.lines.length) fail(`${sectionPath}.lines`, "expected at least one line")
                section.lines.forEach((line, lineIndex) => {
                    const linePath = `${sectionPath}.lines[${lineIndex}]`
                    object(line, linePath, ["text", "chords"])
                    string(line.text, `${linePath}.text`)
                    if (!Array.isArray(line.chords)) fail(`${linePath}.chords`, "expected an array")
                    line.chords.forEach((chord, chordIndex) => {
                        const chordPath = `${linePath}.chords[${chordIndex}]`
                        object(chord, chordPath, ["symbol", "index"])
                        string(chord.symbol, `${chordPath}.symbol`)
                        if (!validChordIndex(line.text, chord.index)) fail(`${chordPath}.index`, "invalid UTF-16 offset or split surrogate pair")
                    })
                })
            })
        } else if (item.kind === "SCRIPTURE") {
            object(item.scripture, `${path}.scripture`, ["reference", "version", "text", "source"])
            for (const key of ["reference", "version", "text"]) string(item.scripture[key], `${path}.scripture.${key}`)
            if (item.scripture.source !== undefined) string(item.scripture.source, `${path}.scripture.source`)
        } else {
            const payload = item[payloadKey]
            object(payload, `${path}.${payloadKey}`, ["title", "body"])
            string(payload.title, `${path}.${payloadKey}.title`)
            string(payload.body, `${path}.${payloadKey}.body`)
        }
    })
    return service
}

function textSlide(id, lines, group = "") {
    return {
        id,
        group,
        color: null,
        settings: {},
        notes: "",
        items: [
            {
                style: ITEM_STYLE,
                lines: lines.map((line, lineIndex) => ({
                    align: "",
                    text: [{ value: typeof line === "string" ? line : line.text, style: "" }],
                    ...(typeof line === "string" || !line.chords?.length
                        ? {}
                        : {
                              chords: line.chords.map(({ symbol, index }, chordIndex) => ({
                                  id: `${id}-${lineIndex}-${chordIndex}`,
                                  pos: index,
                                  key: symbol
                              }))
                          })
                }))
            }
        ]
    }
}

function slidesFor(item) {
    if (item.kind === "SONG") {
        if (!item.song?.title || !Array.isArray(item.song.sections) || !item.song.sections.length) {
            throw new Error(`Invalid song item ${item.id}`)
        }
        return item.song.sections.map((section, index) => {
            const lines = section.lines?.filter((line) => line.text)
            if (!lines?.length) throw new Error(`Empty song section in ${item.id}`)
            return textSlide(`${item.id}-${index + 1}`, lines, section.label || section.kind)
        })
    }
    if (item.kind === "SCRIPTURE") {
        if (!item.scripture?.reference || !item.scripture?.version || !item.scripture?.text) {
            throw new Error(`Scripture ${item.id} needs local text and translation`)
        }
        return [textSlide(item.id, [item.scripture.text, `${item.scripture.reference} · ${item.scripture.version}`], "scripture")]
    }
    if (item.kind === "ANNOUNCEMENT") {
        if (!item.announcement?.title || !item.announcement?.body) throw new Error(`Invalid announcement ${item.id}`)
        return [textSlide(item.id, [item.announcement.title, item.announcement.body], "announcement")]
    }
    if (item.kind === "SERMON") {
        if (!item.sermon?.title || !item.sermon?.body) throw new Error(`Invalid sermon ${item.id}`)
        return [textSlide(item.id, [item.sermon.title, item.sermon.body], "sermon")]
    }
    throw new Error(`Unsupported service item kind: ${item.kind}`)
}

function itemTitle(item) {
    if (item.kind === "SONG") return item.song.title
    if (item.kind === "SCRIPTURE") return item.scripture.reference
    if (item.kind === "ANNOUNCEMENT") return item.announcement.title
    return item.sermon.title
}

export function serviceToProject(service) {
    validateService(service)
    const created = Date.parse(service.startsAt)
    if (Number.isNaN(created)) throw new Error("Invalid service date")

    const shows = {}
    const refs = []
    const usedIds = new Set()
    for (const item of service.items) {
        if (!item?.id || usedIds.has(item.id)) throw new Error(`Duplicate or missing item id: ${item?.id}`)
        usedIds.add(item.id)
        const id = `lvm-${service.id}-${item.id}`
        const slides = slidesFor(item)
        const title = itemTitle(item)
        const slideMap = Object.fromEntries(slides.map(({ id: slideId, ...slide }) => [slideId, slide]))
        shows[id] = {
            name: title,
            origin: "lvm",
            private: false,
            category: null,
            settings: { activeLayout: LAYOUT_ID, template: null },
            timestamps: { created, modified: null, used: null },
            meta: { title, ...(item.kind === "SONG" ? { key: item.song.key } : {}) },
            slides: slideMap,
            layouts: { [LAYOUT_ID]: { name: "Servicio", notes: "", slides: slides.map(({ id: slideId }) => ({ id: slideId })) } },
            media: {}
        }
        refs.push({ id, name: title, type: "show" })
    }

    return {
        project: { id: `lvm-${service.id}`, name: service.title, created, parent: "/", shows: refs },
        parentFolder: "",
        shows
    }
}
