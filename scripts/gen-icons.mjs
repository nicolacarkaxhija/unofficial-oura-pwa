// Generates placeholder PWA icons (public/icon-192.png, public/icon-512.png)
// using only Node.js built-ins (zlib, fs). No external dependencies.
//
// WHY placeholder icons exist in the repo: vite-plugin-pwa requires icon paths
// to exist at build time. Replace with properly designed assets before launch.
//
// The icons are solid emerald (#10b981) squares — the app's primary accent colour.

import { createWriteStream } from 'fs'
import { deflateSync } from 'zlib'

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = u32be(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcBytes = u32be(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcBytes])
}

function makePng(size, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)  // width
  ihdr.writeUInt32BE(size, 4)  // height
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // colour type: RGB
  // compression=0, filter=0, interlace=0 are already 0

  // Build raw scanlines: each row is [filter_byte=0, R, G, B, R, G, B, ...]
  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    const base = y * rowSize
    raw[base] = 0  // filter type: None
    for (let x = 0; x < size; x++) {
      raw[base + 1 + x * 3] = r
      raw[base + 2 + x * 3] = g
      raw[base + 3 + x * 3] = b
    }
  }

  const idat = deflateSync(raw)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Emerald #10b981 → rgb(16, 185, 129)
const R = 16, G = 185, B = 129

for (const size of [192, 512]) {
  const png = makePng(size, R, G, B)
  const path = `public/icon-${size}.png`
  createWriteStream(path).end(png)
  console.log(`wrote ${path} (${size}x${size}, ${png.length} bytes)`)
}

// Maskable variant: declared in the manifest with purpose 'maskable'. A solid
// square is inherently safe-zone-compliant, so it's a byte-identical copy —
// it exists as a separate file so a future designed icon can differ.
{
  const png = makePng(512, R, G, B)
  createWriteStream('public/icon-512-maskable.png').end(png)
  console.log('wrote public/icon-512-maskable.png')
}
