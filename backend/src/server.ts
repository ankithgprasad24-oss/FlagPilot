import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { loadConfig, type BackendConfig, type EnvironmentName } from './config.js'
import { FlagsmithService, FlagsmithServiceError } from './flagsmith.js'

const supportedEnvironments = new Set<EnvironmentName>(['Development', 'Staging', 'Production'])

type FlagsmithApi = Pick<FlagsmithService, 'evaluateFlags' | 'getConfiguredEnvironments'>

export function createApp(config: BackendConfig, flagsmith: FlagsmithApi = new FlagsmithService(config)) {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxyHops)
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    methods: ['GET', 'OPTIONS'],
    credentials: false,
    maxAge: 600,
  }))
  app.use(rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait briefly, then try again.' },
      })
    },
  }))
  app.use(express.raw({ limit: '10kb', type: () => true }))
  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'OPTIONS') {
      response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are supported.' } })
      return
    }
    if (request.method === 'GET' && Object.keys(request.query).length > 0) {
      response.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Query parameters are not supported.' } })
      return
    }
    if (request.method === 'GET' && (
      request.body !== undefined ||
      (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') ||
      request.headers['transfer-encoding'] !== undefined
    )) {
      response.status(400).json({ error: { code: 'REQUEST_BODY_NOT_ALLOWED', message: 'Request bodies are not supported.' } })
      return
    }
    next()
  })

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'flagpilot-backend' })
  })

  app.get('/api/flagsmith/environments', (_request, response) => {
    response.json({ environments: flagsmith.getConfiguredEnvironments() })
  })

  function resolveEnvironment(value: string, response: Response): EnvironmentName | undefined {
    if (!supportedEnvironments.has(value as EnvironmentName)) {
      response.status(400).json({
        error: { code: 'INVALID_ENVIRONMENT', message: 'Environment must be Development, Staging, or Production.' },
      })
      return undefined
    }
    return value as EnvironmentName
  }

  async function sendConnection(environment: EnvironmentName, response: Response, next: (error?: unknown) => void) {
    try {
      const evaluatedFlags = await flagsmith.evaluateFlags(environment)
      response.json({
        connected: true,
        environment,
        flagCount: evaluatedFlags.length,
        verifiedAt: new Date().toISOString(),
      })
    } catch (error) {
      next(error)
    }
  }

  async function sendFlags(environment: EnvironmentName, response: Response, next: (error?: unknown) => void) {
    try {
      const evaluatedFlags = await flagsmith.evaluateFlags(environment)
      response.json({
        source: 'flagsmith',
        environment,
        evaluatedAt: new Date().toISOString(),
        flags: evaluatedFlags,
      })
    } catch (error) {
      next(error)
    }
  }

  app.get('/api/flagsmith/environments/:environment/connection', (request, response, next) => {
    const environment = resolveEnvironment(request.params.environment, response)
    if (environment) void sendConnection(environment, response, next)
  })
  app.get('/api/flagsmith/environments/:environment/flags', (request, response, next) => {
    const environment = resolveEnvironment(request.params.environment, response)
    if (environment) void sendFlags(environment, response, next)
  })
  app.get('/api/flagsmith/connection', (_request, response, next) => {
    void sendConnection(config.defaultEnvironment, response, next)
  })
  app.get('/api/flagsmith/flags', (_request, response, next) => {
    void sendFlags(config.defaultEnvironment, response, next)
  })

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } })
  })

  const errorHandler: ErrorRequestHandler = (error: unknown, _request: Request, response: Response, _next) => {
    void _next
    if (error instanceof FlagsmithServiceError) {
      console.error(`[flagsmith] ${error.code}`)
      response.status(error.statusCode).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (typeof error === 'object' && error !== null && 'type' in error) {
      const type = error.type
      if (type === 'entity.too.large') {
        response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 10 KB limit.' } })
        return
      }
    }
    console.error('[backend] Request failed')
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The backend could not complete the request.' } })
  }
  app.use(errorHandler)
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig()
  const app = createApp(config)
  const port = process.env.PORT ? Number(process.env.PORT) : 3002
  app.listen(port, '0.0.0.0', () => {
    console.info(`FlagPilot backend listening on 0.0.0.0:${port}`)
    if (Object.values(config.environmentKeys).every((key) => key.length === 0)) {
      console.info('Flagsmith is not configured. Set one or more Environment Keys in backend/.env to enable Live Mode.')
    }
  })
}
