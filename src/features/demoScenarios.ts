import { initialActivity, initialFlags } from '../data/mock.ts'
import type { ActivityEntry, Environment, FeatureFlag, ReleaseTimelineEntry } from '../types.ts'
import { getEnvironmentConfig, normalizeFlag, withEnvironmentConfig } from './flagConfiguration.ts'
import type { MonitoringPattern } from './releaseMonitoring.ts'

export type DemoScenarioId = 'healthy' | 'error-rate' | 'high-latency' | 'risky-production' | 'rollback'

export type DemoScenario = {
  id: DemoScenarioId
  name: string
  summary: string
  flagId: string
  environment: Environment
  rollout: number
  enabled: boolean
  monitoringPattern: MonitoringPattern
}

export type DemoScenarioState = {
  scenario: DemoScenario
  flags: FeatureFlag[]
  activity: ActivityEntry[]
  timeline: ReleaseTimelineEntry[]
}

export const demoScenarios: DemoScenario[] = [
  {
    id: 'healthy',
    name: 'Healthy gradual rollout',
    summary: 'A controlled Staging rollout with steady metrics and low safety risk.',
    flagId: '2',
    environment: 'Staging',
    rollout: 25,
    enabled: true,
    monitoringPattern: 'stable',
  },
  {
    id: 'error-rate',
    name: 'Elevated error rate',
    summary: 'A feature rollout with a rising error trend that warrants a pause and investigation.',
    flagId: '3',
    environment: 'Production',
    rollout: 50,
    enabled: true,
    monitoringPattern: 'error-spike',
  },
  {
    id: 'high-latency',
    name: 'High latency',
    summary: 'A Production release with a simulated response-time jump against baseline.',
    flagId: '1',
    environment: 'Production',
    rollout: 50,
    enabled: true,
    monitoringPattern: 'latency-spike',
  },
  {
    id: 'risky-production',
    name: 'Risky production rollout',
    summary: 'Full Production exposure with elevated risk signals; inspect safety before proceeding.',
    flagId: '3',
    environment: 'Production',
    rollout: 100,
    enabled: true,
    monitoringPattern: 'error-spike',
  },
  {
    id: 'rollback',
    name: 'Rollback scenario',
    summary: 'A previously rolled-back release with zero exposure and a linked local event.',
    flagId: '3',
    environment: 'Production',
    rollout: 0,
    enabled: false,
    monitoringPattern: 'stable',
  },
]

export function isDemoScenarioId(value: unknown): value is DemoScenarioId {
  return typeof value === 'string' && demoScenarios.some((scenario) => scenario.id === value)
}

export function getDemoScenario(id: DemoScenarioId): DemoScenario {
  const scenario = demoScenarios.find((item) => item.id === id)
  if (!scenario) throw new Error(`Unknown FlagPilot demo scenario: ${id}`)
  return scenario
}

export function createDemoScenarioState(id: DemoScenarioId, now = Date.now()): DemoScenarioState {
  const scenario = getDemoScenario(id)
  const flags = initialFlags.map((flag) => normalizeFlag(structuredClone(flag)))
  const targetIndex = flags.findIndex((flag) => flag.id === scenario.flagId)
  if (targetIndex < 0) throw new Error(`Demo scenario flag ${scenario.flagId} is missing.`)
  const target = flags[targetIndex]
  const previous = getEnvironmentConfig(target, scenario.environment)
  const configured = withEnvironmentConfig(target, scenario.environment, {
    ...previous,
    enabled: scenario.enabled,
    rollout: scenario.rollout,
  })
  flags[targetIndex] = configured

  const occurredAt = new Date(now - 5 * 60_000).toISOString()
  const activity: ActivityEntry[] = [
    {
      id: `scenario-${id}-event`,
      flagId: scenario.flagId,
      title: scenario.id === 'rollback' ? 'Sample rollback recorded' : 'Sample rollout stage selected',
      detail: `Demo scenario loaded · ${scenario.enabled ? `${scenario.rollout}% exposure` : 'exposure reset to 0%'}`,
      environment: scenario.environment,
      occurredAt,
      kind: scenario.id === 'rollback' ? 'rollback' : 'rollout',
    },
    ...initialActivity.map((entry) => ({ ...entry })),
  ]
  const timeline: ReleaseTimelineEntry[] = [
    {
      id: `scenario-${id}-timeline`,
      flagId: scenario.flagId,
      flagName: target.name,
      environment: scenario.environment,
      kind: scenario.id === 'rollback' ? 'rollback' : 'stage',
      title: scenario.id === 'rollback' ? 'Demo rollback completed' : `Demo rollout set to ${scenario.rollout}%`,
      detail: scenario.id === 'rollback'
        ? 'The local demo flag is disabled with no simulated user exposure.'
        : `${target.name} · ${scenario.environment} · ${scenario.rollout}% simulated exposure.`,
      occurredAt,
    },
  ]

  return { scenario, flags, activity, timeline }
}
