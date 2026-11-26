import type { Environment, FeatureFlag, FlagType, FlagValue } from '../types'
import type { IntegrationConfig } from './config.ts'
import { isEnvironment } from './environment.ts'

export type IntegrationStatus = 'demo' | 'loading' | 'ready' | 'error'

type BackendFlag = {
  id: string
  key: string
  enabled: boolean
  value: FlagValue
}

type FlagsResponse = {
  source: 'flagsmith'
  environment: Environment
  evaluatedAt: string
  flags: BackendFlag[]
}

type ConnectionResponse = {
  connected: true
  environment: Environment
  flagCount: number
  verifiedAt: string
}

export interface FlagDataSource {
  readonly mode: IntegrationConfig['mode']
  readonly readOnly: boolean
  initialize(
    onFlags: (flags: FeatureFlag[]) => void,
    onError: (error: Error) => void,
    onEnvironment: (environment: Environment) => void,
  ): Promise<void>
  refresh(): Promise<void>
  dispose(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const safeBackendErrors: Record<string, string> = {
  INVALID_ENVIRONMENT: 'The selected environment is not supported.',
  INVALID_QUERY: 'The backend request included unsupported query parameters.',
  METHOD_NOT_ALLOWED: 'This backend supports read-only GET requests only.',
  REQUEST_BODY_NOT_ALLOWED: 'The backend does not accept request bodies.',
  PAYLOAD_TOO_LARGE: 'The backend request exceeded the allowed size.',
  NOT_FOUND: 'The requested backend endpoint was not found.',
  RATE_LIMITED: 'FlagPilot is receiving too many requests. Wait briefly, then try again.',
  FLAGSMITH_ENVIRONMENT_NOT_CONFIGURED: 'No Flagsmith Environment Key is configured for the selected environment.',
  FLAGSMITH_API_URL_INVALID: 'The Flagsmith API URL configured on the backend is invalid.',
  FLAGSMITH_PERMISSION_DENIED: 'Flagsmith rejected the configured Environment Key or evaluation request.',
  FLAGSMITH_API_NOT_FOUND: 'The Flagsmith API endpoint was not found. Check the backend API URL.',
  FLAGSMITH_RATE_LIMITED: 'Flagsmith is rate limiting requests. Wait briefly, then retry.',
  FLAGSMITH_UPSTREAM_ERROR: 'Flagsmith is temporarily unavailable. Try again shortly.',
  FLAGSMITH_TIMEOUT: 'The Flagsmith request timed out. Check the backend service and retry.',
  FLAGSMITH_UNREACHABLE: 'The backend could not reach Flagsmith. Check its API URL and network.',
  FLAGSMITH_CONNECTION_FAILED: 'Flagsmith could not verify the selected environment.',
  FLAGSMITH_MALFORMED_RESPONSE: 'Flagsmith returned data the backend could not validate.',
  INTERNAL_ERROR: 'The backend could not complete the request. Try again shortly.',
}

function getSafeBackendError(body: unknown, status: number): string {
  if (status === 429) return safeBackendErrors.RATE_LIMITED
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined
  const code = error && typeof error.code === 'string' ? error.code : ''
  if (Object.hasOwn(safeBackendErrors, code)) return safeBackendErrors[code]
  if (status >= 500) return 'The backend could not complete the request. Try again shortly.'
  if (status === 404) return 'The requested backend endpoint was not found.'
  if (status >= 400) return 'The backend rejected the request. Check the selected environment and try again.'
  return `Backend request failed (${status}).`
}

async function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal })
  } catch {
    if (signal.aborted) {
      throw new Error('The FlagPilot backend request timed out. Check that the backend and Flagsmith API are responsive.')
    }
    throw new Error('Cannot reach FlagPilot backend. Check its service status, URL, and CORS origin.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(getSafeBackendError(body, response.status))
  }
  if (!isRecord(body)) throw new Error('FlagPilot backend returned an invalid response.')
  return body as T
}

function validateConnection(value: unknown): ConnectionResponse {
  if (!isRecord(value) || value.connected !== true || !isEnvironment(value.environment) ||
      typeof value.flagCount !== 'number' || !Number.isInteger(value.flagCount) || value.flagCount < 0 ||
      typeof value.verifiedAt !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt))) {
    throw new Error('FlagPilot backend did not confirm a valid Flagsmith connection.')
  }
  return value as ConnectionResponse
}

