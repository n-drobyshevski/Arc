// Port of core/src/test/kotlin/dev/arc/ep133/formats/ParityTest.kt (format cases only)
//
// The other ParityTest cases check the Kotlin re-implementations of JS
// built-ins (TextDecoder, number printing, JSON.parse depth, Date.parse) and
// are native on the web, so they are not ported. These two pin the error
// behaviour of zip.ts and wav.ts.

import { describe, expect, it } from 'vitest'
import { DATAVIEW_RANGE, inflateRaw } from '../../../src/core/formats/zip'
import { decodeWav, encodeWav } from '../../../src/core/formats/wav'
import { hexBytes } from '../../../src/core/util/bytes'

describe('ParityTest', () => {
  it('truncated deflate data is rejected like DecompressionStream does', async () => {
    expect(new TextDecoder().decode(await inflateRaw(hexBytes('4b 4c 4a 06 00'), 'x'))).toBe('abc')
    await expect(inflateRaw(hexBytes('4b 4c 4a 06'), 'x')).rejects.toThrow(new Error('Damaged data in x'))
  })

  it('out of bounds reads use the DataView message', () => {
    const wav = encodeWav(new Uint8Array(4), 1, 8000).slice(0, 30) // fmt chunk cut short
    // The clamped chunk walk reads past the end while parsing "fmt ".
    expect(() => decodeWav(wav)).toThrow(new RangeError(DATAVIEW_RANGE))
  })
})
