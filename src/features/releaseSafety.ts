import { audience, stages } from '../data/mock.ts'
import type { ActivityEntry, Environment, FeatureFlag, Risk } from '../types'

export type ReleaseDecision = 'continue' | 'hold' | 'reduce' | 'rollback'

export type ReleaseMetrics = {
  errorRate: number
  latencyMs: number
  successfulRequests: number
  failedRequests: number
  totalRequests: number
  conversionRate: number
}

export type ReleaseAssessment = {
  risk: Risk
  score: number
  metrics: ReleaseMetrics
  reasons: string[]
  recentChanges: number
  recentRollouts: number
  recommendation: {
    decision: ReleaseDecision
    title: string
    reason: string
    target: number
  }
}

function stableHash(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7)
}

function recentActivityForFlag(flag: FeatureFlag, activity: ActivityEntry[]): ActivityEntry[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  return activity.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime()
    const text = `${entry.title} ${entry.detail}`.toLowerCase()
    return Number.isFinite(time) && time >= cutoff &&
      (text.includes(flag.name.toLowerCase()) || text.includes(flag.key.toLowerCase()))
  })
}

function nextStage(rollout: number): number {
  return stages.find((stage) => stage > rollout) ?? rollout
}

export function assessRelease(flag: FeatureFlag, activity: ActivityEntry[]): ReleaseAssessment {
  const recent = recentActivityForFlag(flag, activity)
  const recentRollouts = recent.filter((entry) => entry.kind === 'rollout').length
  const hash = stableHash(flag.key)
  const enabled = flag.enabled
  const environmentFactor: Record<Environment, number> = {
    Development: 0,
    Staging: 0.05,
    Production: 0.12,
  }
  const errorRate = Number((
    enabled
      ? 0.08 + flag.rollout * 0.009 + environmentFactor[flag.environment] + (hash % 30) / 100 + Math.min(recentRollouts, 3) * 0.04
      : 0.04 + (hash % 8) / 100
  ).toFixed(2))
  const latencyMs = Math.round(
    (enabled ? 110 + flag.rollout * 2 + (flag.environment === 'Production' ? 45 : flag.environment === 'Staging' ? 20 : 0) : 90) +
    hash % 120 + Math.min(recentRollouts, 3) * 18,
  )
  const totalRequests = Math.round(24_000 + audience[flag.environment] * 0.6)
  const failedRequests = Math.round(totalRequests * errorRate / 100)
  const successfulRequests = totalRequests - failedRequests
  const conversionRate = Number((2.4 + flag.rollout * 0.009 + (hash % 18) / 100).toFixed(2))
  const metrics = { errorRate, latencyMs, successfulRequests, failedRequests, totalRequests, conversionRate }

  let score = enabled ? flag.rollout * 0.32 : 0
  score += flag.environment === 'Production' ? 20 : flag.environment === 'Staging' ? 8 : 0
  if (!enabled) score -= 20
  if (errorRate >= 1.1) score += 25
  else if (errorRate >= 0.75) score += 15
  else if (errorRate >= 0.5) score += 8
  if (latencyMs >= 400) score += 12
  else if (latencyMs >= 300) score += 6
  if (recent.length >= 3) score += 10
  else if (recent.length > 0) score += 4
  if (recentRollouts >= 2) score += 8
  score = Math.max(0, Math.min(100, Math.round(score)))
  const risk: Risk = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low'

  const reasons = [
    enabled
      ? `${flag.rollout}% of ${flag.environment.toLowerCase()} traffic is exposed.`
      : 'The flag is disabled, so no users are exposed to this release.',
    flag.environment === 'Production'
      ? 'Production exposure carries the highest impact if the release regresses.'
      : `${flag.environment} has a lower impact than production.`,
    errorRate >= 0.75
      ? `Simulated error rate is elevated at ${errorRate.toFixed(2)}%.`
      : `Simulated error rate is within the expected range at ${errorRate.toFixed(2)}%.`,
    latencyMs >= 300
      ? `Simulated latency is elevated at ${latencyMs} ms.`
      : `Simulated latency is stable at ${latencyMs} ms.`,
    recent.length
      ? `${recent.length} matching flag change${recent.length === 1 ? '' : 's'} recorded in the last 24 hours${recentRollouts ? `, including ${recentRollouts} rollout update${recentRollouts === 1 ? '' : 's'}` : ''}.`
      : 'No matching flag changes were recorded in the last 24 hours.',
  ]

  const reduceTarget = Math.max(flag.rollout > 0 ? 1 : 0, flag.rollout - 25)
  let recommendation: ReleaseAssessment['recommendation']
  if (!enabled || flag.rollout <= 0 || flag.rollout >= 100) {
    const reason = !enabled
      ? 'The flag is disabled; keep it off until you are ready to stage a release.'
      : flag.rollout <= 0
        ? 'No users are currently exposed. Hold at 0% until you are ready to start the rollout.'
        : 'The rollout is already at 100%. Monitor health before making further changes.'
    recommendation = { decision: 'hold', title: 'Hold rollout', reason, target: flag.rollout }
  } else if (risk === 'High' && (errorRate >= 1.1 || latencyMs >= 400)) {
    recommendation = { decision: 'rollback', title: 'Roll back the feature', reason: 'Simulated error or latency signals are beyond the safety threshold. Disable the flag to stop exposure.', target: 0 }
  } else if (risk === 'High' || risk === 'Medium') {
    recommendation = { decision: 'reduce', title: 'Reduce rollout', reason: 'Risk signals warrant reducing exposure while the team investigates.', target: reduceTarget }
  } else {
    const target = nextStage(flag.rollout)
    recommendation = target > flag.rollout
      ? { decision: 'continue', title: 'Continue rollout', reason: 'Simulated health is stable and no urgent risk signals are present.', target }
      : { decision: 'hold', title: 'Hold rollout', reason: 'The rollout has reached its final stage; continue monitoring before closing the release.', target: flag.rollout }
  }

  return { risk, score, metrics, reasons, recentChanges: recent.length, recentRollouts, recommendation }
}

export function projectRelease(flag: FeatureFlag, decision: ReleaseDecision, target: number): FeatureFlag {
  if (decision === 'hold') return flag
  if (decision === 'rollback') return { ...flag, enabled: false, rollout: 0 }
  return { ...flag, enabled: target > 0, rollout: target }
}
