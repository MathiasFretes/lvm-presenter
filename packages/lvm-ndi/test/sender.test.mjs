import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NdiSender, validateConfig, validateFrame } from '../src/index.mjs'

const config = { name: 'LVM Presenter - Congregación', width: 1920, height: 1080, fps: 30, format: 'BGRA' }

test('accepts a 1080p frame and preserves lifecycle', async () => {
  const calls = []
  const native = {
    create: (input) => { calls.push(['create', input.name]); return {} },
    send: (_handle, data, stride) => calls.push(['send', data.byteLength, stride]),
    destroy: () => calls.push(['destroy'])
  }
  const sender = new NdiSender(native)
  await sender.start(config)
  const data = new Uint8Array(config.width * config.height * 4)
  sender.send({ data, width: config.width, height: config.height, stride: config.width * 4 })
  await sender.stop()
  assert.equal(sender.getStatus(), 'stopped')
  assert.deepEqual(calls, [['create', config.name], ['send', data.byteLength, 7680], ['destroy']])
})

test('rejects invalid source names and dimensions', () => {
  assert.throws(() => validateConfig({ ...config, name: 'bad/name' }), /name/)
  assert.throws(() => validateConfig({ ...config, width: 1919 }), /dimensions/)
})

test('rejects short or mismatched frames', () => {
  assert.throws(() => validateFrame({ data: new Uint8Array(4), width: 1920, height: 1080, stride: 7680 }, config), /shorter/)
  assert.throws(() => validateFrame({ data: new Uint8Array(4), width: 1280, height: 720, stride: 5120 }, config), /differ/)
})

test('missing native runtime reports a clear state', async () => {
  const sender = new NdiSender({ create: () => { throw new Error('runtime missing') } })
  await assert.rejects(sender.start(config), /runtime missing/)
  assert.equal(sender.getStatus(), 'runtime-unavailable')
})

test('sender creation failure is distinct from missing runtime', async () => {
  const sender = new NdiSender({ create: () => { throw new Error('sender creation failed') } })
  await assert.rejects(sender.start(config), /creation failed/)
  assert.equal(sender.getStatus(), 'error')
})
