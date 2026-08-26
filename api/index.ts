import { handle } from 'hono/vercel'
import app from '../src/app'

// Vercel's zero-config Node.js function builder picks up any file under
// api/ automatically, no functions/routes config needed. This runs on the
// Node.js runtime (the default, not Edge), which src/lib/cache.ts needs for
// node:crypto.
//
// Must be a named `fetch` export, not `export default`: a default export
// gets treated as Vercel's legacy (req, res) => void handler, which hands
// Hono something that isn't a real Fetch Request (no .headers.get()),
// breaking the CORS middleware. A named fetch export gets the real
// Web-standard Request that hono/vercel's handle() expects.
export const fetch = handle(app)
