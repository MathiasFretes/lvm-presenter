import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// Pinned official NDI 6.3.2 installer and the extractor publisher's Windows binary.
const artifacts = [
  {
    name: 'NDI 6 SDK.exe',
    url: 'https://downloads.ndi.tv/SDK/NDI_SDK/NDI%206%20SDK.exe',
    sha256: '4d5dd36a1c7c7634f408bf459b068787cce6f5310a3efe832d76b1ddeb54e499',
    maxBytes: 100_000_000
  },
  {
    name: 'innoextract-1.9-windows.zip',
    url: 'https://constexpr.org/innoextract/files/innoextract-1.9-windows.zip',
    sha256: '6989342c9b026a00a72a38f23b62a8e6a22cc5de69805cf47d68ac2fec993065',
    maxBytes: 5_000_000
  }
]

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function ensureDownload(cacheDir, artifact) {
  const target = join(cacheDir, artifact.name)
  if (existsSync(target)) {
    if (await digest(target) !== artifact.sha256) throw new Error(`Checksum incorrecto en ${target}`)
    return target
  }
  console.log(`Descargando ${artifact.name} desde ${artifact.url}`)
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok || !response.body) throw new Error(`Descarga falló: HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > artifact.maxBytes) throw new Error('Descarga excede el tamaño esperado')
  const temporary = `${target}.${randomUUID()}.part`
  let bytes = 0
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > artifact.maxBytes ? new Error('Descarga excede el tamaño esperado') : null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary, { flags: 'wx' }))
    if (await digest(temporary) !== artifact.sha256) throw new Error(`Checksum incorrecto en ${target}`)
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error })
  }
  return target
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} falló (código ${result.status})`)
}

export async function prepareOfficialSdk(packageDir) {
  if (process.platform !== 'win32') throw new Error('La descarga automática de NDI SDK 6.3.2 solo está preparada para Windows x64')
  const cache = join(packageDir, '.ndi-cache')
  await mkdir(cache, { recursive: true })
  const installer = await ensureDownload(cache, artifacts[0])
  const extractorZip = await ensureDownload(cache, artifacts[1])
  run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', join(packageDir, 'scripts', 'check-ndi-signature.ps1'), '-InstallerPath', installer], 'Verificación de firma')
  const extractorDir = join(cache, 'innoextract')
  await mkdir(extractorDir, { recursive: true })
  const extractor = join(extractorDir, 'innoextract.exe')
  if (!existsSync(extractor)) run('tar.exe', ['-xf', extractorZip, '-C', extractorDir], 'Extracción de innoextract')
  const sdkDir = join(cache, 'sdk-unpacked')
  await mkdir(sdkDir, { recursive: true })
  run(extractor, ['--silent', '--extract', '--output-dir', sdkDir, installer], 'Extracción del SDK oficial')
  const header = join(sdkDir, 'app', 'Include', 'Processing.NDI.Lib.h')
  if (!existsSync(header)) throw new Error(`La extracción no produjo el header esperado: ${header}`)
  return join(sdkDir, 'app')
}
