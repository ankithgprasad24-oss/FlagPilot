import type { Environment, FeatureFlag } from '../types'
import { audience } from '../data/mock'

export const rolloutStages = [0, 10, 25, 50, 75, 100] as const

export type RolloutHealth = 'Healthy' | 'Warning' | 'Critical'

export type RolloutSimulationMetrics = {
  stage: number
  totalUsers: number
  featureUsers: number
  controlUsers: number
  controlConversionRate: number
  featureConversionRate: number
  errorRate: number
  latencyMs: number
  impactConversions: number
  health: RolloutHealth
}

function stableHash(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7)
}

export function nearestRolloutStage(rollout: number): number {
  return rolloutStages.reduce((closest, stage) =>
    Math.abs(stage - rollout) < Math.abs(closest - rollout) ? stage : closest,
  )
}

export function simulateRolloutMetrics(
  flag: FeatureFlag,
  environment: Environment,
  stage: number,
  errorThreshold: number,
  latencyThreshold: number,
): RolloutSimulationMetrics {
  const hash = stableHash(`${flag.key}:${environment}`)
  const boundedStage = nearestRolloutStage(stage)
  const totalUsers = audience[environment]
  const featureUsers = Math.round(totalUsers * boundedStage / 100)
  const controlUsers = totalUsers - featureUsers
  const controlConversionRate = Number((2.7 + (hash % 110) / 100).toFixed(2))
  const conversionLift = Number((((hash % 17) - 6) / 100 + boundedStage * 0.003).toFixed(2))
  const featureConversionRate = Number(Math.max(0, controlConversionRate + conversionLift).toFixed(2))
  const environmentError = environment === 'Production' ? 0.12 : environment === 'Staging' ? 0.06 : 0
  const errorRate = Number((0.12 + (hash % 18) / 100 + environmentError + boundedStage * 0.016).toFixed(2))
  const environmentLatency = environment === 'Production' ? 42 : environment === 'Staging' ? 18 : 0
  const latencyMs = Math.round(108 + (hash % 48) + environmentLatency + boundedStage * 1.72)
  const errorExceeded = errorRate >= errorThreshold
  const latencyExceeded = latencyMs >= latencyThreshold

  return {
    stage: boundedStage,
    totalUsers,
    featureUsers,
    controlUsers,
    controlConversionRate,
    featureConversionRate,
    errorRate,
    latencyMs,
    impactConversions: Math.round(featureUsers * (featureConversionRate - controlConversionRate) / 100),
    health: errorExceeded && latencyExceeded ? 'Critical' : errorExceeded || latencyExceeded ? 'Warning' : 'Healthy',
  }
}
