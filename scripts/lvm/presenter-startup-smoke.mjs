import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  pid = await app.evaluate(() => process.pid)
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  if (!(await window.title()).includes('LVM Presenter')) throw new Error('Presenter window did not load')
  await app.evaluate(({ app: electronApp }) => electronApp.quit())
  await app.close()
  if (alive(pid)) throw new Error(`Electron process ${pid} survived shutdown`)
  console.log('Presenter startup and shutdown: PASS')
} finally {
  if (pid && alive(pid) && process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
  if (app) await app.close().catch(() => {})
  const resolved = path.resolve(profile)
  if (!resolved.startsWith(path.resolve(profileRoot) + path.sep))
    throw new Error(`Refusing to remove unexpected profile: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}
