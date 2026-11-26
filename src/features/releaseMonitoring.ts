import type { ActivityEntry, FeatureFlag, Risk } from '../types'
import { assessRelease } from './releaseSafety.ts'

export type MonitoringRange = '1h' | '6h' | '24h' | '7d'
export type MonitoringHealth = 'Healthy' | 'Warning' | 'Critical'
export type MonitoringPattern = 'stable' | 'error-spike' | 'latency-spike' | 'request-drop'

export type MonitoringSample = {
  timestamp: number
  requestVolume: number
  errorRatePercent: number
  latencyMs: number
  exposurePercent: number
  conversionRatePercent: number
}

export type MonitoringSignal = {
  id: string
  metric: 'Error rate' | 'Latency' | 'Request volume' | 'Conversion'
  severity: 'warning' | 'critical'
  change: string
  explanation: string
}

export type MonitoringSnapshot = {
  requestVolume: number
  errorRatePercent: number
  latencyMs: number
  exposurePercent: number
  conversionRatePercent: number
}

export type ReleaseMonitoringData = {
  samples: MonitoringSample[]
  baseline: MonitoringSnapshot
  current: MonitoringSnapshot
  signals: MonitoringSignal[]
  health: MonitoringHealth
  healthExplanation: string
  recommendation: string
  assessmentRisk: Risk
  assessmentScore: number
  relatedActivity: ActivityEntry[]
}

export const monitoringRanges: { value: MonitoringRange; label: string; durationMs: number }[] = [
  { value: '1h', label: '1 hour', durationMs: 60 * 60_000 },
  { value: '6h', label: '6 hours', durationMs: 6 * 60 * 60_000 },
  { value: '24h', label: '24 hours', durationMs: 24 * 60 * 60_000 },
  { value: '7d', label: '7 days', durationMs: 7 * 24 * 60 * 60_000 },
]

const rolloutStages = [0, 10, 25, 50, 75, 100]

export function rangeDurationMs(range: MonitoringRange): number {
  return monitoringRanges.find((item) => item.value === range)?.durationMs ?? monitoringRanges[2].durationMs
}

export function patternForFlag(flag: FeatureFlag): MonitoringPattern {
  const key = flag.key.toLowerCase()
  if (key.includes('instant_payout')) return 'error-spike'
  if (key.includes('checkout')) return 'latency-spike'
  if (key.includes('usage_billing')) return 'request-drop'
  return 'stable'
}

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function currentAndBaseline(samples: MonitoringSample[]): { baseline: MonitoringSnapshot; current: MonitoringSnapshot } {
  const windowSize = Math.max(3, Math.ceil(samples.length / 4))
  const baselineSamples = samples.slice(0, windowSize)
  const currentSamples = samples.slice(-Math.min(3, samples.length))
  const snapshot = (items: MonitoringSample[]): MonitoringSnapshot => ({
    requestVolume: Math.round(average(items.map((item) => item.requestVolume))),
    errorRatePercent: Number(average(items.map((item) => item.errorRatePercent)).toFixed(2)),
    latencyMs: Math.round(average(items.map((item) => item.latencyMs))),
    exposurePercent: Math.round(average(items.map((item) => item.exposurePercent))),
    conversionRatePercent: Number(average(items.map((item) => item.conversionRatePercent)).toFixed(2)),
  })
  return { baseline: snapshot(baselineSamples), current: snapshot(currentSamples) }
}

