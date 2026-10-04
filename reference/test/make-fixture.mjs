// Builds test/fixtures/sample.pak from the simulated device (used by the UI check).
import { writeFileSync } from 'node:fs'
import { MockEP133 } from './mock-device.js'
import { Session } from '../src/protocol/session.js'
import { backupDevice } from '../src/backup.js'
import { demoDevice } from './demo-data.js'

const dev = new MockEP133(demoDevice())
const s = new Session(dev.transport())
await s.handshake()
const { blob } = await backupDevice(s)
writeFileSync(new URL('./fixtures/sample.pak', import.meta.url), new Uint8Array(await blob.arrayBuffer()))
console.log('wrote sample.pak', blob.size)
