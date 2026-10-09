import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function validateConfig(config) {
  if (!config || typeof config.name !== 'string' || !config.name.trim() ||
      Buffer.byteLength(config.name, 'utf8') > 253 || /[\\/:*?"<>|]/.test(config.name)) {
    throw new TypeError('NDI source name must be nonempty, at most 253 UTF-8 bytes, and contain no reserved characters')
  }
  if (!Number.isInteger(config.width) || config.width < 2 || config.width > 7680 || config.width % 2 ||
      !Number.isInteger(config.height) || config.height < 1 || config.height > 4320) {
    throw new RangeError('NDI frame dimensions must be positive, bounded, and have an even width')
  }
  if (config.fps !== 30 && config.fps !== 60) throw new RangeError('NDI 0.1 supports 30 or 60 fps')
  if (config.format !== 'BGRA' && config.format !== 'RGBA') throw new TypeError('NDI 0.1 supports BGRA or RGBA')
}

export function validateFrame(frame, config) {
  if (!frame || !(frame.data instanceof Uint8Array)) throw new TypeError('NDI frame data must be Uint8Array')
  if (frame.width !== config.width || frame.height !== config.height) throw new RangeError('NDI frame dimensions differ from sender')
  if (!Number.isInteger(frame.stride) || frame.stride < config.width * 4 ||
      frame.stride > Number.MAX_SAFE_INTEGER / config.height) {
    throw new RangeError('NDI frame stride is invalid')
  }
  const needed = frame.stride * (frame.height - 1) + frame.width * 4
  if (frame.data.byteLength < needed) throw new RangeError('NDI frame buffer is shorter than stride and dimensions require')
}

function loadNative() {
  try {
    return require('../build/Release/lvm_ndi.node')
  } catch (error) {
    throw new Error('LVM NDI native addon or NDI runtime unavailable; build with the official NDI SDK and install its runtime', { cause: error })
  }
}

export class NdiSender {
  #native
  #handle = null
  #config = null
  #status = 'stopped'

  constructor(native) { this.#native = native }

  async start(config) {
    if (this.#handle) throw new Error('NDI sender is already active')
    validateConfig(config)
    try {
      const native = this.#native ?? loadNative()
      this.#handle = native.create(config)
      this.#native = native
      this.#config = { ...config }
      this.#status = 'active'
    } catch (error) {
      this.#status = /runtime|native addon/i.test(String(error?.message)) ? 'runtime-unavailable' : 'error'
      throw error
    }
  }

  send(frame) {
    if (!this.#handle) throw new Error('NDI sender is not active')
    validateFrame(frame, this.#config)
    const data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
    this.#native.send(this.#handle, data, frame.stride)
  }

  async stop() {
    if (this.#handle) this.#native.destroy(this.#handle)
    this.#handle = null
    this.#config = null
    this.#status = 'stopped'
  }

  getStatus() { return this.#status }
}
