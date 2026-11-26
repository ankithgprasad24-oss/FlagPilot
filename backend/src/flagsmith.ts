import type { IFlags, IFlagsmith, IInitConfig } from '@flagsmith/flagsmith'
import type { FlagValue } from './types.js'
import type { BackendConfig, EnvironmentName } from './config.js'

export const DEFAULT_FLAGSMITH_API_URL = 'https://edge.api.flagsmith.com/api/v1/'
const UPSTREAM_TIMEOUT_MS = 10_000

export function normalizeApiUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('FLAGSMITH_API_URL must be a valid URL.')
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('FLAGSMITH_API_URL must use HTTPS.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('FLAGSMITH_API_URL cannot include credentials, query parameters, or a fragment.')
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol === 'http:' && !isLoopback) {
    throw new Error('FLAGSMITH_API_URL must use HTTPS unless it targets a loopback host.')
  }
  return `${parsed.toString().replace(/\/+$/, '')}/`
}

export type EvaluatedFlag = {
  id: string
  key: string
  enabled: boolean
  value: FlagValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFlagValue(value: unknown): value is FlagValue {
  return value === null || typeof value === 'string' || typeof value === 'number' ||
    typeof value === 'boolean' || Array.isArray(value) || isRecord(value)
}

function validateUpstreamFlags(value: unknown): void {
  if (!Array.isArray(value) || value.some((entry) =>
    !isRecord(entry) || typeof entry.enabled !== 'boolean' ||
    !isRecord(entry.feature) || typeof entry.feature.name !== 'string' ||
    !entry.feature.name.trim() || !isFlagValue(entry.feature_state_value))) {
    throw new FlagsmithServiceError(
      'Flagsmith returned an unexpected response. Check the API URL and try again.',
      502,
      'FLAGSMITH_MALFORMED_RESPONSE',
    )
  }
}

function mapFlags(flags: IFlags): EvaluatedFlag[] {
  if (!isRecord(flags)) {
    throw new FlagsmithServiceError(
      'Flagsmith returned an unexpected response. Check the API URL and try again.',
      502,
      'FLAGSMITH_MALFORMED_RESPONSE',
    )
  }
  return Object.entries(flags).map(([key, flag]) => {
    if (!key.trim() || !isRecord(flag) || typeof flag.enabled !== 'boolean' || !isFlagValue(flag.value)) {
      throw new FlagsmithServiceError(
        'Flagsmith returned an unexpected response. Check the API URL and try again.',
        502,
        'FLAGSMITH_MALFORMED_RESPONSE',
      )
    }
    return {
      id: key,
      key,
      enabled: flag.enabled,
      value: flag.value,
    }
  })
}

export class FlagsmithServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'FlagsmithServiceError'
  }
}

type FlagsmithClient = Pick<IFlagsmith, 'init' | 'getAllFlags'>
type FlagsmithDependencies = {
  createClient?: () => Promise<FlagsmithClient>
  fetch?: typeof fetch
  timeoutMs?: number
}

function classifyUpstreamStatus(status: number): FlagsmithServiceError {
  if (status === 401 || status === 403) {
    return new FlagsmithServiceError(
      'Flagsmith rejected the environment key or does not permit this evaluation.',
      502,
      'FLAGSMITH_PERMISSION_DENIED',
    )
  }
  if (status === 404) {
    return new FlagsmithServiceError(
      'The Flagsmith API endpoint was not found. Check FLAGSMITH_API_URL.',
      502,
      'FLAGSMITH_API_NOT_FOUND',
    )
  }
  if (status === 429) {
    return new FlagsmithServiceError(
      'Flagsmith is rate limiting requests. Wait briefly, then retry.',
      503,
      'FLAGSMITH_RATE_LIMITED',
    )
  }
  return new FlagsmithServiceError(
    'Flagsmith is temporarily unavailable. Try again shortly.',
    502,
    'FLAGSMITH_UPSTREAM_ERROR',
  )
}

