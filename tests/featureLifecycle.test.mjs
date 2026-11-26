import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareEnvironmentConfigurations,
  createFlagAuditEntry,
  evaluateFlagForUser,
  evaluateTargetingRules,
  localFlagHistory,
  summarizeFlagChanges,
  validateFlagDraft,
} from '../src/features/flagLifecycle.ts'
import { getEnvironmentConfig } from '../src/features/flagConfiguration.ts'

function makeFlag() {
  const flag = {
    id: 'flag-1',
    name: 'Checkout',
    description: 'New checkout',
    key: 'checkout_v2',
    flagType: 'Boolean',
    value: true,
    enabled: true,
    environment: 'Development',
    rollout: 100,
    modified: 'Just now',
    owner: 'Ankith',
    risk: 'Low',
    environmentConfigs: {
      Development: { enabled: true, rollout: 100, value: true, rules: [], ruleMatch: 'all' },
      Staging: { enabled: true, rollout: 50, value: true, rules: [], ruleMatch: 'all' },
      Production: { enabled: false, rollout: 0, value: true, rules: [], ruleMatch: 'all' },
    },
  }
  return flag
}

function makeDraft(flag = makeFlag()) {
  return {
    name: flag.name,
    key: flag.key,
    flagType: flag.flagType,
    configs: Object.fromEntries(['Development', 'Staging', 'Production'].map((environment) => [
      environment,
      getEnvironmentConfig(flag, environment),
    ])),
  }
}

test('validates typed flag values, unique keys, rollouts, and enabled targeting conditions', () => {
  const flag = makeFlag()
  assert.equal(validateFlagDraft(makeDraft(flag), [flag], flag.id), null)
  assert.match(validateFlagDraft({ ...makeDraft(), key: 'Invalid-Key' }, []), /lowercase letters/)
  assert.match(validateFlagDraft(makeDraft(), [flag]), /already exists/)

  const invalidRollout = makeDraft()
  invalidRollout.configs.Production.rollout = 101
  assert.match(validateFlagDraft(invalidRollout, []), /between 0% and 100%/)

  const invalidNumber = makeDraft()
  invalidNumber.flagType = 'Number'
  invalidNumber.configs.Staging.value = Number.NaN
  assert.match(validateFlagDraft(invalidNumber, []), /valid number/)

  const invalidJson = makeDraft()
  invalidJson.flagType = 'JSON'
  invalidJson.configs.Development.value = null
  assert.match(validateFlagDraft(invalidJson, []), /valid json/)

  const incompleteRule = makeDraft()
  incompleteRule.configs.Development.rules = [{ id: 'rule-1', attribute: '', operator: 'equals', value: '', enabled: true }]
  assert.match(validateFlagDraft(incompleteRule, []), /needs an attribute/)
})

test('evaluates AND and OR targeting logic against supplied user attributes', () => {
  const rules = [
    { id: 'country', attribute: 'country', operator: 'equals', value: 'US', enabled: true },
    { id: 'plan', attribute: 'plan', operator: 'equals', value: 'enterprise', enabled: true },
    { id: 'seats', attribute: 'seats', operator: 'greater-than', value: '10', enabled: true },
  ]
  const attributes = { country: 'US', plan: 'free', seats: 25 }
  const all = evaluateTargetingRules(rules, attributes, 'all')
  const any = evaluateTargetingRules(rules, attributes, 'any')

  assert.equal(all.matched, false)
  assert.deepEqual(all.matchedRuleIds, ['country', 'seats'])
  assert.equal(any.matched, true)
  assert.match(any.explanation, /At least one targeting condition/)
})

