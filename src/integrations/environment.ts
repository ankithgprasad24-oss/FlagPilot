import type { Environment } from '../types'

const supportedEnvironments: Environment[] = ['Development', 'Staging', 'Production']

export function isEnvironment(value: unknown): value is Environment {
  return typeof value === 'string' && supportedEnvironments.includes(value as Environment)
}
