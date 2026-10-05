// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Errors.kt (+ reference/src/protocol/session.js, fs.js)

/** Anything the device refused or failed to do. */
export class DeviceError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'DeviceError'
    this.status = status
  }
}

/** The device did not answer a request in time. */
export class TimeoutError extends DeviceError {
  constructor(label: string) {
    super(`The device did not answer (${label}). Check the cable and try again.`)
    this.name = 'TimeoutError'
  }
}

/**
 * The user cancelled a backup or restore. Cancelling stops between items,
 * it does not tear down a transfer in the middle.
 */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}