export function analyzeMonitoringSamples(
  samples: MonitoringSample[],
  assessmentRisk: Risk = 'Low',
): Pick<ReleaseMonitoringData, 'baseline' | 'current' | 'signals' | 'health' | 'healthExplanation' | 'recommendation'> {
  if (samples.length < 4) {
    throw new Error('Release monitoring requires at least four metric samples.')
  }
  const { baseline, current } = currentAndBaseline(samples)
  const signals: MonitoringSignal[] = []
  const errorDelta = current.errorRatePercent - baseline.errorRatePercent
  if (current.errorRatePercent >= 2 || errorDelta >= 1) {
    signals.push({
      id: 'error-critical',
      metric: 'Error rate',
      severity: 'critical',
      change: `${errorDelta >= 0 ? '+' : ''}${errorDelta.toFixed(2)} percentage points`,
      explanation: `The recent error-rate average is ${current.errorRatePercent.toFixed(2)}%, compared with ${baseline.errorRatePercent.toFixed(2)}% early in this window. Investigate before increasing exposure; this pattern alone does not establish the rollout as the cause.`,
    })
  } else if (current.errorRatePercent >= 0.5 && errorDelta >= 0.3) {
    signals.push({
      id: 'error-warning',
      metric: 'Error rate',
      severity: 'warning',
      change: `+${errorDelta.toFixed(2)} percentage points`,
      explanation: `Errors are trending up from ${baseline.errorRatePercent.toFixed(2)}% to ${current.errorRatePercent.toFixed(2)}%. Compare logs and the control group before making a release decision.`,
    })
  }

  const latencyDelta = current.latencyMs - baseline.latencyMs
  if (current.latencyMs >= 500 || latencyDelta >= 150) {
    signals.push({
      id: 'latency-critical',
      metric: 'Latency',
      severity: 'critical',
      change: `${latencyDelta >= 0 ? '+' : ''}${latencyDelta} ms`,
      explanation: `Recent latency averages ${current.latencyMs} ms versus ${baseline.latencyMs} ms at the start of the window. Check service dependencies and compare unaffected traffic; timing does not prove causation.`,
    })
  } else if (current.latencyMs >= 250 && latencyDelta >= 50) {
    signals.push({
      id: 'latency-warning',
      metric: 'Latency',
      severity: 'warning',
      change: `+${latencyDelta} ms`,
      explanation: `Latency increased from ${baseline.latencyMs} ms to ${current.latencyMs} ms. Hold exposure steady while validating the change against a control or service baseline.`,
    })
  }

  if (baseline.requestVolume > 0 && current.requestVolume <= baseline.requestVolume * 0.7) {
    const decline = Math.round((1 - current.requestVolume / baseline.requestVolume) * 100)
    signals.push({
      id: 'request-volume-drop',
      metric: 'Request volume',
      severity: decline >= 50 ? 'critical' : 'warning',
      change: `-${decline}%`,
      explanation: `Request volume is ${decline}% below the early-window average. Check traffic mix, measurement coverage, and service availability before attributing the drop to this flag.`,
    })
  }

  const conversionDelta = current.conversionRatePercent - baseline.conversionRatePercent
  if (conversionDelta <= -0.5 && Math.abs(conversionDelta) / Math.max(baseline.conversionRatePercent, 0.1) >= 0.15) {
    signals.push({
      id: 'conversion-decline',
      metric: 'Conversion',
      severity: conversionDelta <= -1 ? 'critical' : 'warning',
      change: `${conversionDelta.toFixed(2)} percentage points`,
      explanation: `Conversion is lower than the early-window average (${current.conversionRatePercent.toFixed(2)}% vs ${baseline.conversionRatePercent.toFixed(2)}%). Validate sample size and the control comparison; this is not proof of cause.`,
    })
  }

  const previous = samples.at(-2)
  const latest = samples.at(-1)
  if (previous && latest) {
    const suddenErrorChange = latest.errorRatePercent - previous.errorRatePercent
    if (latest.errorRatePercent >= 0.5 && suddenErrorChange >= 0.5) {
      signals.push({
        id: 'error-sudden-change',
        metric: 'Error rate',
        severity: latest.errorRatePercent >= 2 || suddenErrorChange >= 1 ? 'critical' : 'warning',
        change: `+${suddenErrorChange.toFixed(2)} points in the latest sample`,
        explanation: `The latest error sample jumped from ${previous.errorRatePercent.toFixed(2)}% to ${latest.errorRatePercent.toFixed(2)}%. Confirm the change is not a sampling or traffic-mix artifact before attributing it to the release.`,
      })
    }
    const suddenLatencyChange = latest.latencyMs - previous.latencyMs
    if (latest.latencyMs >= 250 && suddenLatencyChange >= 80) {
      signals.push({
        id: 'latency-sudden-change',
        metric: 'Latency',
        severity: latest.latencyMs >= 500 || suddenLatencyChange >= 160 ? 'critical' : 'warning',
        change: `+${suddenLatencyChange} ms in the latest sample`,
        explanation: `The latest latency sample jumped from ${previous.latencyMs} ms to ${latest.latencyMs} ms. Check service dependencies and unaffected traffic; timing alone does not establish cause.`,
      })
    }
    if (previous.requestVolume > 0 && latest.requestVolume <= previous.requestVolume * 0.6 &&
        !signals.some((signal) => signal.id === 'request-volume-drop')) {
      const decline = Math.round((1 - latest.requestVolume / previous.requestVolume) * 100)
      signals.push({
        id: 'request-volume-sudden-drop',
        metric: 'Request volume',
        severity: decline >= 60 ? 'critical' : 'warning',
        change: `-${decline}% in the latest sample`,
        explanation: `Request volume dropped sharply from ${previous.requestVolume.toLocaleString()} to ${latest.requestVolume.toLocaleString()} in the latest sample. Check traffic mix and instrumentation before inferring an impact from the rollout.`,
      })
    }
  }

  const criticalCount = signals.filter((signal) => signal.severity === 'critical').length
  const health: MonitoringHealth = criticalCount ? 'Critical' : signals.length || assessmentRisk !== 'Low' ? 'Warning' : 'Healthy'
  const healthExplanation = health === 'Critical'
    ? `${criticalCount} critical metric signal${criticalCount === 1 ? '' : 's'} needs investigation before exposure grows.`
    : health === 'Warning'
      ? signals.length
        ? `${signals.length} metric signal${signals.length === 1 ? '' : 's'} or an elevated release-risk assessment warrants holding exposure steady.`
        : `Metrics show no critical anomaly, but the existing release-safety assessment is ${assessmentRisk.toLowerCase()} risk. Review it before proceeding.`
      : 'No configured anomaly threshold was crossed and the existing release-safety assessment is low risk.'
  const recommendation = health === 'Critical'
    ? 'Pause the rollout and investigate. Consider reducing exposure or rolling back only after confirming impact with the release owner.'
    : health === 'Warning'
      ? 'Hold at the current exposure while you compare affected traffic with a baseline or control group.'
      : current.exposurePercent < 100
        ? 'No monitoring signal currently blocks progress. Review the release assessment and advance gradually if your checks pass.'
        : 'Keep monitoring at full exposure and confirm the release is stable before closing it.'

  return { baseline, current, signals, health, healthExplanation, recommendation }
}

