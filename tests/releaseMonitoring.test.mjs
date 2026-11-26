import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeMonitoringSamples,
  buildMonitoringData,
  getRangeStart,
  monitoringRanges,
  patternForFlag,
  rangeDurationMs,
} from '../src/features/releaseMonitoring.ts'

const now = Date.parse('2026-11-26T17:00:00.000Z')

function makeFlag(key = 'checkout_v2') {
  return {
    id: 'flag-1',
    name: 'Checkout release',
    description: 'Release monitoring test flag',
    key,
    flagType: 'Boolean',
    value: true,
    enabled: true,
    environment: 'Production',
    rollout: 50,
    modified: 'Just now',
    owner: 'Test',
    risk: 'Low',
  }
}

function samples({
  baseline = { requests: 1000, errors: 0.2, latency: 180, conversion: 3.2 },
  current = baseline,
} = {}) {
  return Array.from({ length: 8 }, (_unused, index) => {
    const late = index >= 5
    const values = late ? current : baseline
    return {
      timestamp: now - (7 - index) * 60_000,
      requestVolume: values.requests,
      errorRatePercent: values.errors,
      latencyMs: values.latency,
      exposurePercent: Math.min(50, index * 8),
      conversionRatePercent: values.conversion,
    }
  })
}

test('reports stable metrics as healthy and preserves baseline/current comparisons', () => {
  const result = analyzeMonitoringSamples(samples(), 'Low')
  assert.equal(result.health, 'Healthy')
  assert.equal(result.signals.length, 0)
  assert.equal(result.baseline.errorRatePercent, 0.2)
  assert.equal(result.current.latencyMs, 180)
  assert.match(result.recommendation, /gradually/)
})

test('detects an abnormal error-rate increase with an understandable non-causal warning', () => {
  const result = analyzeMonitoringSamples(samples({
    baseline: { requests: 1000, errors: 0.2, latency: 180, conversion: 3.2 },
    current: { requests: 1020, errors: 0.65, latency: 185, conversion: 3.1 },
  }))
  assert.equal(result.health, 'Warning')
  assert.ok(result.signals.some((signal) => signal.id === 'error-warning'))
  assert.match(result.signals[0].explanation, /does not establish the rollout as the cause|Compare logs/)
})

test('classifies severe error and latency movement as critical', () => {
  const errorResult = analyzeMonitoringSamples(samples({
    baseline: { requests: 1000, errors: 0.2, latency: 180, conversion: 3.2 },
    current: { requests: 1000, errors: 2.1, latency: 180, conversion: 3.2 },
  }))
  assert.equal(errorResult.health, 'Critical')
  assert.ok(errorResult.signals.some((signal) => signal.severity === 'critical' && signal.metric === 'Error rate'))
  assert.match(errorResult.recommendation, /Pause the rollout/)

  const latencyResult = analyzeMonitoringSamples(samples({
    baseline: { requests: 1000, errors: 0.2, latency: 180, conversion: 3.2 },
    current: { requests: 1000, errors: 0.2, latency: 520, conversion: 3.2 },
  }))
  assert.equal(latencyResult.health, 'Critical')
  assert.ok(latencyResult.signals.some((signal) => signal.metric === 'Latency' && signal.severity === 'critical'))
})

test('detects an abrupt last-sample error or latency jump separately from a gradual trend', () => {
  const sudden = samples()
  sudden[sudden.length - 1].errorRatePercent = 1.1
  sudden[sudden.length - 1].latencyMs = 320
  const result = analyzeMonitoringSamples(sudden)
  assert.ok(result.signals.some((signal) => signal.id === 'error-sudden-change'))
  assert.ok(result.signals.some((signal) => signal.id === 'latency-sudden-change'))
})

test('detects request-volume and conversion declines against the selected baseline', () => {
  const result = analyzeMonitoringSamples(samples({
    baseline: { requests: 1000, errors: 0.2, latency: 180, conversion: 4.0 },
    current: { requests: 600, errors: 0.2, latency: 180, conversion: 3.1 },
  }))
  assert.ok(result.signals.some((signal) => signal.id === 'request-volume-drop'))
  assert.ok(result.signals.some((signal) => signal.id === 'conversion-decline'))
})

test('an elevated existing release-risk assessment produces a warning without fabricating a metric signal', () => {
  const result = analyzeMonitoringSamples(samples(), 'High')
  assert.equal(result.health, 'Warning')
  assert.equal(result.signals.length, 0)
  assert.match(result.healthExplanation, /existing release-safety assessment is high risk/)
})

test('maps time ranges to exact windows and safely defaults invalid runtime values', () => {
  assert.equal(monitoringRanges.length, 4)
  assert.equal(rangeDurationMs('1h'), 60 * 60_000)
  assert.equal(rangeDurationMs('6h'), 6 * 60 * 60_000)
  assert.equal(rangeDurationMs('24h'), 24 * 60 * 60_000)
  assert.equal(rangeDurationMs('7d'), 7 * 24 * 60 * 60_000)
  assert.equal(rangeDurationMs('invalid'), 24 * 60 * 60_000)
  assert.equal(getRangeStart('6h', now), now - 6 * 60 * 60_000)
})

test('generates reproducible, explicitly patterned demo series and links related local activity', () => {
  const flag = makeFlag('instant_payouts')
  const activity = [
    {
      id: 'rollout-event',
      flagId: flag.id,
      title: 'Rollout increased to 50%',
      detail: 'Instant payouts',
      environment: 'Production',
      occurredAt: new Date(now - 30 * 60_000).toISOString(),
      kind: 'rollout',
    },
    {
      id: 'stale-event',
      flagId: flag.id,
      title: 'Earlier rollout',
      detail: 'Instant payouts',
      environment: 'Production',
      occurredAt: new Date(now - 2 * 60 * 60_000).toISOString(),
      kind: 'rollout',
    },
    {
      id: 'other-flag-event',
      flagId: 'other-flag',
      title: 'Different release changed',
      detail: 'another_feature',
      environment: 'Production',
      occurredAt: new Date(now - 10 * 60_000).toISOString(),
      kind: 'rollout',
    },
  ]
  const first = buildMonitoringData(flag, activity, '1h', now)
  const second = buildMonitoringData(flag, activity, '1h', now)
  assert.deepEqual(first, second)
  assert.equal(first.samples.length, 13)
  assert.equal(first.samples[0].timestamp, now - 60 * 60_000)
  assert.equal(first.current.exposurePercent, 50)
  assert.equal(patternForFlag(flag), 'error-spike')
  assert.deepEqual(first.relatedActivity.map((entry) => entry.id), ['rollout-event'])
  assert.ok(first.signals.some((signal) => signal.metric === 'Error rate'))
})

test('uses the rollout flag pattern to simulate latency and volume trends for demo scenarios', () => {
  assert.equal(patternForFlag(makeFlag('checkout_v2')), 'latency-spike')
  assert.equal(patternForFlag(makeFlag('usage_billing')), 'request-drop')
  assert.equal(patternForFlag(makeFlag('nav_refresh')), 'stable')
  assert.ok(buildMonitoringData(makeFlag('checkout_v2'), [], '24h', now).signals.some((signal) => signal.metric === 'Latency'))
  assert.ok(buildMonitoringData(makeFlag('usage_billing'), [], '24h', now).signals.some((signal) => signal.metric === 'Request volume'))
})
