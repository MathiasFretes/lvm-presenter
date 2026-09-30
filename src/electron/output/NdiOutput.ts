import path from "path"

export type NdiOutputState = "inactive" | "starting" | "active" | "error"
export type NdiFrame = { data: Uint8Array; width: number; height: number; stride: number }
export type NdiOutputConfig = { name: string; fps: 30 | 60 }

type Sender = {
    start(config: NdiOutputConfig & { width: number; height: number; format: "BGRA" }): Promise<void>
    send(frame: NdiFrame): void
    stop(): Promise<void>
}

function createSender(): Sender {
    // Both src/electron/output and build/electron/output are three levels below the repo root.
    // This is the public package entry point; Presenter never loads the native addon directly.
    const entry = path.resolve(__dirname, "../../../packages/lvm-ndi/src/index.mjs")
    const { NdiSender } = require(entry)
    return new NdiSender()
}

export class NdiOutput {
    private readonly senderFactory: () => Sender
    private sender: Sender | null = null
    private pendingStart: Promise<void> | null = null
    private pendingStop: Promise<void> | null = null
    private config: NdiOutputConfig | null = null
    private dimensions: { width: number; height: number } | null = null
    private generation = 0
    private state: NdiOutputState = "inactive"
    private error: string | null = null
    private sent = 0
    private sendTotalMs = 0
    private sendMaxMs = 0
    private firstSentAt = 0
    private lastSentAt = 0

    constructor(senderFactory: () => Sender = createSender) {
        this.senderFactory = senderFactory
    }

    enable(config: NdiOutputConfig): void {
        if (this.state !== "inactive") throw new Error("LVM NDI output must be disabled before enabling again")
        if (!config.name.trim() || (config.fps !== 30 && config.fps !== 60)) throw new Error("Invalid LVM NDI output configuration")
        this.generation++
        this.config = { ...config }
        this.state = "starting"
        this.error = null
        this.sent = this.sendTotalMs = this.sendMaxMs = this.firstSentAt = this.lastSentAt = 0
    }

    push(frame: NdiFrame): void {
        if (!this.config || this.state === "inactive" || this.state === "error") return
        if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 2 || frame.height < 1 || frame.width % 2 ||
            frame.stride < frame.width * 4 || frame.data.byteLength < frame.stride * (frame.height - 1) + frame.width * 4) {
            this.fail(new Error("Invalid BGRA frame from Presenter output"))
            return
        }
        if (this.state === "starting") {
            if (!this.pendingStart) this.start(frame)
            return
        }
        if (!this.dimensions || this.dimensions.width !== frame.width || this.dimensions.height !== frame.height) {
            this.fail(new Error("Presenter output resolution changed; disable and re-enable LVM NDI"))
            return
        }
        try {
            const before = performance.now()
            this.sender!.send(frame)
            const elapsed = performance.now() - before
            this.sent++
            this.sendTotalMs += elapsed
            this.sendMaxMs = Math.max(this.sendMaxMs, elapsed)
            if (!this.firstSentAt) this.firstSentAt = before
            this.lastSentAt = performance.now()
        } catch (error) {
            this.fail(error)
        }
    }

    private start(frame: NdiFrame): void {
        const generation = this.generation
        const config = this.config!
        let next: Sender
        try {
            next = this.senderFactory()
        } catch (error) {
            this.fail(error)
            return
        }
        this.pendingStart = (async () => {
            try {
                await next.start({ ...config, width: frame.width, height: frame.height, format: "BGRA" })
                if (generation !== this.generation) {
                    await next.stop()
                    return
                }
                this.sender = next
                this.dimensions = { width: frame.width, height: frame.height }
                this.state = "active"
            } catch (error) {
                if (generation === this.generation) this.fail(error)
                try { await next.stop() } catch { /* preserve the original error */ }
            } finally {
                this.pendingStart = null
            }
        })()
    }

    private fail(error: unknown): void {
        this.error = error instanceof Error ? error.message : String(error)
        this.state = "error"
        const sender = this.sender
        this.sender = null
        if (sender) this.pendingStop = sender.stop().catch((stopError) => console.error("LVM NDI cleanup failed:", stopError))
        console.error("LVM NDI output failed:", this.error)
    }

    async disable(): Promise<void> {
        this.generation++
        this.config = null
        this.state = "inactive"
        const sender = this.sender
        this.sender = null
        await this.pendingStart
        if (sender) await sender.stop()
        await this.pendingStop
        this.pendingStop = null
        this.dimensions = null
    }

    snapshot() {
        const elapsedSeconds = this.firstSentAt ? (this.lastSentAt - this.firstSentAt) / 1000 : 0
        return { state: this.state, error: this.error, sent: this.sent,
            fps: elapsedSeconds > 0 ? (this.sent - 1) / elapsedSeconds : 0,
            sendMeanMs: this.sent ? this.sendTotalMs / this.sent : 0, sendMaxMs: this.sendMaxMs,
            width: this.dimensions?.width ?? 0, height: this.dimensions?.height ?? 0 }
    }
}

export const lvmNdiOutput = new NdiOutput()
