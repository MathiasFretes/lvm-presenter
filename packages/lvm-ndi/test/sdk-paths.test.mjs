import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { findRuntime, findSdk, runtimeCandidates, sdkCandidates } from '../scripts/sdk-paths.mjs'

test('prefers an explicit official SDK location and verifies its header', () => {
  const env = { LVM_NDI_SDK_DIR: 'C:\\NDI SDK', ProgramFiles: 'C:\\Program Files' }
  const sdk = resolve(env.LVM_NDI_SDK_DIR)
  const exists = (path) => path === join(sdk, 'Include', 'Processing.NDI.Lib.h')
  assert.equal(findSdk({ env, exists }), sdk)
  assert.equal(sdkCandidates(env)[0], sdk)
})

test('does not accept a folder without the SDK header', () => {
  assert.equal(findSdk({ env: { LVM_NDI_SDK_DIR: 'C:\\empty' }, exists: () => false }), null)
})

test('finds a runtime DLL without requiring it for SDK detection', () => {
  const env = { LVM_NDI_RUNTIME_DIR: 'C:\\NDI Runtime', ProgramFiles: 'C:\\Program Files' }
  const runtime = resolve(env.LVM_NDI_RUNTIME_DIR)
  const exists = (path) => path === join(runtime, 'Processing.NDI.Lib.x64.dll')
  assert.equal(findRuntime(null, { env, exists }), runtime)
  assert.equal(runtimeCandidates(null, env)[0], runtime)
})

test('finds the package cache produced by automatic extraction', () => {
  const packageDir = resolve('C:\\lvm-ndi')
  const sdk = join(packageDir, '.ndi-cache', 'sdk-unpacked', 'app')
  const exists = (path) => path === join(sdk, 'Include', 'Processing.NDI.Lib.h')
  assert.equal(findSdk({ env: {}, exists, packageDir }), sdk)
})
