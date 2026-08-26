import { handle } from 'hono/vercel'
import app from '../src/app'

// Vercel's zero-config Node.js function builder picks up any file under
// api/ automatically, no functions/routes config needed. hono/vercel's
// handle() adapts the app to the Web-standard Request/Response signature
// that convention expects. This runs on the Node.js runtime (the default,
// not Edge), which src/lib/cache.ts needs for node:crypto.
export default handle(app)
