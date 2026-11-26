export type ReleaseRecommendation = 'PROCEED' | 'HOLD' | 'REDUCE ROLLOUT' | 'ROLLBACK'
export type ReleaseDataProvenance = 'real' | 'simulated' | 'mixed' | 'unknown'
export type ReleaseRiskLevel = 'Low' | 'Medium' | 'High'

export type ReleaseMetricSet = {
  errorRatePercent?: number
  latencyMs?: number
  conversionRatePercent?: number
  successfulRequests?: number
  failedRequests?: number
}

export type ReleaseSafetyContext = {
  flag: {
    name: string
    purpose: string
    key?: string
    enabled: boolean
    rolloutPercent: number
    targetEnvironment: 'Development' | 'Staging' | 'Production'
    configuration?: {
      configuredInEnvironment?: boolean
      targetingRuleCount?: number
    }
  }
  recentChanges?: Array<{
    description: string
    occurredAt?: string
  }>
  metrics?: ReleaseMetricSet | null
  baseline?: ReleaseMetricSet | null
  riskAssessment?: {
    level?: ReleaseRiskLevel
    score?: number
    reasons?: string[]
  } | null
  dataProvenance: ReleaseDataProvenance
}

export type ReleaseSafetyAnalysis = {
  recommendation: ReleaseRecommendation
  summary: string
  reasoning: string[]
  riskSignals: string[]
  missingInformation: string[]
  dataProvenance: ReleaseDataProvenance
}

const warningThresholds = {
  errorRatePercent: 1.1,
  criticalErrorRatePercent: 2,
  latencyMs: 400,
  criticalLatencyMs: 1000,
} as const

function validMetric(value: number | undefined, max = Number.POSITIVE_INFINITY): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    ? value
    : undefined
}

function formatMetric(value: number, digits = 2): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

