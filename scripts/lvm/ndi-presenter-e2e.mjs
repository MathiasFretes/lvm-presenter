import { _electron as electron } from 'playwright'
import { existsSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(root, 'packages/lvm-ndi/.ndi-cache')
const args = process.argv.slice(2)
const get = (key, fallback) => {
  const at = args.indexOf(`--${key}`)
  return at < 0 ? fallback : args[at + 1]
}
const mode = get('mode', 'on')
const fps = Number(get('fps', '30'))
const seconds = Number(get('seconds', '600'))
const outputMode = get('output', 'osr')
if (!['on', 'off'].includes(mode) || ![30, 60].includes(fps) || !Number.isInteger(seconds) || seconds < 10 || seconds > 3600 || !['osr', 'display'].includes(outputMode))
  throw new Error('Use --mode on|off --fps 30|60 --seconds 10..3600 --output osr|display')

const electronExe = process.env.LVM_ELECTRON_EXE || path.join(root, 'node_modules/electron/dist/electron.exe')
if (!existsSync(electronExe)) throw new Error(`Electron executable missing: ${electronExe}`)
if (!existsSync(path.join(root, 'public/build/bundle.js')) || !existsSync(path.join(root, 'build/electron/index.js')))
  throw new Error('Build Presenter frontend and Electron main before running this E2E')
const htmlPath = path.join(root, 'public/index.html')
const originalHtml = await readFile(htmlPath, 'utf8')
const devEntry = '<script type="module" src="/src/frontend/main.ts"></script>'
const prodEntry = '<script type="module" crossorigin src="./build/bundle.js"></script><link rel="stylesheet" href="./build/bundle.css">'
if (!originalHtml.includes(prodEntry) && !originalHtml.includes(devEntry))
  throw new Error('Unsupported public/index.html entry; cannot prepare Presenter E2E')
let patchedHtml = false
if (originalHtml.includes(devEntry)) {
  await writeFile(htmlPath, originalHtml.replace(devEntry, prodEntry))
  patchedHtml = true
}
process.on('exit', () => { if (patchedHtml) writeFileSync(htmlPath, originalHtml) })

const { runtimeDir } = JSON.parse(await readFile(path.join(cache, 'ndi-setup.json'), 'utf8'))
const outputId = 'lvm-ndi-integrated-e2e'
const stamp = new Date().toISOString().replaceAll(':', '-')
const runDir = path.join(cache, 'integrated-runs', `${mode}-${fps}-${outputMode}-${stamp}`)
await mkdir(runDir, { recursive: true })

const app = await electron.launch({
  timeout: 90000,
  executablePath: electronExe,
  args: ['.'], cwd: root,
  env: { ...process.env, NODE_ENV: 'production', FS_MOCK_STORE_PATH: runDir,
    APPDATA: path.join(runDir, 'Roaming'), LOCALAPPDATA: path.join(runDir, 'Local'),
    LVM_NDI_OUTPUT_ID: mode === 'on' ? outputId : '', LVM_NDI_FPS: String(fps),
    LVM_NDI_SOURCE_NAME: 'LVM Presenter', LVM_NDI_RUNTIME_DIR: runtimeDir,
    LVM_E2E_OUTPUT_MODE: outputMode }
})

const startedAt = new Date().toISOString()
const electronPid = await app.evaluate(() => process.pid)
const samples = []
let outputPage
let closeState = null
let failure = null
try {
  await delay(4000)
  await app.evaluate(async (_electron, root) => {
    const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
    const { OutputHelper } = req(root + '/build/electron/output/OutputHelper.js')
    await OutputHelper.Lifecycle.createOutput({
      id: 'lvm-ndi-integrated-e2e', enabled: true, active: true,
      name: 'LVM Presenter E2E', color: '#c89b3c',
      bounds: { x: 20, y: 20, width: 1920, height: 1080 }, screen: null,
      alwaysOnTop: false, transparent: false, invisible: process.env.LVM_E2E_OUTPUT_MODE !== 'display'
    })
  }, root)
  // The output page's Svelte listeners need to finish mounting before its first OUTPUTS update.
  await delay(4000)
  await app.evaluate((_electron, root) => {
    const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
    const { OutputHelper } = req(root + '/build/electron/output/OutputHelper.js')
    const id = 'lvm-ndi-integrated-e2e'
    let count = 0
    const sendContent = () => {
      const payload = { id, name: 'LVM Presenter E2E', active: true, enabled: true,
        color: '#c89b3c', bounds: { x: 20, y: 20, width: 1920, height: 1080 },
        out: { slide: { id: 'tempText', tempItems: [{
          style: 'top:88px;left:50px;height:904px;width:1820px;',
          lines: [{ align: 'center', text: [{ value: `LVM PRESENTER ${String(count++).padStart(5, '0')}`, style: 'font-size:90px;color:#ffffff;' }] }]
        }] } } }
      OutputHelper.Send.sendToWindow(id, { channel: 'OUTPUTS', data: { [id]: payload } })
    }
    sendContent()
    globalThis.__lvmNdiE2eTimer = setInterval(sendContent, 2000)
  }, root)
  outputPage = app.windows().at(-1)
  await delay(2000)
  await outputPage.evaluate(() => {
    const metrics = { frames: 0, intervalsMs: 0, maxIntervalMs: 0, last: 0 }
    globalThis.__lvmFrameMetrics = metrics
    const tick = (now) => {
      if (metrics.last) {
        const interval = now - metrics.last
        metrics.frames++
        metrics.intervalsMs += interval
        metrics.maxIntervalMs = Math.max(metrics.maxIntervalMs, interval)
      }
      metrics.last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  if (outputMode === 'display')
    await outputPage.screenshot({ path: path.join(runDir, 'presenter-start.png'), timeout: 5000 }).catch((error) => console.warn('Start screenshot unavailable:', error.message))
  const start = performance.now()
  while ((performance.now() - start) / 1000 < seconds) {
    await delay(10000)
    const beforePing = performance.now()
    await outputPage.evaluate(() => document.title)
    const uiPingMs = performance.now() - beforePing
    const sample = await app.evaluate((_electron, root) => {
      const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
      const { LvmNdiBridge } = req(root + '/build/electron/output/LvmNdiBridge.js')
      const processes = _electron.app.getAppMetrics().map((metric) => ({
        type: metric.type, cpuPercent: metric.cpu.percentCPUUsage,
        workingSetMiB: metric.memory.workingSetSize / 1024,
      }))
      return { ndi: LvmNdiBridge.snapshot(), cpu: process.cpuUsage(), memory: process.memoryUsage(), processes }
    }, root)
    const renderer = await outputPage.evaluate(() => ({ ...globalThis.__lvmFrameMetrics }))
    const entry = { elapsedSeconds: (performance.now() - start) / 1000, uiPingMs,
      ndi: sample.ndi, cpu: sample.cpu, rssMiB: sample.memory.rss / 1048576,
      processes: sample.processes, renderer }
    samples.push(entry)
    console.log(`${mode} ${fps} ${entry.elapsedSeconds.toFixed(0)}s: ${entry.ndi.sent} frames, ${entry.ndi.fps.toFixed(2)} fps, ${entry.ndi.sendMeanMs.toFixed(2)} ms send, ${entry.rssMiB.toFixed(1)} MiB RSS, ${uiPingMs.toFixed(1)} ms UI ping`)
    await writeFile(path.join(runDir, 'samples.json'), JSON.stringify({ startedAt, mode, fps, outputMode, samples }, null, 2))
  }
  if (outputMode === 'display')
    await outputPage.screenshot({ path: path.join(runDir, 'presenter-end.png'), timeout: 5000 }).catch((error) => console.warn('End screenshot unavailable:', error.message))
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
  console.error(failure)
  process.exitCode = 1
} finally {
  try {
    closeState = await app.evaluate(async (_electron, root) => {
      const req = process.getBuiltinModule('module').createRequire(root + '/build/electron/index.js')
      const { OutputHelper } = req(root + '/build/electron/output/OutputHelper.js')
      const { LvmNdiBridge } = req(root + '/build/electron/output/LvmNdiBridge.js')
      clearInterval(globalThis.__lvmNdiE2eTimer)
      const before = LvmNdiBridge.snapshot()
      await OutputHelper.Lifecycle.removeOutput('lvm-ndi-integrated-e2e')
      return { before, after: LvmNdiBridge.snapshot() }
    }, root)
  } catch (error) { console.error('Cleanup failed:', error); process.exitCode = 1 }
  const child = app.process()
  // Presenter keeps its Electron process alive after the last output closes.
  // Exit the isolated E2E app after the sender has been stopped.
  await app.evaluate(({ app }) => { setTimeout(() => app.exit(0), 100) }).catch(() => {})
  await Promise.race([app.close(), delay(5000)]).catch(() => {})
  if (electronPid) {
    try { execFileSync('taskkill.exe', ['/PID', String(electronPid), '/T', '/F'], { stdio: 'ignore' }) }
    catch { /* The process may already have exited normally. */ }
  }
  const result = { startedAt, mode, fps, outputMode, requestedSeconds: seconds, electronPid, launcherPid: child?.pid, failure, closeState, samples }
  await writeFile(path.join(runDir, 'report.json'), JSON.stringify(result, null, 2))
  console.log('Report:', path.join(runDir, 'report.json'))
  if (patchedHtml) { await writeFile(htmlPath, originalHtml); patchedHtml = false }
  process.exit(process.exitCode || 0)
}
