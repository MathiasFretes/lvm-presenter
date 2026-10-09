import { describe, expect, it } from "vitest"
import { physicalDisplayBounds } from "./physicalDisplayBounds"

describe("physicalDisplayBounds", () => {
    it("fits a 1080p physical output to a monitor using 125% Windows scaling", () => {
        const configured = { x: 0, y: 0, width: 1920, height: 1080 }
        const display = { bounds: { x: 0, y: 0, width: 1536, height: 864 }, scaleFactor: 1.25 }

        expect(physicalDisplayBounds(configured, [display])).toEqual(display.bounds)
    })

    it("preserves a deliberately smaller window and a monitor at 100%", () => {
        const display = { bounds: { x: 0, y: 0, width: 1536, height: 864 }, scaleFactor: 1.25 }
        expect(physicalDisplayBounds({ x: 0, y: 0, width: 1200, height: 700 }, [display])).toBeNull()
        expect(physicalDisplayBounds({ x: 0, y: 0, width: 1920, height: 1080 }, [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }])).toBeNull()
    })

    it("uses the origin of the configured display in a multiple-monitor setup", () => {
        const secondary = { bounds: { x: 1536, y: 0, width: 1536, height: 864 }, scaleFactor: 1.25 }
        expect(physicalDisplayBounds({ x: 1536, y: 0, width: 1920, height: 1080 }, [secondary])).toEqual(secondary.bounds)
        expect(physicalDisplayBounds({ x: 0, y: 0, width: 1920, height: 1080 }, [secondary])).toBeNull()
    })
})
