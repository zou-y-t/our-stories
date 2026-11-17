import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const root = path.join(projectRoot, 'dist')
const publicRoot = path.join(projectRoot, 'public')
const base = '/our-stories'
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (url.pathname === base) {
    response.writeHead(302, { Location: `${base}/` }).end()
    return
  }
  if (!url.pathname.startsWith(`${base}/`)) {
    response.writeHead(404).end('Not found')
    return
  }
  let relative
  try {
    relative = decodeURIComponent(url.pathname.slice(base.length + 1))
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  const liveAsset = relative === 'story-index.json' || relative.startsWith('china/')
  const sourceRoot = liveAsset ? publicRoot : root
  let file = path.resolve(sourceRoot, relative || 'index.html')
  if (file !== sourceRoot && !file.startsWith(`${sourceRoot}${path.sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    if (relative === 'story-index.json') {
      await import('./build-stories.mjs?updated=' + Date.now())
    }
    const info = await stat(file)
    if (info.isDirectory()) file = path.join(file, 'index.html')
    await stat(file)
  } catch {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
})

const port = Number(process.env.PORT || 4173)
server.listen(port, '0.0.0.0', () => console.log(`Preview available at http://localhost:${port}${base}/`))
