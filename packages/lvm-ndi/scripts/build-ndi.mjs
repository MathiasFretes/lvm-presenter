import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const configFile = join(packageDir, 'build', 'ndi-setup.json')
if (!existsSync(configFile)) {
  console.error('Falta la configuración local. Ejecutá npm run ndi:setup primero.')
  process.exit(2)
}
const { sdkDir } = JSON.parse(await readFile(configFile, 'utf8'))
if (!sdkDir || !existsSync(join(sdkDir, 'Include', 'Processing.NDI.Lib.h'))) {
  console.error('Los headers del SDK ya no están en la ruta detectada. Repetí npm run ndi:setup.')
  process.exit(2)
}
const nodeGyp = join(packageDir, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
if (!existsSync(nodeGyp)) {
  console.error('Falta node-gyp local. Ejecutá npm ci en packages/lvm-ndi.')
  process.exit(2)
}
const run = spawnSync(process.execPath, [nodeGyp, 'rebuild', `--ndi_sdk_dir=${sdkDir}`], {
  cwd: packageDir,
  stdio: 'inherit',
  env: process.env
})
if (run.error) throw run.error
process.exitCode = run.status ?? 1
