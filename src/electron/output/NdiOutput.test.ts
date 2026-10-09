import { describe, expect, it, vi } from "vitest"
import { NdiOutput } from "./NdiOutput"

const frame = { data: new Uint8Array(320 * 180 * 4), width: 320, height: 180, stride: 320 * 4 }
const config = { name: "LVM Presenter", fps: 30 as const }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("LVM NdiOutput lifecycle", () => {
    it("runs inactive → starting → active → frames → inactive", async () => {
        const start = vi.fn(async () => {})
        const send = vi.fn()
        const stop = vi.fn(async () => {})
        const output = new NdiOutput(() => ({ start, send, stop }))
        expect(output.snapshot().state).toBe("inactive")
        output.enable(config)
        expect(output.snapshot().state).toBe("starting")
        output.push(frame)
        await tick()
        expect(output.snapshot().state).toBe("active")
        output.push(frame)
        expect(output.snapshot().sent).toBe(1)
        expect(send).toHaveBeenCalledWith(frame)
        await output.disable()
        expect(output.snapshot().state).toBe("inactive")
        expect(start).toHaveBeenCalledOnce()
        expect(stop).toHaveBeenCalledOnce()
    })

    it("isolates a missing runtime or failed addon from the caller", async () => {
        const failedStart = new NdiOutput(() => ({ start: async () => { throw new Error("runtime missing") }, send: () => {}, stop: async () => {} }))
        failedStart.enable(config)
        failedStart.push(frame)
        await tick()
        expect(failedStart.snapshot()).toMatchObject({ state: "error", error: "runtime missing" })
        expect(() => failedStart.push(frame)).not.toThrow()
        await failedStart.disable()

        const failedSend = new NdiOutput(() => ({ start: async () => {}, send: () => { throw new Error("addon send failed") }, stop: async () => {} }))
        failedSend.enable(config)
        failedSend.push(frame)
        await tick()
        expect(() => failedSend.push(frame)).not.toThrow()
        expect(failedSend.snapshot()).toMatchObject({ state: "error", error: "addon send failed" })
        await failedSend.disable()
    })

    it("releases a sender when disabled during start", async () => {
        let finishStart!: () => void
        const start = new Promise<void>((resolve) => { finishStart = resolve })
        const stop = vi.fn(async () => {})
        const output = new NdiOutput(() => ({ start: () => start, send: () => {}, stop }))
        output.enable(config)
        output.push(frame)
        const closing = output.disable()
        finishStart()
        await closing
        expect(output.snapshot().state).toBe("inactive")
        expect(stop).toHaveBeenCalledOnce()
    })

    it("survives repeated enable/disable without retaining senders", async () => {
        const stops: Array<ReturnType<typeof vi.fn>> = []
        const output = new NdiOutput(() => {
            const stop = vi.fn(async () => {})
            stops.push(stop)
            return { start: async () => {}, send: () => {}, stop }
        })
        for (let i = 0; i < 12; i++) {
            output.enable(config)
            output.push(frame)
            await tick()
            output.push(frame)
            await output.disable()
        }
        expect(stops).toHaveLength(12)
        expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true)
    })
})
