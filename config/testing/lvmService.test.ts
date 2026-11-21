import { _electron as electron } from "playwright"
import { expect, test } from "@playwright/test"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import tmp from "tmp"
import { execFileSync } from "node:child_process"

function isolatedEnvironment(folder: string) {
    return { ...process.env, NODE_ENV: "production", FS_MOCK_STORE_PATH: folder, APPDATA: join(folder, "Roaming"), LOCALAPPDATA: join(folder, "Local") }
}

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
    await Promise.race([
        app
            .evaluate(() => {
                const path = process.getBuiltinModule("node:path")
                const require = process.getBuiltinModule("node:module").createRequire(path.join(process.cwd(), "build/electron/index.js"))
                void require(path.join(process.cwd(), "build/electron/utils/close.js")).exitApp()
            })
            .catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 3000))
    ])
    await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5000))])
    if (child?.pid && child.exitCode === null) {
        if (process.platform === "win32") {
            try {
                execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
            } catch {
                /* Already exited. */
            }
        } else child.kill("SIGKILL")
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
}

test("imports and previews the offline Sunday service", async () => {
    const settings = tmp.dirSync({ unsafeCleanup: true })
    const data = tmp.dirSync({ unsafeCleanup: true })
    const app = await electron.launch({
        args: [".", "--no-sandbox"],
        env: isolatedEnvironment(settings.name)
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

test("imports Service JSON directly, restarts offline, and presents its lyrics", async ({}, testInfo) => {
    const servicePath = resolve(process.env.LVM_SERVICE_JSON || "examples/hostile-service.json")
    const service = JSON.parse(await readFile(servicePath, "utf8"))
    const song = service.items.find((item: any) => item.kind === "SONG").song
    const lyric = song.sections.at(-1).lines[0].text
    const settings = tmp.dirSync({ unsafeCleanup: true })
    const data = tmp.dirSync({ unsafeCleanup: true })
    const environment = isolatedEnvironment(settings.name)
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
        }, servicePath)
        await window.locator(".addButton").first().click()
        await window.locator(".addMenu").getByText("Import").click()
        await expect(window.locator(".popup").getByText("Imported!")).toBeVisible({ timeout: 30000 })
        await window.locator(".popup button").first().click()
        await expect(window.getByText(service.title).first()).toBeVisible({ timeout: 30000 })
        await window.getByText(service.title).first().click()
        await expect(window.getByText(song.title).first()).toBeVisible()
        // First-launch setup may still be saving. Retry the user's Save shortcut
        // until the imported project is actually on disk before closing.
        await expect
            .poll(
                async () => {
                    await window.keyboard.press("Control+s")
                    const stored = JSON.parse(await readFile(join(settings.name, "projects.json"), "utf8"))
                    return Object.values(stored.projects || {}).some((project: any) => project.name === service.title && project.shows?.length === service.items.length)
                },
                { timeout: 30000, intervals: [2000] }
            )
            .toBe(true)
        const saved = JSON.parse(await readFile(join(settings.name, "projects.json"), "utf8"))
        const imported: any = Object.values(saved.projects || {}).find((project: any) => project.name === service.title)
        expect(imported.shows.map((show: any) => show.data?.lvmServiceKind)).toEqual(service.items.map((item: any) => item.kind))
        expect(new Set(imported.shows.map((show: any) => show.id)).size).toBe(service.items.length)
        await closeApp(app)

        app = await electron.launch({ args: [".", "--no-sandbox"], env: environment })
        window = await findMainWindow(app)
        await blockInternet(app)
        await expect(window.getByText(service.title).first()).toBeVisible({ timeout: 30000 })
        await window.getByText(service.title).first().click()
        await expect(window.getByText(song.title).first()).toBeVisible()
        if (!process.env.LVM_SERVICE_JSON) await expect(window.getByText(/Salmo 23[, :]2/).first()).toBeVisible()
        await window.getByText(song.title).first().click()
        await expect(window.getByText(lyric).first()).toBeVisible({ timeout: 30000 })
        await window.getByText(lyric).first().click()
        await expect(window.locator(".previewOutput").getByText(lyric).first()).toBeVisible({ timeout: 30000 })
        await window.screenshot({ path: testInfo.outputPath("service-offline-preview.png"), fullPage: true })
    } finally {
        await closeApp(app)
        settings.removeCallback()
        data.removeCallback()
    }
})
