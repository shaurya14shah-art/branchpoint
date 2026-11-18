import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

/**
 * Dev-server middleware: serves /api/ai/* from the Vite process so the key never reaches the
 * client. The handler is loaded through Vite's SSR loader (not imported by the config).
 */
export function aiDevMiddleware(): Plugin {
  return {
    name: 'branchpoint-ai',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/ai/')) return next()
        server
          .ssrLoadModule('/server/aiCore.ts')
          .then((m) => (m.handleAi as Handler)(req, res))
          .then((handled) => !handled && next(), next)
      })
    },
  }
}
