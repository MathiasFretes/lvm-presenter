import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(root, 'node_modules', '.cache')
await mkdir(cache, { recursive: true })
const profile = await mkdtemp(path.join(cache, 'm79e-shell-'))
const screenshot = path.join(root, 'docs', 'screenshots', 'm79e-presenter-desktop.png')
await mkdir(path.dirname(screenshot), { recursive: true })
let app
let pid

try {
  app = await electron.launch({
    executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    cwd: root,
    args: ['.', '--no-sandbox', '--lang=es-PY'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      FS_MOCK_STORE_PATH: profile,
      APPDATA: path.join(profile, 'Roaming'),
      LOCALAPPDATA: path.join(profile, 'Local'),
      LVM_NDI_OUTPUT_ID: '',
    },
  })
  pid = app.process()?.pid
  const deadline = Date.now() + 30000
  let window
  while (!window && Date.now() < deadline) {
    window = app.windows().find((candidate) => candidate.url().includes('localhost:3000'))
    if (!window) await delay(250)
  }
  if (!window) throw new Error('Presenter main window did not open')
  await window.locator('.popup button.start, .top').first().waitFor({ timeout: 30000 })
  const nativeMenuVisible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL().includes('localhost:3000'))
      ?.isMenuBarVisible(),
  )
  if (nativeMenuVisible !== false) throw new Error('Windows native menu is still visible')
  const locale = await window.evaluate(() => navigator.language)
  const setup = window.locator('.popup button.start')
  if (await setup.count()) {
    await app.evaluate(({ dialog }, location) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [location] })
    }, profile)
    await setup.click()
    await window.locator('.popup').waitFor({ state: 'hidden', timeout: 10000 })
    const guide = window.locator('#guideButtons')
    if (await guide.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) {
      await guide.locator('button').first().click()
      await guide.waitFor({ state: 'hidden', timeout: 10000 })
    }
  }
  const brand = await window.evaluate(() => {
    const mark = document.querySelector('.lvm-brand-mark')
    if (!mark) return null
    const rect = mark.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, over: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML.slice(0, 180) }
  })
  await window.screenshot({ path: screenshot })
  console.log(`Presenter shell: native menu hidden; browser locale ${locale}; brand ${JSON.stringify(brand)}; screenshot ${screenshot}`)
  await window.setViewportSize({ width: 1024, height: 768 })
  const compact = await window.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  const compactScreenshot = path.join(root, 'docs', 'screenshots', 'm79e-presenter-1024.png')
  await window.screenshot({ path: compactScreenshot })
  console.log(`Presenter 1024 px: ${JSON.stringify(compact)}; screenshot ${compactScreenshot}`)
} finally {
  if (app) {
    void app.evaluate(() => {
      const path = process.getBuiltinModule('node:path')
      const require = process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(), 'build/electron/index.js'))
      void require(path.join(process.cwd(), 'build/electron/utils/close.js')).exitApp()
    }).catch(() => {})
    await Promise.race([app.close().catch(() => {}), delay(5000)])
  }
  if (pid && process.platform === 'win32') {
    try { process.kill(pid, 0); execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
  const resolved = path.resolve(profile)
  if (!resolved.startsWith(path.resolve(cache) + path.sep)) throw new Error(`Unsafe QA profile path: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}
