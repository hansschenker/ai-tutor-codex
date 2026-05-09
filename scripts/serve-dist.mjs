import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = join(process.cwd(), 'dist')
const host = '127.0.0.1'
const port = Number(process.env.PORT || 5174)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  const cleanPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(root, cleanPath)

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, 'index.html')
  }

  response.setHeader('Content-Type', types[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath)
    .on('error', () => {
      response.statusCode = 404
      response.end('Not found')
    })
    .pipe(response)
}).listen(port, host, () => {
  console.log(`AI Tutor is running at http://${host}:${port}/`)
})
