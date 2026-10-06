import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const profileRoot = path.join(root, 'node_modules', '.cache')
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electronExe) || !existsSync(path.join(root, 'build', 'electron', 'index.js')))
  throw new Error('Build Presenter and install dependencies before the startup check')

await mkdir(profileRoot, { recursive: true })
const profile = await mkdtemp(path.join(profileRoot, 'lvm-presenter-smoke-'))
let app
let pid
const alive = (id) => {
  try { process.kill(id, 0); return true } catch { return false }
}
async function withTimeout(promise, label, ms = 30000) {
  const controller = new AbortController()
  try {
    return await Promise.race([
      promise,
      delay(ms, undefined, { signal: controller.signal }).then(() => {
        throw new Error(`${label} timed out after ${ms} ms`)
      })
    ])
  } finally {
    controller.abort()
  }
}

try {
  app = await electron.launch({
    executablePath: electronExe,
    args: ['.'],
    cwd: root,
    timeout: 90000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      FS_MOCK_STORE_PATH: profile,
      APPDATA: path.join(profile, 'Roaming'),
      LOCALAPPDATA: path.join(profile, 'Local'),
      LVM_NDI_OUTPUT_ID: ''
    }
  })
  pid = await withTimeout(app.evaluate(() => process.pid), 'Electron PID')
  const window = await withTimeout(app.firstWindow(), 'Presenter window')
  await withTimeout(window.waitForLoadState('domcontentloaded'), 'Presenter document')
  if (!(await withTimeout(window.title(), 'Presenter title')).includes('LVM Presenter'))
    throw new Error('Presenter window did not load')
  // The main window intentionally vetoes app.quit() until the UI has handled
  // unsaved work. Use the same cleanup entry point as the UI's confirmed Exit.
  // Exiting destroys the Playwright connection, so observe the process instead.
  void app.evaluate(() => {
    const path = process.getBuiltinModule('node:path')
    const require = process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(), 'build/electron/index.js'))
    void require(path.join(process.cwd(), 'build/electron/utils/close.js')).exitApp()
  }).catch(() => {})
  for (let attempt = 0; attempt < 60 && alive(pid); attempt++) await delay(250)
  if (alive(pid)) throw new Error(`Electron process ${pid} survived shutdown`)
  await Promise.race([app.close().catch(() => {}), delay(5000)])
  console.log('Presenter startup and shutdown: PASS')
} finally {
  if (pid && alive(pid) && process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
  if (app) await Promise.race([app.close().catch(() => {}), delay(5000)])
  const resolved = path.resolve(profile)
  if (!resolved.startsWith(path.resolve(profileRoot) + path.sep))
    throw new Error(`Refusing to remove unexpected profile: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}
