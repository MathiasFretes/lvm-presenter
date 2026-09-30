import { lvmNdiOutput, type NdiFrame } from "./NdiOutput"

// M7.8D development gate. An explicit output ID prevents accidental extra NDI sources.
// No persisted settings or UI are introduced in this milestone.
const requestedOutputId = process.env.LVM_NDI_OUTPUT_ID || ""
let boundOutputId = requestedOutputId === "first" ? "" : requestedOutputId
const fps = process.env.LVM_NDI_FPS === "60" ? 60 : 30
const name = process.env.LVM_NDI_SOURCE_NAME || "LVM Presenter"

export class LvmNdiBridge {
    static selected(id: string): boolean {
        return !!boundOutputId && id === boundOutputId
    }

    static enable(id: string): void {
        if (requestedOutputId === "first" && !boundOutputId) boundOutputId = id
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
        if (requestedOutputId === "first") boundOutputId = ""
    }

    static snapshot() {
        return lvmNdiOutput.snapshot()
    }
}