function relatedActivityForFlag(flag: FeatureFlag, activity: ActivityEntry[], startTime: number, now: number): ActivityEntry[] {
  return activity.filter((entry) => {
    const occurredAt = Date.parse(entry.occurredAt)
    const content = `${entry.title} ${entry.detail}`.toLowerCase()
    return occurredAt >= startTime && occurredAt <= now &&
      (entry.flagId === flag.id || content.includes(flag.name.toLowerCase()) || content.includes(flag.key.toLowerCase()))
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
}

export function buildMonitoringData(
  flag: FeatureFlag,
  activity: ActivityEntry[],
  range: MonitoringRange,
  now = Date.now(),
  patternOverride?: MonitoringPattern,
): ReleaseMonitoringData {
  const durationMs = rangeDurationMs(range)
  const existingAssessment = assessRelease(flag, activity)
  const baseError = Math.max(0.08, existingAssessment.metrics.errorRate * 0.62)
  const baseLatency = Math.max(80, existingAssessment.metrics.latencyMs * 0.76)
  const baseConversion = Math.max(0.2, existingAssessment.metrics.conversionRate - 0.45)
  const currentExposure = flag.enabled ? Math.min(100, Math.max(0, flag.rollout)) : 0
  const pattern = patternOverride ?? patternForFlag(flag)
  const samples = Array.from({ length: 13 }, (_unused, index) => {
    const progress = index / 12
    const noise = ((index * 7 + flag.key.length * 3) % 9 - 4) / 100
    const recentProgress = Math.max(0, (progress - 0.55) / 0.45)
    const requestBase = Math.max(80, Math.round(existingAssessment.metrics.totalRequests / 13))
    const volumeMultiplier = pattern === 'request-drop'
      ? index >= 11 ? 0.48 : 1 - recentProgress * 0.05
      : 1 + Math.sin(index * 1.7 + flag.key.length) * 0.06
    const errorSpike = pattern === 'error-spike' ? (index >= 11 ? 0.95 : recentProgress * 0.08) : 0
    const latencySpike = pattern === 'latency-spike' ? (index >= 11 ? 125 : recentProgress * 8) : 0
    const rollout = currentExposure * progress
    const exposurePercent = progress === 1
      ? currentExposure
      : rolloutStages.reduce((closest, stage) =>
        stage <= currentExposure && Math.abs(stage - rollout) < Math.abs(closest - rollout) ? stage : closest,
      0)
    return {
      timestamp: now - durationMs + durationMs * progress,
      requestVolume: Math.max(0, Math.round(requestBase * volumeMultiplier)),
      errorRatePercent: Number(Math.max(0.01, baseError + existingAssessment.metrics.errorRate * 0.38 * progress + errorSpike + noise).toFixed(2)),
      latencyMs: Math.max(1, Math.round(baseLatency + (existingAssessment.metrics.latencyMs - baseLatency) * progress + latencySpike)),
      exposurePercent,
      conversionRatePercent: Number(Math.max(0, baseConversion + (existingAssessment.metrics.conversionRate - baseConversion) * progress + noise / 2).toFixed(2)),
    }
  })
  const analysis = analyzeMonitoringSamples(samples, existingAssessment.risk)
  return {
    samples,
    ...analysis,
    assessmentRisk: existingAssessment.risk,
    assessmentScore: existingAssessment.score,
    relatedActivity: relatedActivityForFlag(flag, activity, now - durationMs, now),
  }
}

export function getRangeStart(range: MonitoringRange, now = Date.now()): number {
  return now - rangeDurationMs(range)
}

export function formatMonitoringTime(timestamp: number, range: MonitoringRange): string {
  const date = new Date(timestamp)
  return range === '7d'
    ? date.toLocaleDateString(undefined, { weekday: 'short' })
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
