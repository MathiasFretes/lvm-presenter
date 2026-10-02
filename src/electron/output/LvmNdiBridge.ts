import { lvmNdiOutput, type NdiFrame } from "./NdiOutput"
import type { Output } from "../../types/Output"

// The development selector remains available to the isolated E2E scripts.
const requestedOutputId = process.env.LVM_NDI_OUTPUT_ID || ""
let boundOutputId = requestedOutputId === "first" ? "" : requestedOutputId
let productSelected = false
let fps: 30 | 60 = process.env.LVM_NDI_FPS === "60" ? 60 : 30
let name = process.env.LVM_NDI_SOURCE_NAME || "LVM Presenter"

export class LvmNdiBridge {
    static selected(id: string): boolean {
        return !!boundOutputId && id === boundOutputId
    }

    static enable(id: string, output?: Pick<Output, "lvmNdi" | "lvmNdiData">): void {
        if (!requestedOutputId && output?.lvmNdi) {
            if (boundOutputId && boundOutputId !== id) {
                console.warn(`[LVM NDI] output ${boundOutputId} is already selected; ${id} was ignored`)
                return
            }
            boundOutputId = id
            productSelected = true
            const savedName = output.lvmNdiData?.name
            name = typeof savedName === "string" && savedName.trim() ? savedName.trim() : "LVM Presenter"
            fps = output.lvmNdiData?.fps === 60 ? 60 : 30
        } else if (requestedOutputId === "first" && !boundOutputId) boundOutputId = id
        if (!this.selected(id)) return
        if (lvmNdiOutput.snapshot().state !== "inactive") return
        lvmNdiOutput.enable({ name, fps })
        console.info(`[LVM NDI] starting ${name} from output ${id} at ${fps} fps`)
    }

    static push(id: string, frame: NdiFrame): void {
        if (this.selected(id)) lvmNdiOutput.push(frame)
    }

    static async disable(id: string): Promise<void> {
        if (!this.selected(id)) return
        console.info("[LVM NDI] stopped:", lvmNdiOutput.snapshot())
        await lvmNdiOutput.disable()
        if (requestedOutputId === "first" || productSelected) boundOutputId = ""
        productSelected = false
    }

    static snapshot() {
        return { ...lvmNdiOutput.snapshot(), outputId: boundOutputId, name, configuredFps: fps }
    }

    static framerate(id: string): 30 | 60 {
        return this.selected(id) ? fps : 30
    }
}
