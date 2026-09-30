import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRuntime, findSdk, sdkCandidates } from './sdk-paths.mjs'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sdkDir = findSdk()

if (!sdkDir) {
  console.error('NDI SDK no encontrado. Busqué los headers oficiales en:')
  for (const candidate of sdkCandidates()) console.error(`  ${candidate}`)
  console.error('Obtené el SDK oficial en https://ndi.video/for-developers/ndi-sdk/download/ (requiere formulario).')
  console.error('Una vez disponible, instalalo en su ruta predeterminada o definí LVM_NDI_SDK_DIR.')
  process.exitCode = 2
} else {
  const runtimeDir = findRuntime(sdkDir)
  const output = join(packageDir, 'build', 'ndi-setup.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify({ sdkDir, runtimeDir }, null, 2) + '\n')
  console.log(`NDI SDK: ${sdkDir}`)
  console.log(`NDI runtime: ${runtimeDir ?? 'no encontrado (requerido para ndi:verify)'}`)
  console.log('Configuración local preparada. Ejecutá npm run ndi:build.')
}
