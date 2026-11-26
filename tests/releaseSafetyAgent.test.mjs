import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeReleaseSafety } from '../src/features/releaseSafetyAgent.ts'

const healthyContext = {
  flag: {
    name: 'Checkout v2',
    purpose: 'Gradually release the redesigned checkout.',
    enabled: true,
    rolloutPercent: 25,
    targetEnvironment: 'Production',
    configuration: { configuredInEnvironment: true, targetingRuleCount: 1 },
  },
  recentChanges: [],
  metrics: {
    errorRatePercent: 0.4,
    latencyMs: 190,
    conversionRatePercent: 3.2,
  },
  baseline: {
    errorRatePercent: 0.3,
    latencyMs: 185,
    conversionRatePercent: 3.1,
  },
  riskAssessment: { level: 'Low', score: 18, reasons: [] },
  dataProvenance: 'real',
}

test('proceeds for healthy supplied metrics and a low-risk rollout', () => {
  const result = analyzeReleaseSafety(healthyContext)
  assert.equal(result.recommendation, 'PROCEED')
  assert.ok(result.riskSignals.some((signal) => signal.includes('above baseline')))
})

test('reduces rollout when the error rate rises materially but is not critical', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    metrics: { ...healthyContext.metrics, errorRatePercent: 1.2 },
    baseline: { ...healthyContext.baseline, errorRatePercent: 0.8 },
  })
  assert.equal(result.recommendation, 'REDUCE ROLLOUT')
  assert.ok(result.riskSignals.some((signal) => signal.includes('elevated')))
})

test('reduces rollout when latency crosses the warning threshold', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    metrics: { ...healthyContext.metrics, latencyMs: 430 },
    baseline: { ...healthyContext.baseline, latencyMs: 350 },
  })
  assert.equal(result.recommendation, 'REDUCE ROLLOUT')
  assert.ok(result.riskSignals.some((signal) => signal.includes('430 ms')))
})

test('holds when current error and latency metrics are missing', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    metrics: {},
  })
  assert.equal(result.recommendation, 'HOLD')
  assert.ok(result.missingInformation.some((item) => item.includes('error rate')))
  assert.ok(result.missingInformation.some((item) => item.includes('latency')))
  assert.ok(result.reasoning.some((item) => item.includes('not be interpreted as zero errors')))
})

test('reduces a high-risk production rollout with safe current measurements', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    flag: { ...healthyContext.flag, rolloutPercent: 85 },
    riskAssessment: { level: 'High', score: 82, reasons: ['Recent regression risk.'] },
  })
  assert.equal(result.recommendation, 'REDUCE ROLLOUT')
  assert.ok(result.reasoning.includes('Resolve the high-risk assessment before advancing the rollout.'))
})

test('recommends rollback for a critical active error-rate signal without mutating the flag', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    metrics: { ...healthyContext.metrics, errorRatePercent: 2.2 },
  })
  assert.equal(result.recommendation, 'ROLLBACK')
  assert.ok(result.summary.includes('human review'))
  assert.equal(healthyContext.flag.enabled, true)
  assert.equal(healthyContext.flag.rolloutPercent, 25)
})

test('labels simulated metrics and reports missing baselines without claiming a live query', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    baseline: undefined,
    dataProvenance: 'simulated',
  })
  assert.equal(result.dataProvenance, 'simulated')
  assert.ok(result.riskSignals.some((signal) => signal.includes('simulated')))
  assert.ok(result.missingInformation.some((item) => item.includes('baseline')))
})

test('holds when the target environment is invalid', () => {
  const result = analyzeReleaseSafety({
    ...healthyContext,
    flag: { ...healthyContext.flag, targetEnvironment: 'Unknown' },
  })
  assert.equal(result.recommendation, 'HOLD')
  assert.ok(result.missingInformation.some((item) => item.includes('supported target environment')))
})
