export type NdiPixelFormat = 'BGRA' | 'RGBA'

export interface NdiSenderConfig {
  name: string
  width: number
  height: number
  fps: 30 | 60
  format: NdiPixelFormat
}

export interface NdiVideoFrame {
  data: Uint8Array
  width: number
  height: number
  stride: number
}

export type NdiStatus = 'stopped' | 'active' | 'runtime-unavailable' | 'error'

export interface NdiNative {
  create(config: NdiSenderConfig): object
  send(handle: object, data: Uint8Array, stride: number): void
  destroy(handle: object): void
}

export function validateConfig(config: NdiSenderConfig): void
export function validateFrame(frame: NdiVideoFrame, config: NdiSenderConfig): void

export class NdiSender {
  constructor(native?: NdiNative)
  start(config: NdiSenderConfig): Promise<void>
  send(frame: NdiVideoFrame): void
  stop(): Promise<void>
  getStatus(): NdiStatus
}
