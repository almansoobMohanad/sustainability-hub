// Writes compressed copies (.br and .gz) of a built folder's text files, e.g.
//   node scripts/precompress.mjs apps/app/dist
// The API sends them to browsers that accept them (serveStatic `precompressed`),
// so code and styles travel 70-80% smaller without compressing on every request.
// Run once per build (the Dockerfile does); the originals stay for other browsers.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: node scripts/precompress.mjs <folder>')
  process.exit(1)
}

// Text formats only: images like PNG and fonts like WOFF2 are compressed already
const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.webmanifest'])
const MIN_BYTES = 1024 // tiny files gain nothing

let files = 0
let before = 0
let after = 0
for (const path of walk(dir)) {
  if (!COMPRESSIBLE.has(extname(path))) continue
  const content = readFileSync(path)
  if (content.length < MIN_BYTES) continue
  const brotli = brotliCompressSync(content, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: content.length },
  })
  writeFileSync(`${path}.br`, brotli)
  writeFileSync(`${path}.gz`, gzipSync(content, { level: 9 }))
  files += 1
  before += content.length
  after += brotli.length
}
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`
console.log(`Precompressed ${files} files in ${dir}: ${kb(before)} -> ${kb(after)} with Brotli.`)

function* walk(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (!name.endsWith('.br') && !name.endsWith('.gz')) yield path
  }
}
