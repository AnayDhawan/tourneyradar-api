import { cors } from 'hono/cors'

export const corsMiddleware = cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
})
