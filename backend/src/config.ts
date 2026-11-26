import { DEFAULT_FLAGSMITH_API_URL, normalizeApiUrl } from './flagsmith.js'
import { isIP } from 'node:net'

const supportedEnvironments = ['Development', 'Staging', 'Production'] as const
export type EnvironmentName = typeof supportedEnvironments[number]

export type BackendConfig = {
  environmentKeys: Record<EnvironmentName, string>
  apiUrl: string
  apiUrlError: string | undefined
  defaultEnvironment: EnvironmentName
  host: string
  port: number
  trustProxyHops: number
  allowedOrigins: Set<string>
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? '3002')
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  return parsed
}

function parseTrustProxyHops(value: string | undefined): number {
  const parsed = Number(value ?? '0')
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 5.')
  }
  return parsed
}

function parseHost(value: string | undefined): string {
  const host = value?.trim() || '127.0.0.1'
  const validHostname = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/
  if (isIP(host) === 0 && !validHostname.test(host)) {
    throw new Error('HOST must be a valid IP address or hostname.')
  }
  return host
}

function parseAllowedOrigins(value: string | undefined, production: boolean): Set<string> {
  const defaultOrigins = production ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
  const origins = (value ?? defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  for (const origin of origins) {
    try {
      const parsed = new URL(origin)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
        throw new Error()
      }
    } catch {
      throw new Error('FLAGPILOT_CORS_ORIGINS must contain exact HTTP(S) origins without paths or credentials.')
    }
  }
  return new Set(origins)
}

function parseEnvironmentName(value: string | undefined): EnvironmentName {
  const name = value?.trim() || 'Production'
  if (!supportedEnvironments.includes(name as EnvironmentName)) {
    throw new Error('FLAGSMITH_ENVIRONMENT_NAME must be Development, Staging, or Production.')
  }
  return name as EnvironmentName
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const defaultEnvironment = parseEnvironmentName(env.FLAGSMITH_ENVIRONMENT_NAME)
  const environmentKeys: Record<EnvironmentName, string> = {
    Development: env.FLAGSMITH_DEVELOPMENT_ENVIRONMENT_KEY?.trim() ?? '',
    Staging: env.FLAGSMITH_STAGING_ENVIRONMENT_KEY?.trim() ?? '',
    Production: env.FLAGSMITH_PRODUCTION_ENVIRONMENT_KEY?.trim() ?? '',
  }
  const legacyEnvironmentKey = env.FLAGSMITH_ENVIRONMENT_KEY?.trim() ?? ''
  if (legacyEnvironmentKey && !environmentKeys[defaultEnvironment]) {
    environmentKeys[defaultEnvironment] = legacyEnvironmentKey
  }
  let apiUrl = ''
  let apiUrlError: string | undefined
  try {
    apiUrl = normalizeApiUrl(env.FLAGSMITH_API_URL?.trim() || DEFAULT_FLAGSMITH_API_URL)
  } catch {
    apiUrlError = 'FLAGSMITH_API_URL is invalid. Use a valid HTTPS Flagsmith API v1 URL.'
  }
  return {
    environmentKeys,
    apiUrl,
    apiUrlError,
    defaultEnvironment,
    host: parseHost(env.HOST),
    port: parsePort(env.PORT),
    trustProxyHops: parseTrustProxyHops(env.TRUST_PROXY_HOPS),
    allowedOrigins: parseAllowedOrigins(env.FLAGPILOT_CORS_ORIGINS, env.NODE_ENV === 'production'),
  }
}
