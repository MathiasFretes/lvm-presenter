import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(`--${name}`)
  if (index < 0) return fallback
  if (!args[index + 1]) throw new Error(`Falta valor para --${name}`)
  return Number(args[index + 1])
}

const fps = option('fps', 30)
const seconds = option('seconds', 600)
if (![30, 60].includes(fps) || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
  throw new Error('Usá --fps 30|60 y --seconds entre 1 y 3600')

const setup = JSON.parse(await readFile(join(packageDir, '.ndi-cache', 'ndi-setup.json'), 'utf8'))
if (!setup.runtimeDir) throw new Error('No hay NDI runtime detectado; ejecutá npm run ndi:setup')
process.env.LVM_NDI_RUNTIME_DIR = setup.runtimeDir
const { NdiSender } = await import('../src/index.mjs')

const width = 1920, height = 1080, stride = width * 4
const pixels = new Uint8Array(stride * height)
const words = new Uint32Array(pixels.buffer)
const frame = { data: pixels, width, height, stride }
const sender = new NdiSender()

function rect(x, y, w, h, b, g, r, a = 255) {
  const color = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0
  const left = Math.max(0, x), right = Math.min(width, x + w)
  for (let row = Math.max(0, y); row < Math.min(height, y + h); row++)
    words.fill(color, row * width + left, row * width + right)
}

const font = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'V': ['10001','10001','10001','10001','10001','01010','00100']
}

function label(value, x, y, scale, color) {
  for (const character of value) {
    const glyph = font[character] ?? font[' ']
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++)
      if (glyph[row][col] === '1') rect(x + col * scale, y + row * scale, scale, scale, ...color)
    x += scale * 6
  }
}

rect(0, 0, width, height, 18, 26, 38)
rect(0, 0, width, 245, 43, 26, 14)
label('LVM PRESENTER TEST', 95, 65, 18, [60, 183, 243])
label(`FPS ${fps}`, 110, 530, 13, [60, 183, 243])
const bars = [[255,255,255],[0,255,255],[255,255,0],[0,255,0],[255,0,255],[0,0,255],[255,0,0]]
const barWidth = Math.ceil(width / bars.length)
bars.forEach((color, index) => rect(index * barWidth, 760, barWidth, 320, ...color))
rect(40, 1010, 100, 50, 255, 255, 255, 0) // transparent sample

let previousX = null
function animate(number) {
  rect(100, 315, 1600, 160, 18, 26, 38)
  label(`FRAME ${String(number).padStart(8, '0')}`, 110, 335, 15, [255, 255, 255])
  if (previousX !== null) rect(previousX, 645, 240, 60, 18, 26, 38)
  previousX = 120 + (number * 13) % 1460
  rect(previousX, 645, 240, 60, 60, 183, 243)
}

const startedAt = new Date().toISOString()
const startMemory = process.memoryUsage()
const cpuStart = process.cpuUsage()
const interval = 1000 / fps
let sent = 0, errors = 0, late = 0, skipped = 0, sendTotal = 0, sendMax = 0
let peakRss = startMemory.rss, stopRequested = false
const memorySamples = []
process.on('SIGINT', () => { stopRequested = true })
await sender.start({ name: 'LVM Presenter Test', width, height, fps, format: 'BGRA' })
const start = performance.now()
const end = start + seconds * 1000
let slot = 0
console.log(`Fuente activa: LVM Presenter Test — ${width}x${height} BGRA @ ${fps} fps`)

try {
  while (!stopRequested && performance.now() < end) {
    const wait = start + slot * interval - performance.now()
    if (wait > 1) await delay(wait)
    const now = performance.now()
    if (now >= end) break
    const missed = Math.max(0, Math.floor((now - (start + slot * interval)) / interval))
    skipped += missed
    slot += missed
    if (now > start + slot * interval + interval / 2) late++
    animate(sent)
    const before = performance.now()
    try {
      sender.send(frame)
      const elapsed = performance.now() - before
      sendTotal += elapsed
      sendMax = Math.max(sendMax, elapsed)
      sent++
    } catch (error) {
      errors++
      console.error(`Error al enviar frame ${sent}:`, error)
      break
    }
    if (sent % (fps * 10) === 0) {
      const memory = process.memoryUsage()
      peakRss = Math.max(peakRss, memory.rss)
      const sample = { seconds: (performance.now() - start) / 1000, sent,
        rssMiB: memory.rss / 1048576, heapMiB: memory.heapUsed / 1048576,
        externalMiB: memory.external / 1048576 }
      memorySamples.push(sample)
      console.log(`${sent} frames; ${sample.seconds.toFixed(1)} s; RSS ${sample.rssMiB.toFixed(1)} MiB; send max ${sendMax.toFixed(1)} ms`)
    }
    slot++
  }
} finally {
  await sender.stop()
  const elapsedSeconds = (performance.now() - start) / 1000
  const cpu = process.cpuUsage(cpuStart)
  const memory = process.memoryUsage()
  const report = {
    source: 'LVM Presenter Test', width, height, format: 'BGRA', targetFps: fps,
    requestedSeconds: seconds, startedAt, elapsedSeconds, sent, errors, late, skipped,
    effectiveFps: sent / elapsedSeconds, sendMeanMs: sent ? sendTotal / sent : 0, sendMaxMs: sendMax,
    cpuUserSeconds: cpu.user / 1e6, cpuSystemSeconds: cpu.system / 1e6,
    processCpuPercentOfOneCore: (cpu.user + cpu.system) / 1e6 / elapsedSeconds * 100,
    memory: { rssStartMiB: startMemory.rss / 1048576, rssEndMiB: memory.rss / 1048576, rssPeakMiB: peakRss / 1048576,
      heapStartMiB: startMemory.heapUsed / 1048576, heapEndMiB: memory.heapUsed / 1048576,
      externalStartMiB: startMemory.external / 1048576, externalEndMiB: memory.external / 1048576 },
    memorySamples
  }
  const reportDir = join(packageDir, '.ndi-cache', 'reports')
  await mkdir(reportDir, { recursive: true })
  const path = join(reportDir, `ndi-e2e-${fps}fps-${startedAt.replaceAll(':', '-')}.json`)
  await writeFile(path, JSON.stringify(report, null, 2) + '\n')
  console.log(`Reporte: ${path}`)
  console.log(JSON.stringify(report, null, 2))
  if (errors) process.exitCode = 1
}
