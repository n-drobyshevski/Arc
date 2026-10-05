// Port of core/src/main/kotlin/dev/arc/ep133/formats/Crc32.kt (+ reference/src/formats/crc32.js)
//
// Standard IEEE CRC-32 (reflected, polynomial 0xEDB88320), the same as java.util.zip.CRC32.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/**
 * CRC-32 of [data], as an unsigned number (0..2^32-1). Pass a previous result
 * as [crc] to continue over more data.
 */
export function crc32(data: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
