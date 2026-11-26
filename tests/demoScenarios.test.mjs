import assert from 'node:assert/strict'
import test from 'node:test'
import { getEnvironmentConfig, forEnvironment } from '../src/features/flagConfiguration.ts'
import { createDemoScenarioState, demoScenarios, isDemoScenarioId } from '../src/features/demoScenarios.ts'
import { buildMonitoringData } from '../src/features/releaseMonitoring.ts'
import { assessRelease } from '../src/features/releaseSafety.ts'

const now = Date.parse('2026-11-26T17:00:00.000Z')

test('all judge scenarios load consistent simulated flag, activity, and release state', () => {
  for (const scenario of demoScenarios) {
    const state = createDemoScenarioState(scenario.id, now)
    const flag = state.flags.find((item) => item.id === scenario.flagId)
    assert.ok(flag, `${scenario.name} has a target flag`)
    const config = getEnvironmentConfig(flag, scenario.environment)
    assert.equal(config.enabled, scenario.enabled)
    assert.equal(config.rollout, scenario.rollout)
    assert.equal(state.activity[0].flagId, scenario.flagId)
    assert.equal(state.activity[0].environment, scenario.environment)
    assert.equal(state.timeline[0].flagId, scenario.flagId)
    assert.equal(state.timeline[0].environment, scenario.environment)
    assert.equal(Date.parse(state.activity[0].occurredAt), now - 5 * 60_000)
    assert.ok(state.flags.every((item) => item.id !== scenario.flagId || item.environmentConfigs?.[scenario.environment]))
  }
})

test('scenario monitoring is deterministic and reflects the selected signal pattern', () => {
  const healthy = createDemoScenarioState('healthy', now)
  const healthyFlag = forEnvironment(healthy.flags.find((flag) => flag.id === healthy.scenario.flagId), healthy.scenario.environment)
  const healthyData = buildMonitoringData(healthyFlag, healthy.activity, '24h', now, healthy.scenario.monitoringPattern)
  const healthyAgain = buildMonitoringData(healthyFlag, healthy.activity, '24h', now, healthy.scenario.monitoringPattern)
  assert.deepEqual(healthyData.samples, healthyAgain.samples)
  assert.ok(healthyData.relatedActivity.some((entry) => entry.id === healthy.activity[0].id))
  assert.equal(healthyData.health, 'Healthy')
  assert.equal(assessRelease(healthyFlag, healthy.activity).risk, 'Low')

  const errorScenario = createDemoScenarioState('error-rate', now)
  const errorFlag = forEnvironment(errorScenario.flags.find((flag) => flag.id === errorScenario.scenario.flagId), errorScenario.scenario.environment)
  const errorData = buildMonitoringData(errorFlag, errorScenario.activity, '24h', now, errorScenario.scenario.monitoringPattern)
  assert.equal(errorData.health, 'Warning')
  assert.ok(errorData.signals.some((signal) => signal.metric === 'Error rate'))

  const latencyScenario = createDemoScenarioState('high-latency', now)
  const latencyFlag = forEnvironment(latencyScenario.flags.find((flag) => flag.id === latencyScenario.scenario.flagId), latencyScenario.scenario.environment)
  const latencyData = buildMonitoringData(latencyFlag, latencyScenario.activity, '24h', now, latencyScenario.scenario.monitoringPattern)
  assert.ok(latencyData.signals.some((signal) => signal.metric === 'Latency'))
})

test('risky rollout and rollback scenarios preserve expected safety state', () => {
  const risky = createDemoScenarioState('risky-production', now)
  const riskyFlag = forEnvironment(risky.flags.find((flag) => flag.id === risky.scenario.flagId), risky.scenario.environment)
  assert.equal(assessRelease(riskyFlag, risky.activity).risk, 'High')

  const rollback = createDemoScenarioState('rollback', now)
  const rollbackFlag = forEnvironment(rollback.flags.find((flag) => flag.id === rollback.scenario.flagId), rollback.scenario.environment)
  assert.equal(rollbackFlag.enabled, false)
  assert.equal(rollbackFlag.rollout, 0)
  assert.equal(assessRelease(rollbackFlag, rollback.activity).risk, 'Low')
  assert.equal(rollback.timeline[0].kind, 'rollback')
})

test('scenario selector rejects unknown identifiers', () => {
  assert.equal(isDemoScenarioId('healthy'), true)
  assert.equal(isDemoScenarioId('unverified'), false)
})
