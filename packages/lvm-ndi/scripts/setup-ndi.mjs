import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRuntime, findSdk, sdkCandidates } from './sdk-paths.mjs'
import { prepareOfficialSdk } from './download-sdk.mjs'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
let sdkDir = findSdk({ packageDir })

if (!sdkDir && process.env.LVM_NDI_AUTO_DOWNLOAD !== '0') {
  try {
    sdkDir = await prepareOfficialSdk(packageDir)
  } catch (error) {
    console.error(`No se pudo preparar automáticamente el SDK: ${error.message}`)
  }
}

if (!sdkDir) {
  console.error('NDI SDK no encontrado. Busqué los headers oficiales en:')
  for (const candidate of sdkCandidates(process.env, packageDir)) console.error(`  ${candidate}`)
  console.error('También podés obtener el SDK desde https://ndi.video/for-developers/ndi-sdk/download/ y definir LVM_NDI_SDK_DIR.')
  process.exitCode = 2
} else {
  const runtimeDir = findRuntime(sdkDir)
  const output = join(packageDir, '.ndi-cache', 'ndi-setup.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify({ sdkDir, runtimeDir }, null, 2) + '\n')
  console.log(`NDI SDK: ${sdkDir}`)
  console.log(`NDI runtime: ${runtimeDir ?? 'no encontrado (requerido para ndi:verify)'}`)
  console.log('Configuración local preparada. Ejecutá npm run ndi:build.')
}
