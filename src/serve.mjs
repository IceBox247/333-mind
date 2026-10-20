// Local preview: node src/serve.mjs -> http://localhost:4747
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site')
const types = { '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' }
createServer(async (req, res) => {
  const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(SITE, path.replace(/\.\./g, '')))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end('not found') }
}).listen(4747, () => console.log('http://localhost:4747'))
