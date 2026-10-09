import type { Rectangle } from "electron"

type DisplayBounds = { bounds: Rectangle; scaleFactor: number }

// Output settings may contain the monitor's physical pixel size while Electron
// positions BrowserWindows in device-independent pixels (DIP).
export function physicalDisplayBounds(bounds: Rectangle, displays: DisplayBounds[]): Rectangle | null {
    const display = displays.find(({ bounds: displayBounds, scaleFactor }) => {
        if (scaleFactor <= 1 || bounds.x !== displayBounds.x || bounds.y !== displayBounds.y) return false
        return Math.abs(bounds.width - Math.round(displayBounds.width * scaleFactor)) <= 1 && Math.abs(bounds.height - Math.round(displayBounds.height * scaleFactor)) <= 1
    })

    return display ? { ...display.bounds } : null
}
