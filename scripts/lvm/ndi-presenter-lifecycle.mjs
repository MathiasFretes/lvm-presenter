import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(root, 'packages/lvm-ndi/.ndi-cache')
const htmlPath = path.join(root, 'public/index.html')
const originalHtml = readFileSync(htmlPath, 'utf8')
const devEntry = '<script type="module" src="/src/frontend/main.ts"></script>'
const prodEntry = '<script type="module" crossorigin src="./build/bundle.js"></script><link rel="stylesheet" href="./build/bundle.css">'
if (!originalHtml.includes(devEntry) && !originalHtml.includes(prodEntry)) throw new Error('Unsupported Presenter HTML entry')
if (!existsSync(path.join(root, 'public/build/bundle.js')) || !existsSync(path.join(root, 'build/electron/index.js')))
  throw new Error('Build Presenter before the lifecycle check')
const { runtimeDir } = JSON.parse(await readFile(path.join(cache, 'ndi-setup.json'), 'utf8'))
const electronExe = process.env.LVM_ELECTRON_EXE || path.join(root, 'node_modules/electron/dist/electron.exe')
if (!existsSync(electronExe)) throw new Error(`Electron executable missing: ${electronExe}`)

let patchedHtml = false
const restoreHtml = () => {
  if (patchedHtml) writeFileSync(htmlPath, originalHtml)
  patchedHtml = false
}
process.on('exit', restoreHtml)

function alive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function snapshot(app) {
  return app.evaluate((_electron, root) => {
    const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
    const { OutputHelper } = req(root + '/build/electron/output/OutputHelper.js')
    const { CaptureHelper } = req(root + '/build/electron/capture/CaptureHelper.js')
    const { LvmNdiBridge } = req(root + '/build/electron/output/LvmNdiBridge.js')
    return {
      outputs: OutputHelper.getKeys(),
      subscriptions: [...CaptureHelper.Lifecycle.lvmFrameSubscriptions],
      ndi: LvmNdiBridge.snapshot()
    }
  }, root)
}

async function until(app, predicate, label) {
  for (let i = 0; i < 50; i++) {
    const state = await snapshot(app)
    if (predicate(state)) return state
    await delay(100)
  }
  throw new Error(`${label}: ${JSON.stringify(await snapshot(app))}`)
}

async function createOutput(app, id) {
  await app.evaluate(async (_electron, { root, id }) => {
    const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
    const { OutputHelper } = req(root + '/build/electron/output/OutputHelper.js')
    await OutputHelper.Lifecycle.createOutput({
      id, enabled: true, active: true, name: 'LVM NDI lifecycle', color: '#c89b3c',
      bounds: { x: 20, y: 20, width: 640, height: 360 }, screen: null,
      alwaysOnTop: false, transparent: false, invisible: false
    })
  }, { root, id })
  return until(app, (s) => s.ndi.state === 'active' && s.subscriptions.filter((x) => x === id).length === 1, 'NDI/subscription did not start once')
}

async function runCycle(cycle) {
  const runDir = await mkdtemp(path.join(cache, 'lifecycle-'))
  let app
  let pid
  try {
    app = await electron.launch({ executablePath: electronExe, args: ['.'], cwd: root, timeout: 90000,
      env: { ...process.env, NODE_ENV: 'production', FS_MOCK_STORE_PATH: runDir,
        APPDATA: path.join(runDir, 'Roaming'), LOCALAPPDATA: path.join(runDir, 'Local'),
        LVM_NDI_OUTPUT_ID: 'first', LVM_NDI_FPS: '30', LVM_NDI_SOURCE_NAME: 'LVM Presenter Lifecycle',
        LVM_NDI_RUNTIME_DIR: runtimeDir } })
    pid = await app.evaluate(() => process.pid)
    await app.firstWindow()
    const id = `lvm-ndi-lifecycle-${cycle}`
    await createOutput(app, id)

    if (cycle === 1) {
      await app.evaluate(async (_electron, { root, id }) => {
        const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
        req(root + '/build/electron/capture/CaptureHelper.js').CaptureHelper.Lifecycle.stopCapture(id)
        await req(root + '/build/electron/output/LvmNdiBridge.js').LvmNdiBridge.disable(id)
      }, { root, id })
      await until(app, (s) => s.outputs.includes(id) && !s.subscriptions.includes(id) && s.ndi.state === 'inactive', 'disabling NDI leaked its subscription or sender')

      // Closing the still-open window must work after NDI was disabled.
      await app.evaluate((_electron, { root, id }) => {
        const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
        req(root + '/build/electron/output/OutputHelper.js').OutputHelper.getOutput(id).window.close()
      }, { root, id })
      await until(app, (s) => !s.outputs.includes(id) && !s.subscriptions.includes(id) && s.ndi.state === 'inactive', 'direct window close leaked')

      // Reopen in the same process to catch stale sender and duplicate subscriptions.
      await createOutput(app, id)
      await app.evaluate(async (_electron, { root, id }) => {
        const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
        await req(root + '/build/electron/output/OutputHelper.js').OutputHelper.Lifecycle.removeOutput(id)
      }, { root, id })
      await until(app, (s) => !s.outputs.includes(id) && !s.subscriptions.includes(id) && s.ndi.state === 'inactive', 'explicit output removal leaked')
    }

    // Cycle 2 leaves the output active: Presenter shutdown itself must clean it.
    await app.evaluate(({ app }) => { app.quit() }).catch(() => {})
    await Promise.race([app.close(), delay(5000)])
    await delay(200)
    if (alive(pid)) throw new Error(`Electron process ${pid} survived Presenter shutdown`)
    console.log(`cycle ${cycle}: sender, subscription, output window, and Electron process closed`)
  } finally {
    if (pid && alive(pid) && process.platform === 'win32') {
      try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    }
    if (app) await app.close().catch(() => {})
    const resolved = path.resolve(runDir)
    if (!resolved.startsWith(path.resolve(cache) + path.sep)) throw new Error(`Refusing to remove unexpected profile path: ${resolved}`)
    await rm(resolved, { recursive: true, force: true })
  }
}

try {
  if (originalHtml.includes(devEntry)) {
    writeFileSync(htmlPath, originalHtml.replace(devEntry, prodEntry))
    patchedHtml = true
  }
  await runCycle(1)
  await runCycle(2)
  console.log('LVM NDI lifecycle: PASS (Studio Monitor was not started)')
} finally {
  restoreHtml()
}
