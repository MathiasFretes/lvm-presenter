import { _electron as electron } from 'playwright'
import { WebSocket } from 'ws'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cache = path.join(root, 'node_modules', '.cache')
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electronExe) || !existsSync(path.join(root, 'build', 'electron', 'index.js')))
  throw new Error('Build Presenter and install dependencies before running this gate')

const slideTitles = ['Bienvenida', 'Canción', 'Lectura', 'Prédica', 'Cierre']
const showId = 'lvm-remote-culto-qa'
const profile = await mkdtemp(path.join(cache, 'lvm-remote-live-'))
const dataRoot = path.join(profile, 'data')
const show = {
  name: 'Culto QA',
  category: 'presentation',
  settings: { activeLayout: 'default', template: 'header' },
  timestamps: { created: Date.now(), modified: null, used: null },
  quickAccess: {},
  meta: {},
  slides: Object.fromEntries(slideTitles.map((title, index) => [`slide-${index + 1}`, {
    group: '', color: null, settings: {}, notes: '',
    items: [{ style: 'top:428.50px;left:208.50px;height:220px;width:1500px;', align: '',
      lines: [{ align: '', text: [{ value: title, style: 'font-size: 180px;font-weight: bold;' }] }], auto: false }]
  }])),
  layouts: { default: { name: 'Default', notes: '', slides: slideTitles.map((_, index) => ({ id: `slide-${index + 1}` })) } },
  media: {}
}

await mkdir(path.join(dataRoot, 'Shows'), { recursive: true })
await writeFile(path.join(profile, 'config.json'), JSON.stringify({ loaded: true, dataPath: dataRoot }))
await writeFile(path.join(dataRoot, 'Shows', 'Culto QA.show'), JSON.stringify([showId, show]))

