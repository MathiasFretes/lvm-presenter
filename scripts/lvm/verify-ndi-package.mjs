import { listPackage } from '@electron/asar'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const unpackedApp = path.resolve(process.argv[2] || path.join(repo, 'dist/win-unpacked'))
const resources = path.join(unpackedApp, 'resources')
const archive = path.join(resources, 'app.asar')
const entry = path.join(resources, 'lvm-ndi/src/index.mjs')
const addon = path.join(resources, 'lvm-ndi/build/Release/lvm_ndi.node')
if (!existsSync(archive) || !existsSync(entry) || !existsSync(addon))
  throw new Error('Packaged app, LVM NDI entry point or addon is missing')

const entries = listPackage(archive).map((entry) => entry.replaceAll('\\', '/').replace(/^\//, ''))
const unexpected = entries.filter((entry) => entry === 'packages/lvm-ndi' || entry.startsWith('packages/lvm-ndi/'))
if (unexpected.length) throw new Error(`Development NDI package leaked into ASAR: ${unexpected.join(', ')}`)
if (entries.some((entry) => entry.includes('.ndi-cache') || /Processing\.NDI\.Lib/i.test(entry)))
  throw new Error('NDI cache or runtime binary leaked into ASAR')

function inspect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name)
    if (item.name === '.ndi-cache' || /^Processing\.NDI\.Lib.*\.dll$/i.test(item.name))
      throw new Error(`NDI SDK/runtime artifact leaked into package: ${full}`)
    if (item.isDirectory()) inspect(full)
  }
}
inspect(unpackedApp)
const staged = []
function collect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name)
    if (item.isDirectory()) collect(full)
    else staged.push(path.relative(path.join(resources, 'lvm-ndi'), full).replaceAll('\\', '/'))
  }
}
collect(path.join(resources, 'lvm-ndi'))
if (staged.sort().join(',') !== 'build/Release/lvm_ndi.node,src/index.mjs')
  throw new Error(`Unexpected NDI resource files: ${staged.join(', ')}`)
console.log('LVM NDI package contents: PASS (entry point and addon only; SDK/runtime absent)')