export function analyzeReleaseSafety(context: ReleaseSafetyContext): ReleaseSafetyAnalysis {
  const metrics = context.metrics ?? {}
  const baseline = context.baseline ?? {}
  const flagName = context.flag.name.trim()
  const enabled = typeof context.flag.enabled === 'boolean' ? context.flag.enabled : undefined
  const validEnvironment = ['Development', 'Staging', 'Production'].includes(context.flag.targetEnvironment)
  const errorRate = validMetric(metrics.errorRatePercent, 100)
  const latency = validMetric(metrics.latencyMs)
  const conversionRate = validMetric(metrics.conversionRatePercent, 100)
  const baselineErrorRate = validMetric(baseline.errorRatePercent, 100)
  const baselineLatency = validMetric(baseline.latencyMs)
  const baselineConversionRate = validMetric(baseline.conversionRatePercent, 100)
  const rollout = validMetric(context.flag.rolloutPercent, 100)
  const provenance: ReleaseDataProvenance = ['real', 'simulated', 'mixed', 'unknown'].includes(context.dataProvenance)
    ? context.dataProvenance
    : 'unknown'
  const riskSignals: string[] = []
  const missingInformation: string[] = []
  const reasoning: string[] = []

  if (!flagName) missingInformation.push('A feature flag name was not provided.')
  if (!context.flag.purpose.trim()) missingInformation.push('Flag purpose was not provided.')
  if (rollout === undefined) missingInformation.push('A valid rollout percentage from 0% to 100% was not provided.')
  if (enabled === undefined) missingInformation.push('The current flag enabled state was not provided.')
  if (!validEnvironment) missingInformation.push('A supported target environment was not provided.')
  if (errorRate === undefined) missingInformation.push('A valid current error rate was not provided; missing telemetry is not treated as healthy.')
  if (latency === undefined) missingInformation.push('A valid current latency measurement was not provided; missing telemetry is not treated as healthy.')
  if (baselineErrorRate === undefined || baselineLatency === undefined) {
    missingInformation.push('A complete baseline error rate and latency comparison was not provided.')
  }
  if (!context.riskAssessment?.level) missingInformation.push('A release-risk assessment was not provided.')
  if (context.recentChanges === undefined) missingInformation.push('Recent rollout and flag-change history was not provided.')

  if (provenance === 'unknown') {
    riskSignals.push('The source of the supplied metrics is unknown; verify provenance before relying on them.')
  } else {
    riskSignals.push(`Input data is labeled ${provenance}; this analysis did not retrieve or verify the source.`)
  }

  if (rollout !== undefined) {
    riskSignals.push(
      enabled === true
        ? `${flagName} is enabled at ${rollout}% in ${context.flag.targetEnvironment}.`
        : `${flagName || 'The flag'} is disabled; current exposure is 0% regardless of its configured rollout.`,
    )
  }
  if (context.flag.configuration?.configuredInEnvironment === false) {
    riskSignals.push('The flag is not configured in the target environment.')
  }
  if (typeof context.flag.configuration?.targetingRuleCount === 'number') {
    riskSignals.push(`${context.flag.configuration.targetingRuleCount} targeting rule(s) were supplied for this environment.`)
  }

  if (errorRate !== undefined) {
    if (errorRate >= warningThresholds.criticalErrorRatePercent) {
      riskSignals.push(`Error rate is critically elevated at ${formatMetric(errorRate)}% (local critical threshold: ${warningThresholds.criticalErrorRatePercent}%).`)
    } else if (errorRate >= warningThresholds.errorRatePercent) {
      riskSignals.push(`Error rate is elevated at ${formatMetric(errorRate)}% (local warning threshold: ${warningThresholds.errorRatePercent}%).`)
    } else {
      riskSignals.push(`Current error rate is ${formatMetric(errorRate)}%.`)
    }
  }
  if (latency !== undefined) {
    if (latency >= warningThresholds.criticalLatencyMs) {
      riskSignals.push(`Latency is critically elevated at ${formatMetric(latency)} ms (local critical threshold: ${warningThresholds.criticalLatencyMs} ms).`)
    } else if (latency >= warningThresholds.latencyMs) {
      riskSignals.push(`Latency is elevated at ${formatMetric(latency)} ms (local warning threshold: ${warningThresholds.latencyMs} ms).`)
    } else {
      riskSignals.push(`Current latency is ${formatMetric(latency)} ms.`)
    }
  }

  const errorIncrease = errorRate !== undefined && baselineErrorRate !== undefined
    ? errorRate - baselineErrorRate
    : undefined
  const latencyIncrease = latency !== undefined && baselineLatency !== undefined
    ? latency - baselineLatency
    : undefined
  const conversionDrop = conversionRate !== undefined && baselineConversionRate !== undefined
    ? baselineConversionRate - conversionRate
    : undefined

  if (errorIncrease !== undefined) {
    riskSignals.push(errorIncrease > 0
      ? `Error rate is ${formatMetric(errorIncrease)} percentage point(s) above baseline.`
      : 'Error rate has not increased versus the supplied baseline.')
  }
  if (latencyIncrease !== undefined) {
    riskSignals.push(latencyIncrease > 0
      ? `Latency is ${formatMetric(latencyIncrease)} ms above baseline.`
      : 'Latency has not increased versus the supplied baseline.')
  }
  if (conversionDrop !== undefined) {
    riskSignals.push(conversionDrop > 0
      ? `Conversion is ${formatMetric(conversionDrop)} percentage point(s) below baseline.`
      : 'Conversion has not declined versus the supplied baseline.')
  }
  if (context.riskAssessment?.level) {
    riskSignals.push(`Supplied release-risk assessment is ${context.riskAssessment.level}${typeof context.riskAssessment.score === 'number' ? ` (${context.riskAssessment.score}/100)` : ''}.`)
    reasoning.push(...(context.riskAssessment.reasons ?? []))
  }
  if (context.recentChanges?.length) {
    riskSignals.push(`${context.recentChanges.length} recent change(s) were supplied for review.`)
  } else if (context.recentChanges) {
    riskSignals.push('No matching recent changes were found in the supplied history.')
  }
  if (conversionRate === undefined) missingInformation.push('A current conversion or engagement metric was not provided.')
  if (baselineConversionRate === undefined) missingInformation.push('A baseline conversion or engagement metric was not provided.')

  const activeExposure = enabled === true && rollout !== undefined && rollout > 0
  const criticalError = errorRate !== undefined &&
    (errorRate >= warningThresholds.criticalErrorRatePercent || (errorIncrease !== undefined && errorIncrease >= 1))
  const criticalLatency = latency !== undefined &&
    (latency >= warningThresholds.criticalLatencyMs ||
      (baselineLatency !== undefined && latencyIncrease !== undefined && latencyIncrease >= 150 && latency >= baselineLatency * 1.5))
  const criticalConversionDrop = conversionDrop !== undefined && conversionDrop >= 1
  const elevatedError = errorRate !== undefined &&
    (errorRate >= warningThresholds.errorRatePercent || (errorIncrease !== undefined && errorIncrease >= 0.3))
  const elevatedLatency = latency !== undefined &&
    (latency >= warningThresholds.latencyMs ||
      (baselineLatency !== undefined && latencyIncrease !== undefined && latencyIncrease >= 100 && latency >= baselineLatency * 1.2))
  const elevatedConversionDrop = conversionDrop !== undefined && conversionDrop >= 0.5
  const highSuppliedRisk = context.riskAssessment?.level === 'High'
  const concerningMetrics = elevatedError || elevatedLatency || elevatedConversionDrop

  let recommendation: ReleaseRecommendation
  let summary: string

  if (activeExposure && (criticalError || criticalLatency || criticalConversionDrop)) {
    recommendation = 'ROLLBACK'
    summary = 'Request human review of rollback because at least one supplied health signal crossed a critical threshold.'
    reasoning.push('A rollback is recommended for human review; this analysis does not disable the flag.')
  } else if (activeExposure && concerningMetrics) {
    recommendation = 'REDUCE ROLLOUT'
    summary = 'Reduce exposure while the team investigates one or more elevated health signals.'
    reasoning.push('Do not increase exposure until the elevated signal is understood and re-evaluated.')
  } else if (!activeExposure) {
    recommendation = 'HOLD'
    summary = 'Keep the current state; there is no active user exposure to safely advance from this context.'
    reasoning.push('A disabled flag or 0% rollout is not evidence that a rollout is healthy.')
  } else if (!flagName || !validEnvironment) {
    recommendation = 'HOLD'
    summary = 'Hold the rollout until the flag identity and target environment are valid.'
    reasoning.push('An incomplete release identity or unsupported environment is not enough context for a release recommendation.')
  } else if (errorRate === undefined || latency === undefined) {
    recommendation = 'HOLD'
    summary = 'Pause at the current stage because required health measurements are missing.'
    reasoning.push('Missing metrics cannot be interpreted as zero errors, low latency, or a healthy release.')
  } else if (highSuppliedRisk) {
    recommendation = context.flag.targetEnvironment === 'Production' && rollout >= 50
      ? 'REDUCE ROLLOUT'
      : 'HOLD'
    summary = recommendation === 'REDUCE ROLLOUT'
      ? 'Reduce production exposure because the supplied assessment marks this release high risk.'
      : 'Hold at the current stage because the supplied assessment marks this release high risk.'
    reasoning.push('Resolve the high-risk assessment before advancing the rollout.')
  } else if (
    context.flag.targetEnvironment === 'Production' &&
    rollout >= 75 &&
    (baselineErrorRate === undefined || baselineLatency === undefined)
  ) {
    recommendation = 'HOLD'
    summary = 'Hold the high-exposure production rollout until baseline comparisons are available.'
    reasoning.push('High production exposure needs comparable baseline health before further release decisions.')
  } else if (context.riskAssessment?.level === 'Medium' && rollout >= 50) {
    recommendation = 'HOLD'
    summary = 'Hold at the current stage while the medium-risk assessment is reviewed.'
    reasoning.push('The supplied risk assessment is not low enough to justify increasing exposure at this stage.')
  } else if ((context.recentChanges?.length ?? 0) >= 3 && context.flag.targetEnvironment === 'Production') {
    recommendation = 'HOLD'
    summary = 'Hold the production rollout while the recent cluster of changes is reviewed.'
    reasoning.push('Several recent changes make it harder to attribute a health regression to one release.')
  } else {
    recommendation = 'PROCEED'
    summary = 'The supplied current health signals support advancing to the next planned stage.'
    reasoning.push('No configured local warning or critical threshold was crossed in the supplied error and latency measurements.')
  }

  return {
    recommendation,
    summary,
    reasoning: [...new Set(reasoning)],
    riskSignals,
    missingInformation: [...new Set(missingInformation)],
    dataProvenance: provenance,
  }
}
