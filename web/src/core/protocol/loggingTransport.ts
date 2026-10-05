// Port of core/src/main/kotlin/dev/arc/ep133/protocol/TrafficLog.kt (LoggingTransport)

import type { TrafficLog } from './trafficLog'
import type { Transport } from './transport'

/** Wraps a transport so everything sent and received is recorded in [log]. */
export class LoggingTransport implements Transport {
  private readonly inner: Transport
  private readonly log: TrafficLog

  constructor(inner: Transport, log: TrafficLog) {
    this.inner = inner
    this.log = log
  }

  send(b: Uint8Array): void {
    this.log.out(b)
    this.inner.send(b)
  }

  onMessage(cb: (b: Uint8Array) => void): () => void {
    return this.inner.onMessage((b) => {
      this.log.inbound(b)
      cb(b)
    })
  }

  close(): void {
    this.log.note('transport closed')
    this.inner.close?.()
  }
}
