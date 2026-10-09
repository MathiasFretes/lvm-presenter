import { describe, expect, it } from "vitest"
import { resolveBrowserLocale } from "./languageData"

describe("Presenter browser locale", () => {
    it("uses the Spanish UI for regional Spanish on first launch", () => {
        expect(resolveBrowserLocale("es-PY")).toBe("es")
        expect(resolveBrowserLocale("es-ES")).toBe("es")
        expect(resolveBrowserLocale("es-419")).toBe("es")
    })

    it("keeps supported locales and falls back for unknown ones", () => {
        expect(resolveBrowserLocale("en-GB")).toBe("en_GB")
        expect(resolveBrowserLocale("pt-BR")).toBe("pt_BR")
        expect(resolveBrowserLocale("xx-YY")).toBe("en")
    })
})
