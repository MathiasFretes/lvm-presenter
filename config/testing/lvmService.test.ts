import { _electron as electron } from "playwright"
import { expect, test } from "@playwright/test"
import { resolve } from "node:path"
import tmp from "tmp"

test("imports and previews the offline Sunday service", async () => {
    const settings = tmp.dirSync({ unsafeCleanup: true })
    const data = tmp.dirSync({ unsafeCleanup: true })
    const app = await electron.launch({
        args: [".", "--no-sandbox"],
        env: { ...process.env, NODE_ENV: "production", FS_MOCK_STORE_PATH: settings.name }
    })
    try {
        await app.evaluate(({ dialog }, folder) => {
            dialog.showOpenDialog = async (): Promise<any> => ({ canceled: false, filePaths: [folder] })
        }, data.name)

        let window = app.windows().find((w) => w.url().includes("index.html"))
        for (let i = 0; i < 40 && !window; i++) {
            await new Promise((r) => setTimeout(r, 500))
            window = app.windows().find((w) => w.url().includes("index.html"))
        }
        if (!window) throw new Error("Main window did not open")
        await window.locator(".popup button.start, .top").first().waitFor({ timeout: 30000 })
        const setup = window.locator(".popup button.start")
        if (await setup.count()) {
            const popup = window.locator(".popup")
            await popup.locator(".dropdown-trigger").first().click()
            await popup.locator("li[role=option]").filter({ hasText: "English" }).first().click()
            await popup.locator(".button-trigger").first().click()
            await setup.click()
            await window.locator("#guideButtons").getByText("Skip").click({ timeout: 30000 })
        }

        await app.evaluate(({ dialog }, file) => {
            dialog.showOpenDialog = async (): Promise<any> => ({ canceled: false, filePaths: [file] })
        }, resolve("examples/sunday-service.project"))

        await window.locator(".addButton").first().click()
        await window.locator(".addMenu").getByText("Import").click()
        await expect(window.locator(".popup").getByText("Imported!")).toBeVisible({ timeout: 30000 })
        await window.locator(".popup button").first().click()
        await expect(window.getByText("Culto General").first()).toBeVisible({ timeout: 30000 })
        await window.getByText("Culto General").first().click()
        await expect(window.getByText("Canto de ejemplo").first()).toBeVisible()
        await expect(window.getByText(/Salmo 23[:,]1/).first()).toBeVisible()
        await window.getByText("Canto de ejemplo").first().click()
        await expect(window.getByText("Texto de muestra para ensayo").first()).toBeVisible({ timeout: 30000 })
        await window.getByText("Texto de muestra para ensayo").first().click()
        await expect(window.locator(".previewOutput").getByText("Texto de muestra para ensayo").first()).toBeVisible({ timeout: 30000 })
    } finally {
        await app.close().catch(() => {})
        settings.removeCallback()
        data.removeCallback()
    }
})