export class FlagsmithService {
  private readonly createClient: () => Promise<FlagsmithClient>
  private readonly upstreamFetch: typeof fetch
  private readonly timeoutMs: number

  constructor(private readonly config: BackendConfig, dependencies: FlagsmithDependencies = {}) {
    this.createClient = dependencies.createClient ?? (async () => {
      const { createFlagsmithInstance } = await import('@flagsmith/flagsmith')
      return createFlagsmithInstance()
    })
    this.upstreamFetch = dependencies.fetch ?? fetch
    this.timeoutMs = dependencies.timeoutMs ?? UPSTREAM_TIMEOUT_MS
  }

  getConfiguredEnvironments(): EnvironmentName[] {
    return (Object.keys(this.config.environmentKeys) as EnvironmentName[])
      .filter((environment) => this.config.environmentKeys[environment].length > 0)
  }

  async evaluateFlags(environment: EnvironmentName): Promise<EvaluatedFlag[]> {
    const environmentKey = this.config.environmentKeys[environment]
    if (!environmentKey) {
      throw new FlagsmithServiceError(
        `No Flagsmith Environment Key is configured for ${environment}.`,
        503,
        'FLAGSMITH_ENVIRONMENT_NOT_CONFIGURED',
      )
    }
    if (this.config.apiUrlError) {
      throw new FlagsmithServiceError(
        'The Flagsmith API URL configured on the backend is invalid. Check FLAGSMITH_API_URL.',
        503,
        'FLAGSMITH_API_URL_INVALID',
      )
    }

    let responseError: FlagsmithServiceError | undefined
    const sdkFetch: NonNullable<IInitConfig['fetch']> = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const requestUrl = String(input)
        const response = await this.upstreamFetch(requestUrl, {
          ...init,
          signal: controller.signal,
        })
        if (!response.ok) {
          responseError = classifyUpstreamStatus(response.status)
          return response
        }
        if (new URL(requestUrl).pathname.endsWith('/flags/')) {
          let payload: unknown
          try {
            payload = await response.clone().json()
          } catch {
            responseError = new FlagsmithServiceError(
              'Flagsmith returned an unreadable response. Check the API URL and try again.',
              502,
              'FLAGSMITH_MALFORMED_RESPONSE',
            )
            throw responseError
          }
          validateUpstreamFlags(payload)
        }
        return response
      } catch (error) {
        if (error instanceof FlagsmithServiceError) {
          responseError = error
          throw error
        }
        if (controller.signal.aborted) {
          responseError = new FlagsmithServiceError(
            'The Flagsmith request timed out. Check the API URL and network, then retry.',
            504,
            'FLAGSMITH_TIMEOUT',
          )
          throw responseError
        }
        responseError = new FlagsmithServiceError(
          'Could not reach Flagsmith. Check the API URL and network, then retry.',
          502,
          'FLAGSMITH_UNREACHABLE',
        )
        throw responseError
      } finally {
        clearTimeout(timer)
      }
    }

    let callbackError: Error | undefined
    try {
      const client = await this.createClient()
      await client.init({
        environmentID: environmentKey,
        api: this.config.apiUrl,
        fetch: sdkFetch,
        cacheFlags: false,
        enableAnalytics: false,
        onError: (error) => { callbackError = error },
      })
      if (responseError) throw responseError
      if (callbackError) {
        throw new FlagsmithServiceError(
          'Flagsmith could not verify this environment. Check the Environment Key and API URL.',
          502,
          'FLAGSMITH_CONNECTION_FAILED',
        )
      }
      return mapFlags(client.getAllFlags())
    } catch (error) {
      if (error instanceof FlagsmithServiceError) throw error
      if (responseError) throw responseError
      throw new FlagsmithServiceError(
        'Flagsmith could not verify this environment. Check the Environment Key and API URL.',
        502,
        'FLAGSMITH_CONNECTION_FAILED',
      )
    }
  }
}