test('evaluates flag state and rollout deterministically for a sample user', () => {
  const flag = makeFlag()
  flag.environmentConfigs.Staging.rules = [
    { id: 'rule-1', attribute: 'plan', operator: 'equals', value: 'enterprise', enabled: true },
  ]
  const eligible = evaluateFlagForUser(flag, 'Staging', { plan: 'enterprise', user_id: 'sample-1' })
  const ineligible = evaluateFlagForUser(flag, 'Staging', { plan: 'free', user_id: 'sample-1' })
  const disabled = evaluateFlagForUser(flag, 'Production', { plan: 'enterprise' })

  const changedAttributes = evaluateFlagForUser(flag, 'Staging', { user_id: 'sample-1', plan: 'free' })
  assert.equal(eligible.exposureBucket, evaluateFlagForUser(flag, 'Staging', { user_id: 'sample-1', plan: 'enterprise' }).exposureBucket)
  assert.equal(eligible.exposureBucket, changedAttributes.exposureBucket)
  assert.match(eligible.explanation, /rollout/)
  assert.equal(ineligible.enabled, false)
  assert.match(ineligible.explanation, /default value/)
  assert.equal(disabled.enabled, false)
  assert.match(disabled.explanation, /disabled/)
})

test('compares environment configuration and identifies unconfigured environments', () => {
  const flag = makeFlag()
  delete flag.environmentConfigs.Staging
  const comparison = compareEnvironmentConfigurations(flag)
  const development = comparison.find((item) => item.environment === 'Development')
  const staging = comparison.find((item) => item.environment === 'Staging')
  const production = comparison.find((item) => item.environment === 'Production')
  const stagingBaseline = compareEnvironmentConfigurations(flag, 'Staging')

  assert.equal(development.configured, true)
  assert.equal(staging.configured, false)
  assert.ok(staging.differences.includes('rollout'))
  assert.ok(production.differences.includes('enabled state'))
  assert.equal(stagingBaseline.find((item) => item.environment === 'Staging').differsFrom, null)
  assert.ok(stagingBaseline.find((item) => item.environment === 'Development').differences.includes('rollout'))
})

test('summarizes edits across settings, targeting, environment state, and rollout', () => {
  const before = makeFlag()
  const after = makeFlag()
  after.description = 'Updated checkout'
  after.environmentConfigs.Production.enabled = true
  after.environmentConfigs.Production.rollout = 25
  after.environmentConfigs.Production.ruleMatch = 'any'
  after.environmentConfigs.Production.rules = [
    { id: 'rule-1', attribute: 'country', operator: 'equals', value: 'US', enabled: true },
  ]
  const summary = summarizeFlagChanges(before, after)

  assert.ok(summary.includes('description updated'))
  assert.ok(summary.some((change) => change.startsWith('Production:')))
  assert.match(summary.find((change) => change.startsWith('Production:')), /flag enabled/)
  assert.match(summary.find((change) => change.startsWith('Production:')), /rollout 0% → 25%/)
  assert.match(summary.find((change) => change.startsWith('Production:')), /rule logic changed to ANY/)
  assert.match(summary.find((change) => change.startsWith('Production:')), /targeting rules updated \(0 → 1/)
})

test('creates a correlated local audit entry with meaningful configuration changes', () => {
  const before = makeFlag()
  const after = makeFlag()
  after.environmentConfigs.Staging.rollout = 75
  after.environmentConfigs.Staging.rules = [
    { id: 'rule-1', attribute: 'country', operator: 'equals', value: 'US', enabled: true },
  ]
  after.lastConfiguredEnvironment = 'Staging'
  const entry = createFlagAuditEntry(after, before, 'Ankith')

  assert.equal(entry.flagId, after.id)
  assert.equal(entry.environment, 'Staging')
  assert.equal(entry.kind, 'edit')
  assert.match(entry.detail, /Local change/)
  assert.match(entry.detail, /Staging: rollout 50% → 75%/)
  assert.match(entry.detail, /targeting rules updated/)
})

test('filters local activity history by flag name or key', () => {
  const flag = makeFlag()
  const activity = [
    { id: '1', flagId: 'flag-1', title: 'Flag renamed', detail: 'Local change · name changed from "Checkout"', environment: 'Production', occurredAt: '2026-01-01T00:00:00Z', kind: 'edit' },
    { id: '2', title: 'Flag changed', detail: 'checkout_v2 targeting updated', environment: 'Development', occurredAt: '2026-01-02T00:00:00Z', kind: 'edit' },
    { id: '3', flagId: 'other-flag', title: 'Checkout updated', detail: 'Unrelated flag config', environment: 'Development', occurredAt: '2026-01-03T00:00:00Z', kind: 'edit' },
  ]
  assert.deepEqual(localFlagHistory(flag, activity).map((entry) => entry.id), ['1', '2'])
})
