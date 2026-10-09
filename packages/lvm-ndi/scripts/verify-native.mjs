import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const configFile = join(packageDir, '.ndi-cache', 'ndi-setup.json')
const addonFile = join(packageDir, 'build', 'Release', 'lvm_ndi.node')
if (!existsSync(configFile) || !existsSync(addonFile)) {
  console.error('Primero ejecutá npm run ndi:setup y npm run ndi:build.')
  process.exit(2)
}
const { runtimeDir } = JSON.parse(await readFile(configFile, 'utf8'))
if (!runtimeDir) {
  console.error('No se detectó NDI Runtime. Instalalo o definí LVM_NDI_RUNTIME_DIR y repetí ndi:setup.')
  process.exit(2)
}
process.env.LVM_NDI_RUNTIME_DIR = runtimeDir
const require = createRequire(import.meta.url)
const native = require(addonFile)
const handle = native.create({ name: 'LVM NDI Native Verify', width: 2, height: 2, fps: 30, format: 'BGRA' })
try {
  native.send(handle, Buffer.from([0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255]), 8)
  console.log('NDI runtime cargado; sender creado; primer frame entregado al SDK.')
} finally {
  native.destroy(handle)
}
