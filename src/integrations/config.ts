import type { Environment } from '../types'

export { isEnvironment } from './environment'

export const DEFAULT_FLAGPILOT_BACKEND_URL = import.meta.env.VITE_FLAGPILOT_BACKEND_URL?.trim() ||
  (import.meta.env.DEV ? 'http://127.0.0.1:3002' : '')

export type LiveIntegrationConfig = {
  mode: 'live'
  backendUrl: string
  environment: Environment
}

export type IntegrationConfig = { mode: 'demo' } | LiveIntegrationConfig

export function normalizeBackendUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Enter your FlagPilot backend URL, or set VITE_FLAGPILOT_BACKEND_URL when building the frontend.')
  }
  const parsed = new URL(trimmed)
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Use an HTTPS backend URL, or HTTP for localhost development.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error('The backend URL must be an origin without credentials, paths, query parameters, or a fragment.')
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol === 'http:' && !isLoopback) {
    throw new Error('Use HTTPS for non-local backend hosts.')
  }
  return parsed.origin
}

export function getIntegrationConfig(): IntegrationConfig {
  return { mode: 'demo' }
}
