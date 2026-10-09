import { describe, expect, it, vi } from "vitest"

describe("LVM NDI product output selection", () => {
    it("uses the saved source configuration and releases the single source on disable", async () => {
        vi.stubEnv("LVM_NDI_OUTPUT_ID", "")
        vi.resetModules()
        const { LvmNdiBridge } = await import("./LvmNdiBridge")

        LvmNdiBridge.enable("main", { lvmNdi: true, lvmNdiData: { name: "  Iglesia Central  ", fps: 60 } })
        expect(LvmNdiBridge.snapshot()).toMatchObject({ state: "starting", outputId: "main", name: "Iglesia Central", configuredFps: 60 })
        expect(LvmNdiBridge.framerate("main")).toBe(60)

        LvmNdiBridge.enable("second", { lvmNdi: true, lvmNdiData: { name: "Second", fps: 30 } })
        expect(LvmNdiBridge.selected("second")).toBe(false)
        expect(LvmNdiBridge.snapshot().outputId).toBe("main")

        await LvmNdiBridge.disable("main")
        expect(LvmNdiBridge.snapshot()).toMatchObject({ state: "inactive", outputId: "" })

        LvmNdiBridge.enable("second", { lvmNdi: true, lvmNdiData: { name: "Second", fps: 30 } })
        expect(LvmNdiBridge.snapshot()).toMatchObject({ state: "starting", outputId: "second", configuredFps: 30 })
        await LvmNdiBridge.disable("second")
        vi.unstubAllEnvs()
    })
})
