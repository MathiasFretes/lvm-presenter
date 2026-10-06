import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const exe = path.resolve(process.argv[2] || path.join(repo, 'dist/win-unpacked/LVM Presenter.exe'))
const runtimeDir = process.argv[3] ? path.resolve(process.argv[3]) : ''
const profileRoot = path.join(repo, 'node_modules/.cache')
const addon = path.join(path.dirname(exe), 'resources/lvm-ndi/build/Release/lvm_ndi.node')
if (!existsSync(exe) || !existsSync(addon)) throw new Error('Packaged Presenter or LVM NDI addon is missing')
if (runtimeDir && !existsSync(path.join(runtimeDir, 'Processing.NDI.Lib.x64.dll')))
  throw new Error('The supplied NDI runtime directory has no DLL')

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}
const withTimeout = (promise, label) => Promise.race([
  promise,
  delay(15000).then(() => { throw new Error(`${label} timed out`) })
])

async function ndiState(app) {
  return app.evaluate(() => {
    const path = process.getBuiltinModule('node:path')
    const entry = path.join(process.resourcesPath, 'app.asar/build/electron/index.js')
    const require = process.getBuiltinModule('node:module').createRequire(entry)
    return require(path.join(process.resourcesPath, 'app.asar/build/electron/output/LvmNdiBridge.js')).LvmNdiBridge.snapshot()
  })
}

async function runCase(label, runtime, expectedState) {
  await mkdir(profileRoot, { recursive: true })
  const profile = await mkdtemp(path.join(profileRoot, 'lvm-ndi-release-'))
  let app
  let pid
  try {
    console.log(`${label}: launching packaged Presenter`)
    app = await electron.launch({ executablePath: exe, timeout: 90000, env: {
      ...process.env, NODE_ENV: 'production', FS_MOCK_STORE_PATH: profile,
      APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'),
      LVM_NDI_OUTPUT_ID: '', LVM_NDI_RUNTIME_DIR: runtime,
      NDI_RUNTIME_DIR_V6: runtime, NDI_RUNTIME_DIR_V5: runtime
    } })
    app.process()?.stderr?.on('data', (data) => console.error(`${label} stderr: ${String(data).trim()}`))
    app.process()?.stdout?.on('data', (data) => console.log(`${label} stdout: ${String(data).trim()}`))
    pid = await app.evaluate(() => process.pid)
    const window = await Promise.race([
      app.firstWindow(),
      delay(30000).then(() => { throw new Error(`${label}: Presenter did not create a window`) })
    ])
    await window.waitForLoadState('domcontentloaded')
    if (!(await window.title()).includes('LVM Presenter')) throw new Error('Packaged Presenter did not open')
    console.log(`${label}: window loaded`)
    console.log(`${label}: initial state ${JSON.stringify(await withTimeout(ndiState(app), 'initial state'))}`)

    const id = `lvm-ndi-release-${label}`
    await app.evaluate(async (_electron, outputId) => {
      const path = process.getBuiltinModule('node:path')
      const entry = path.join(process.resourcesPath, 'app.asar/build/electron/index.js')
      const require = process.getBuiltinModule('node:module').createRequire(entry)
      const { OutputHelper } = require(path.join(process.resourcesPath, 'app.asar/build/electron/output/OutputHelper.js'))
      await OutputHelper.Lifecycle.createOutput({
        id: outputId, enabled: true, active: true, name: 'LVM NDI release smoke', color: '#c89b3c',
        bounds: { x: 0, y: 0, width: 640, height: 360 }, screen: null,
        alwaysOnTop: false, transparent: false, invisible: true,
        lvmNdi: true, lvmNdiData: { name: 'LVM Presenter Release Test', fps: 30 }
      })
    }, id)
    console.log(`${label}: output created`)

    let state
    for (let attempt = 0; attempt < 80; attempt++) {
      state = await withTimeout(ndiState(app), 'NDI state')
      if (state.state === expectedState) break
      await delay(100)
    }
    if (state?.state !== expectedState) throw new Error(`${label}: expected ${expectedState}, got ${JSON.stringify(state)}`)
    if (expectedState === 'error' && !/runtime/i.test(state.error || ''))
      throw new Error(`Missing runtime error is unclear: ${state.error}`)

    await withTimeout(app.evaluate(async (_electron, outputId) => {
      const path = process.getBuiltinModule('node:path')
      const entry = path.join(process.resourcesPath, 'app.asar/build/electron/index.js')
      const require = process.getBuiltinModule('node:module').createRequire(entry)
      const { OutputHelper } = require(path.join(process.resourcesPath, 'app.asar/build/electron/output/OutputHelper.js'))
      await OutputHelper.Lifecycle.removeOutput(outputId)
    }, id), 'output removal')
    if ((await withTimeout(ndiState(app), 'final state')).state !== 'inactive') throw new Error(`${label}: sender remained active after output removal`)
    // Use the same confirmed Exit path as the Presenter UI. app.quit() alone
    // is vetoed by the main window and leaves the packaged process running.
    void app.evaluate(() => {
      const path = process.getBuiltinModule('node:path')
      const entry = path.join(process.resourcesPath, 'app.asar/build/electron/index.js')
      const require = process.getBuiltinModule('node:module').createRequire(entry)
      void require(path.join(process.resourcesPath, 'app.asar/build/electron/utils/close.js')).exitApp()
    }).catch(() => {})
    for (let attempt = 0; attempt < 40 && alive(pid); attempt++) await delay(250)
    if (alive(pid)) throw new Error(`${label}: Presenter process survived shutdown`)
    await Promise.race([app.close().catch(() => {}), delay(5000)])
    console.log(`${label}: ${expectedState}, cleanup, shutdown PASS`)
  } finally {
    if (pid && alive(pid) && process.platform === 'win32') {
      try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    }
    if (app) await Promise.race([app.close().catch(() => {}), delay(5000)])
    const resolved = path.resolve(profile)
    if (!resolved.startsWith(path.resolve(profileRoot) + path.sep)) throw new Error(`Unexpected profile path: ${resolved}`)
    await rm(resolved, { recursive: true, force: true })
  }
}

await runCase('without-runtime', path.join(profileRoot, 'missing-runtime'), 'error')
if (runtimeDir) await runCase('with-runtime', runtimeDir, 'active')
process.exit(0)