let app
let pid
let socket
const alive = (id) => { try { process.kill(id, 0); return true } catch { return false } }
const response = (socket, type, accept = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out waiting for ${type}`)) }, 12000)
  const onMessage = (raw) => {
    let message
    try { message = JSON.parse(raw.toString()) } catch { return }
    if (message.type !== type || !accept(message)) return
    clearTimeout(timeout)
    socket.off('message', onMessage)
    resolve(message)
  }
  socket.on('message', onMessage)
})
const send = async (socket, token, command, slideIndex) => {
  const received = response(socket, 'command.applied')
  socket.send(JSON.stringify({ schemaVersion: '0.1', type: `command.${command}`, requestId: `${command}-${Date.now()}`,
    sessionToken: token, ...(slideIndex === undefined ? {} : { slideIndex }) }))
  return (await received).state
}
const expectSlide = (state, index, cleared = false) => {
  if (state.show?.id !== showId || state.current?.slideIndex !== index || state.current?.slideCount !== 5 || state.output?.isCleared !== cleared)
    throw new Error(`Unexpected Presenter state: ${JSON.stringify(state)}`)
}
const mainManager = (operation, value) => app.evaluate(async (_electron, request) => {
  const path = process.getBuiltinModule('node:path')
  const require = process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(), 'build/electron/index.js'))
  const manager = require(path.join(process.cwd(), 'build/electron/lvmRemote/LvmRemoteManager.js')).lvmRemoteManager
  if (request.operation === 'start') return manager.start(request.value || '127.0.0.1', () => {})
  if (request.operation === 'approve') return manager.approve(request.value)
  if (request.operation === 'refresh') return manager.refreshPairing(request.value || '127.0.0.1')
  if (request.operation === 'publish') return manager.publishState()
  if (request.operation === 'status') return manager.status()
  if (request.operation === 'state') return manager.latestState
  if (request.operation === 'stop') return manager.stop()
}, { operation, value })

try {
  app = await electron.launch({ executablePath: electronExe, args: [`--user-data-dir=${path.join(profile, 'electron-user-data')}`, '.'], cwd: root, timeout: 90000,
    env: { ...process.env, NODE_ENV: 'development', FS_MOCK_STORE_PATH: profile,
      APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'), LVM_NDI_OUTPUT_ID: '' } })
  pid = app.process()?.pid
  const deadline = Date.now() + 30000
  let window
  while (!window && Date.now() < deadline) {
    window = app.windows().find((candidate) => candidate.url().includes('localhost:3000'))
    if (!window) await delay(250)
  }
  if (!window) throw new Error('Presenter main window did not open')
  await window.waitForLoadState('domcontentloaded')
  await window.locator('.top').first().waitFor({ timeout: 30000 })
  const setup = window.locator('.popup button.start')
  if (await setup.count()) {
    await app.evaluate(({ dialog }, location) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [location] })
    }, dataRoot)
    await setup.click()
    await window.locator('.popup').waitFor({ state: 'hidden', timeout: 10000 })
    const guide = window.locator('#guideButtons')
    if (await guide.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) {
      await guide.locator('button').first().click()
      await guide.waitFor({ state: 'hidden', timeout: 10000 })
    }
  }
  await window.evaluate(async ({ id, fixture }) => {
    const { setShow } = await import('/src/frontend/components/helpers/setShow.ts')
    const { startShow } = await import('/src/frontend/components/helpers/showActions.ts')
    await setShow(id, fixture)
    await startShow(id)
  }, { id: showId, fixture: show })
  await delay(1500)

  const phoneQa = process.env.LVM_REMOTE_PHONE_QA === '1'
  const status = await mainManager('start', phoneQa ? process.env.LVM_REMOTE_LAN_ADDRESS : undefined)
  if (phoneQa) {
    const linkFile = path.join(profile, 'pairing-link.txt')
    const savePhoneLink = async (state) => {
      await writeFile(linkFile, state.pairingLink.url)
      console.log(`PHONE_QA_LINK_FILE ${linkFile}`)
    }
    await savePhoneLink(status)
    let lastState = ''
    await new Promise((resolve) => {
      let monitor
      let limit
      const done = () => { clearInterval(monitor); clearTimeout(limit); process.stdin.off('data', onCommand); process.stdin.pause(); resolve() }
      const onCommand = async (raw) => {
        const command = raw.toString().trim()
        try {
          if (command === 'stop') return done()
          if (command === 'refresh') await savePhoneLink(await mainManager('refresh', process.env.LVM_REMOTE_LAN_ADDRESS))
          if (command === 'restart') {
            await mainManager('stop')
            await savePhoneLink(await mainManager('start', process.env.LVM_REMOTE_LAN_ADDRESS))
          }
          if (command.startsWith('slide ')) {
            const index = Number(command.slice(6))
            await window.evaluate(async ({ id, index }) => {
              const { API_ACTIONS } = await import('/src/frontend/components/actions/api.ts')
              await API_ACTIONS.index_select_slide({ showId: id, index })
            }, { id: showId, index })
          }
          if (command === 'show') {
            await window.evaluate(async ({ id, fixture }) => {
              const { setShow } = await import('/src/frontend/components/helpers/setShow.ts')
              const { startShow } = await import('/src/frontend/components/helpers/showActions.ts')
              await setShow(id, fixture)
              await startShow(id)
            }, { id: 'lvm-remote-culto-qa-evening', fixture: { ...show, name: 'Culto vespertino' } })
          }
        } catch (error) { console.error('PHONE_QA_COMMAND_ERROR', error.message) }
      }
      monitor = setInterval(async () => {
        try {
          const current = await mainManager('status')
          if (current.pending) await mainManager('approve', current.pending.pairingId)
          const state = JSON.stringify(await mainManager('state'))
          if (state !== lastState) {
            lastState = state
            console.log(`PHONE_QA_STATE ${state}`)
          }
        } catch (error) { console.error('PHONE_QA_MONITOR_ERROR', error.message); done() }
      }, 300)
      process.stdin.on('data', onCommand)
      limit = setTimeout(done, 15 * 60 * 1000)
    })
  } else {
  const unapproved = new WebSocket(`ws://127.0.0.1:${status.port}/lvm-remote/0.1`)
  await new Promise((resolve, reject) => { unapproved.once('open', resolve); unapproved.once('error', reject) })
  const denied = response(unapproved, 'command.rejected')
  unapproved.send(JSON.stringify({ schemaVersion: '0.1', type: 'command.next', requestId: 'unauthorized-next' }))
  if ((await denied).code !== 'unauthorized') throw new Error('Unapproved device controlled Presenter')
  unapproved.close()

  socket = new WebSocket(`ws://127.0.0.1:${status.port}/lvm-remote/0.1`)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const pending = response(socket, 'pair.pending')
  socket.send(JSON.stringify({ schemaVersion: '0.1', type: 'pair.request', requestId: 'culto-qa-pair',
    pairingId: status.pairingLink.pairingId, pairingSecret: status.pairingLink.pairingSecret,
    device: { id: 'culto-qa-test', name: 'Culto QA Test' } }))
  await pending
  const approved = response(socket, 'pair.approved')
  const initial = response(socket, 'state.snapshot')
  await mainManager('approve', status.pairingLink.pairingId)
  const token = (await approved).sessionToken
  expectSlide(await initial, 0)
  expectSlide(await send(socket, token, 'next'), 1)
  expectSlide(await send(socket, token, 'next'), 2)
  expectSlide(await send(socket, token, 'previous'), 1)
  expectSlide(await send(socket, token, 'goTo', 4), 4)
  expectSlide(await send(socket, token, 'clear'), 4, true)
  const blackout = response(socket, 'state.changed')
  await mainManager('publish')
  expectSlide(await blackout, 4, true)

  const reconnectLink = (await mainManager('refresh')).pairingLink
  const reconnected = new WebSocket(`ws://127.0.0.1:${status.port}/lvm-remote/0.1`)
  await new Promise((resolve, reject) => { reconnected.once('open', resolve); reconnected.once('error', reject) })
  const reconnectPending = response(reconnected, 'pair.pending')
  reconnected.send(JSON.stringify({ schemaVersion: '0.1', type: 'pair.request', requestId: 'culto-qa-reconnect',
    pairingId: reconnectLink.pairingId, pairingSecret: reconnectLink.pairingSecret,
    device: { id: 'culto-qa-reconnected', name: 'Culto QA Reconnected' } }))
  await reconnectPending
  const reconnectApproved = response(reconnected, 'pair.approved')
  const reconnectSnapshot = response(reconnected, 'state.snapshot')
  await mainManager('approve', reconnectLink.pairingId)
  await reconnectApproved
  expectSlide(await reconnectSnapshot, 4, true)
  reconnected.close()

  expectSlide(await send(socket, token, 'restore'), 4)
  const localSlide = response(socket, 'state.changed', (message) => message.show?.id === showId && message.current?.slideIndex === 2 && !message.output?.isCleared)
  await window.evaluate(async (id) => {
    const { API_ACTIONS } = await import('/src/frontend/components/actions/api.ts')
    await API_ACTIONS.index_select_slide({ showId: id, index: 2 })
  }, showId)
  expectSlide(await localSlide, 2)

  const secondShowId = 'lvm-remote-culto-qa-evening'
  const secondShow = { ...show, name: 'Culto vespertino' }
  const changedShow = response(socket, 'state.changed', (message) => message.show?.id === secondShowId && message.current?.slideIndex === 0)
  await window.evaluate(async ({ id, fixture }) => {
    const { setShow } = await import('/src/frontend/components/helpers/setShow.ts')
    const { startShow } = await import('/src/frontend/components/helpers/showActions.ts')
    await setShow(id, fixture)
    await startShow(id)
  }, { id: secondShowId, fixture: secondShow })
  const changedState = await changedShow
  if (changedState.show.title !== 'Culto vespertino') throw new Error(`Wrong Presenter-side show: ${JSON.stringify(changedState)}`)
  console.log('Real Presenter Culto QA: navigation, blackout reconnect, restore, local changes, authorization PASS')
  }
} finally {
  if (socket) socket.close()
  if (app) {
    await mainManager('stop').catch(() => {})
    void app.evaluate(() => {
      const path = process.getBuiltinModule('node:path')
      const require = process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(), 'build/electron/index.js'))
      void require(path.join(process.cwd(), 'build/electron/utils/close.js')).exitApp()
    }).catch(() => {})
    await Promise.race([app.close().catch(() => {}), delay(5000)])
  }
  if (pid && alive(pid) && process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
  const resolved = path.resolve(profile)
  if (!resolved.startsWith(path.resolve(cache) + path.sep)) throw new Error(`Unsafe QA profile path: ${resolved}`)
  await rm(resolved, { recursive: true, force: true })
}