function validateFlags(value: unknown): FlagsResponse {
  if (!isRecord(value) || value.source !== 'flagsmith' || !isEnvironment(value.environment) ||
      typeof value.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(value.evaluatedAt)) ||
      !Array.isArray(value.flags)) {
    throw new Error('FlagPilot backend returned invalid Flagsmith flag data.')
  }
  for (const flag of value.flags) {
    if (!isRecord(flag) || typeof flag.id !== 'string' || typeof flag.key !== 'string' ||
        !flag.id.trim() || !flag.key.trim() || typeof flag.enabled !== 'boolean' || !('value' in flag) ||
        !(flag.value === null || typeof flag.value === 'string' || typeof flag.value === 'number' ||
          typeof flag.value === 'boolean' || Array.isArray(flag.value) || isRecord(flag.value))) {
      throw new Error('FlagPilot backend returned an invalid feature flag.')
    }
  }
  return value as FlagsResponse
}

function mapValue(value: FlagValue): { flagType: FlagType; value: FlagValue } {
  if (value === null) return { flagType: 'JSON', value }
  if (typeof value === 'boolean') return { flagType: 'Boolean', value }
  if (typeof value === 'number') return { flagType: 'Number', value }
  if (typeof value === 'object' && value !== null) return { flagType: 'JSON', value }
  if (typeof value === 'string') return { flagType: 'String', value }
  return { flagType: 'JSON', value }
}

export function mapEvaluatedFlags(flags: BackendFlag[], environment: Environment): FeatureFlag[] {
  return flags.map(({ id, key, enabled, value }) => ({
    id: `flagsmith-${id}`,
    name: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: 'Evaluated from Flagsmith. Descriptions, targeting rules, and rollout percentages are not exposed by the evaluation SDK.',
    key,
    ...mapValue(value),
    enabled,
    environment,
    rollout: 0,
    rolloutKnown: false,
    riskKnown: false,
    modified: 'Live evaluation',
    owner: 'Flagsmith',
    risk: 'Low',
  }))
}

export function createFlagDataSource(config: IntegrationConfig): FlagDataSource {
  if (config.mode === 'demo') {
    return {
      mode: 'demo',
      readOnly: false,
      async initialize() {},
      async refresh() {},
      dispose() {},
    }
  }

  const selectedEnvironment = config.environment
  const baseUrl = config.backendUrl
  let onFlags: ((flags: FeatureFlag[]) => void) | undefined
  let onError: ((error: Error) => void) | undefined
  let onEnvironment: ((environment: Environment) => void) | undefined
  let controller: AbortController | undefined
  let connected = false

  async function fetchFlags(verifyConnection: boolean) {
    controller?.abort()
    controller = new AbortController()
    const timeout = window.setTimeout(() => controller?.abort(), 25_000)
    const environmentPath = `/api/flagsmith/environments/${encodeURIComponent(selectedEnvironment)}`
    try {
      if (verifyConnection) {
        const connection = validateConnection(await requestJson<unknown>(`${baseUrl}${environmentPath}/connection`, controller.signal))
        if (connection.environment !== selectedEnvironment) {
          throw new Error('FlagPilot backend verified a different environment than the one selected.')
        }
        onEnvironment?.(connection.environment)
      }
      const result = validateFlags(await requestJson<unknown>(`${baseUrl}${environmentPath}/flags`, controller.signal))
      if (result.environment !== selectedEnvironment) {
        throw new Error('FlagPilot backend returned flags for a different environment than the one selected.')
      }
      onEnvironment?.(result.environment)
      onFlags?.(mapEvaluatedFlags(result.flags, result.environment))
      connected = true
    } finally {
      window.clearTimeout(timeout)
    }
  }

  return {
    mode: 'live',
    readOnly: true,
    async initialize(flagsChanged, errorOccurred, environmentChanged) {
      onFlags = flagsChanged
      onError = errorOccurred
      onEnvironment = environmentChanged
      connected = false
      try {
        await fetchFlags(true)
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error('Flagsmith connection failed.')
        onError(normalized)
        throw normalized
      }
    },
    async refresh() {
      try {
        await fetchFlags(!connected)
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error('Flagsmith flag refresh failed.')
        onError?.(normalized)
        throw normalized
      }
    },
    dispose() {
      controller?.abort()
      controller = undefined
      onFlags = undefined
      onError = undefined
      onEnvironment = undefined
      connected = false
    },
  }
}
