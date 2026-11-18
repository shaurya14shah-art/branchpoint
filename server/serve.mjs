// Production server: serves the built app (dist/) and the optional AI endpoints.
// Build first with `npm run build`. Set ANTHROPIC_API_KEY in the environment to enable AI.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const { handleAi } = await import(join(root, 'dist-server', 'aiCore.js'))
const port = Number(process.env.PORT ?? 5251)

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' }

createServer(async (req, res) => {
  try {
    if (await handleAi(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      return res.end()
    }
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    let file = join(dist, path)
    if (!file.startsWith(dist)) {
      res.statusCode = 403
      return res.end()
    }
    const s = await stat(file).catch(() => null)
    if (!s || s.isDirectory()) file = join(dist, 'index.html')
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
    if (file.includes(`${join(dist, 'assets')}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    res.setHeader('x-content-type-options', 'nosniff')
    res.end(await readFile(file))
  } catch (e) {
    console.error(e)
    res.statusCode = 500
    res.end('Internal error')
  }
}).listen(port, () => console.log(`Branchpoint on http://localhost:${port} (AI ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled'})`))
