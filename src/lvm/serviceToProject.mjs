const ITEM_STYLE = 'top:88px;left:50px;height:904px;width:1820px;'
const LAYOUT_ID = 'lvm-default'

function textSlide(id, lines, group = '') {
    return {
        id,
        group,
        color: null,
        settings: {},
        notes: '',
        items: [{
            style: ITEM_STYLE,
            lines: lines.map((line, lineIndex) => ({
                align: '',
                text: [{ value: typeof line === 'string' ? line : line.text, style: '' }],
                ...(typeof line === 'string' || !line.chords?.length ? {} : {
                    chords: line.chords.map(({ symbol, index }, chordIndex) => ({
                        id: `${id}-${lineIndex}-${chordIndex}`,
                        pos: index,
                        key: symbol
                    }))
                })
            }))
        }]
    }
}

function slidesFor(item) {
    if (item.kind === 'SONG') {
        if (!item.song?.title || !Array.isArray(item.song.sections) || !item.song.sections.length) {
            throw new Error(`Invalid song item ${item.id}`)
        }
        return item.song.sections.map((section, index) => {
            const lines = section.lines?.filter((line) => line.text)
            if (!lines?.length) throw new Error(`Empty song section in ${item.id}`)
            return textSlide(`${item.id}-${index + 1}`, lines, section.label || section.kind)
        })
    }
    if (item.kind === 'SCRIPTURE') {
        if (!item.scripture?.reference || !item.scripture?.version || !item.scripture?.text) {
            throw new Error(`Scripture ${item.id} needs local text and translation`)
        }
        return [textSlide(item.id, [item.scripture.text, `${item.scripture.reference} · ${item.scripture.version}`], 'scripture')]
    }
    if (item.kind === 'ANNOUNCEMENT') {
        if (!item.announcement?.title || !item.announcement?.body) throw new Error(`Invalid announcement ${item.id}`)
        return [textSlide(item.id, [item.announcement.title, item.announcement.body], 'announcement')]
    }
    if (item.kind === 'SERMON') {
        if (!item.sermon?.title || !item.sermon?.body) throw new Error(`Invalid sermon ${item.id}`)
        return [textSlide(item.id, [item.sermon.title, item.sermon.body], 'sermon')]
    }
    throw new Error(`Unsupported service item kind: ${item.kind}`)
}

function itemTitle(item) {
    if (item.kind === 'SONG') return item.song.title
    if (item.kind === 'SCRIPTURE') return item.scripture.reference
    if (item.kind === 'ANNOUNCEMENT') return item.announcement.title
    return item.sermon.title
}

export function serviceToProject(service) {
    if (service?.schemaVersion !== '0.1' || !service.id || !service.title || !Array.isArray(service.items) || !service.items.length) {
        throw new Error('Unsupported or incomplete LVM service')
    }
    const created = Date.parse(service.startsAt)
    if (Number.isNaN(created)) throw new Error('Invalid service date')

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
            origin: 'lvm',
            private: false,
            category: null,
            settings: { activeLayout: LAYOUT_ID, template: null },
            timestamps: { created, modified: null, used: null },
            meta: { title, ...(item.kind === 'SONG' ? { key: item.song.key } : {}) },
            slides: slideMap,
            layouts: { [LAYOUT_ID]: { name: 'Servicio', notes: '', slides: slides.map(({ id: slideId }) => ({ id: slideId })) } },
            media: {}
        }
        refs.push({ id, name: title, type: 'show' })
    }

    return {
        project: { id: `lvm-${service.id}`, name: service.title, created, parent: '/', shows: refs },
        parentFolder: '',
        shows
    }
}
