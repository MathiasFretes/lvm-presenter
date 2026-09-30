import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const header = 'Processing.NDI.Lib.h'
const dll = 'Processing.NDI.Lib.x64.dll'

function unique(paths) {
  return [...new Set(paths.filter(Boolean).map((path) => resolve(path)))]
}

export function sdkCandidates(env = process.env, packageDir) {
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  return unique([
    env.LVM_NDI_SDK_DIR,
    env.NDI_SDK_DIR,
    packageDir && join(packageDir, '.ndi-cache', 'sdk-unpacked', 'app'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'LVM', 'ndi-sdk'),
    join(programFiles, 'NDI', 'NDI 6 SDK'),
    join(programFilesX86, 'NDI', 'NDI 6 SDK')
  ])
}

export function findSdk({ env = process.env, exists = existsSync, packageDir } = {}) {
  return sdkCandidates(env, packageDir).find((directory) => exists(join(directory, 'Include', header))) ?? null
}

export function runtimeCandidates(sdkDir, env = process.env) {
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  return unique([
    env.LVM_NDI_RUNTIME_DIR,
    env.NDI_RUNTIME_DIR_V6,
    env.NDI_RUNTIME_DIR_V5,
    sdkDir && join(sdkDir, 'Bin', 'x64'),
    sdkDir && join(sdkDir, 'Lib', 'x64'),
    join(programFiles, 'NDI', 'NDI 6 Runtime', 'v6')
  ])
}

export function findRuntime(sdkDir, { env = process.env, exists = existsSync } = {}) {
  return runtimeCandidates(sdkDir, env).find((directory) => exists(join(directory, dll))) ?? null
}
