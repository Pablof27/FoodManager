import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const DATA_FILE_PATH = path.resolve(import.meta.dirname, 'data/foodmanager-data.json')

function localSnapshotPlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const reqPath = req.url?.split('?')[0]
    if (reqPath !== '/api/snapshot') {
      next()
      return
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      if (!fs.existsSync(DATA_FILE_PATH)) {
        res.statusCode = 204
        res.end()
        return
      }
      try {
        const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8')
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(raw)
      } catch {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'Failed to read snapshot file' }))
      }
      return
    }

    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          const parsed = JSON.parse(body) as unknown
          if (!parsed || typeof parsed !== 'object') {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid snapshot payload' }))
            return
          }
          fs.mkdirSync(path.dirname(DATA_FILE_PATH), { recursive: true })
          const tmpPath = `${DATA_FILE_PATH}.tmp`
          fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), 'utf-8')
          fs.renameSync(tmpPath, DATA_FILE_PATH)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
      return
    }

    res.statusCode = 405
    res.end()
  }

  return {
    name: 'foodmanager-local-snapshot',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localSnapshotPlugin()],
  server: {
    watch: {
      ignored: ['**/data/**'],
    },
  },
})
