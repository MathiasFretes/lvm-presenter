import { _electron as electron } from "playwright"
import { expect, test } from "@playwright/test"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import tmp from "tmp"

async function findMainWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
    let window = app.windows().find((w) => w.url().includes("index.html"))
    for (let i = 0; i < 40 && !window; i++) {
        await new Promise((r) => setTimeout(r, 500))
        window = app.windows().find((w) => w.url().includes("index.html"))
    }
    if (!window) throw new Error("Main window did not open")
    await window.locator(".popup button.start, .top").first().waitFor({ timeout: 30000 })
    return window
}

async function blockInternet(app: Awaited<ReturnType<typeof electron.launch>>) {
    await app.evaluate(({ session }) => {
        session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_details, callback) => callback({ cancel: true }))
    })
}

async function closeApp(app: Awaited<ReturnType<typeof electron.launch>>) {
    const child = app.process()
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5000))])
    if (child && !child.killed) child.kill("SIGKILL")
    await new Promise((resolve) => setTimeout(resolve, 1000))
}

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

        const window = await findMainWindow(app)
        await blockInternet(app)
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
        await closeApp(app)
        settings.removeCallback()
        data.removeCallback()
    }
})

test("imports a hostile service, restarts offline, and presents its repeated chorus", async () => {
    const settings = tmp.dirSync({ unsafeCleanup: true })
    const data = tmp.dirSync({ unsafeCleanup: true })
    const environment = { ...process.env, NODE_ENV: "production", FS_MOCK_STORE_PATH: settings.name }
    let app = await electron.launch({ args: [".", "--no-sandbox"], env: environment })
    try {
        await app.evaluate(({ dialog }, folder) => {
            dialog.showOpenDialog = async (): Promise<any> => ({ canceled: false, filePaths: [folder] })
        }, data.name)
        let window = await findMainWindow(app)
        await blockInternet(app)
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
        }, resolve("examples/hostile-service.project"))
        await window.locator(".addButton").first().click()
        await window.locator(".addMenu").getByText("Import").click()
        await expect(window.locator(".popup").getByText("Imported!")).toBeVisible({ timeout: 30000 })
        await window.locator(".popup button").first().click()
        await expect(window.getByText("Culto de prueba — ñ, á, 😀").first()).toBeVisible({ timeout: 30000 })
        await window.getByText("Culto de prueba — ñ, á, 😀").first().click()
        await expect(window.getByText("Señor, aquí estás 😀").first()).toBeVisible()
        // First-launch setup may still be saving. Retry the user's Save shortcut
        // until the imported project is actually on disk before closing.
        await expect
            .poll(
                async () => {
                    await window.keyboard.press("Control+s")
                    const stored = JSON.parse(await readFile(join(settings.name, "projects.json"), "utf8"))
                    return Object.values(stored.projects || {}).some((project: any) => project.name === "Culto de prueba — ñ, á, 😀")
                },
                { timeout: 30000, intervals: [2000] }
            )
            .toBe(true)
        await closeApp(app)

        app = await electron.launch({ args: [".", "--no-sandbox"], env: environment })
        window = await findMainWindow(app)
        await blockInternet(app)
        await expect(window.getByText("Culto de prueba — ñ, á, 😀").first()).toBeVisible({ timeout: 30000 })
        await window.getByText("Culto de prueba — ñ, á, 😀").first().click()
        await expect(window.getByText("Señor, aquí estás 😀").first()).toBeVisible()
        await expect(window.getByText(/Salmo 23[, :]2/).first()).toBeVisible()
        await window.getByText("Señor, aquí estás 😀").first().click()
        await expect(window.getByText("Cantaré con fe").first()).toBeVisible({ timeout: 30000 })
        await window.getByText("Cantaré con fe").first().click()
        await expect(window.locator(".previewOutput").getByText("Cantaré con fe").first()).toBeVisible({ timeout: 30000 })
    } finally {
        await closeApp(app)
        settings.removeCallback()
        data.removeCallback()
    }
})
