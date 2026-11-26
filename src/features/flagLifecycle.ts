import { environments } from '../data/mock.ts'
import type {
  ActivityEntry, Environment, FeatureFlag, FlagEnvironmentConfig, FlagType,
  FlagValue, TargetingMatchMode, TargetingRule,
} from '../types'
import { getEnvironmentConfig, isConfiguredInEnvironment } from './flagConfiguration.ts'

export type FlagDraft = {
  name: string
  key: string
  flagType: FlagType
  configs: Record<Environment, FlagEnvironmentConfig>
}

export type UserAttributeValue = string | number | boolean | null

export type TargetingEvaluation = {
  matched: boolean
  matchedRuleIds: string[]
  explanation: string
}

export type UserFlagEvaluation = {
  enabled: boolean
  value: FlagValue
  matchedRuleIds: string[]
  exposureBucket: number
  explanation: string
}

export type EnvironmentComparison = {
  environment: Environment
  config: FlagEnvironmentConfig
  configured: boolean
  differsFrom: Environment | null
  differences: string[]
}

const operators = ['equals', 'not-equals', 'contains', 'greater-than', 'less-than'] as const

export function validateFlagDraft(
  draft: FlagDraft,
  existingFlags: FeatureFlag[],
  editingId?: string,
): string | null {
  if (!draft.name.trim()) return 'Feature name is required.'
  if (!draft.key.trim()) return 'Flag key is required.'
  if (!/^[a-z][a-z0-9_]*$/.test(draft.key)) {
    return 'Use lowercase letters, numbers, and underscores for the key.'
  }
  if (existingFlags.some((flag) => flag.id !== editingId && flag.key === draft.key)) {
    return 'A feature flag with this key already exists. Choose a unique key.'
  }

  for (const environment of environments) {
    const config = draft.configs[environment]
    if (!config || typeof config.enabled !== 'boolean') {
      return `Complete the enabled state for ${environment}.`
    }
    if (!Number.isFinite(config.rollout) || config.rollout < 0 || config.rollout > 100) {
      return `Rollout for ${environment} must be between 0% and 100%.`
    }
    if (!isValueForType(config.value, draft.flagType)) {
      return `The ${environment} value must be a valid ${draft.flagType.toLowerCase()} value.`
    }
    if (config.ruleMatch !== undefined && config.ruleMatch !== 'all' && config.ruleMatch !== 'any') {
      return `Choose whether all or any targeting rules must match in ${environment}.`
    }
    for (const rule of config.rules) {
      if (!rule.enabled) continue
      if (!rule.attribute.trim()) return `Every enabled targeting rule in ${environment} needs an attribute.`
      if (!rule.value.trim()) return `Every enabled targeting rule in ${environment} needs a comparison value.`
      if (!operators.includes(rule.operator)) return `A targeting rule in ${environment} has an unsupported operator.`
    }
  }
  return null
}

function isValueForType(value: FlagValue, type: FlagType): boolean {
  if (type === 'Boolean') return typeof value === 'boolean'
  if (type === 'String') return typeof value === 'string'
  if (type === 'Number') return typeof value === 'number' && Number.isFinite(value)
  return value !== null && typeof value === 'object'
}

function compareValues(actual: UserAttributeValue, expected: string, operator: TargetingRule['operator']): boolean {
  if (operator === 'equals') return String(actual).toLowerCase() === expected.toLowerCase()
  if (operator === 'not-equals') return String(actual).toLowerCase() !== expected.toLowerCase()
  if (operator === 'contains') return String(actual).toLowerCase().includes(expected.toLowerCase())
  const numericActual = typeof actual === 'number' ? actual : Number(actual)
  const numericExpected = Number(expected)
  if (!Number.isFinite(numericActual) || !Number.isFinite(numericExpected)) return false
  return operator === 'greater-than' ? numericActual > numericExpected : numericActual < numericExpected
}

export function evaluateTargetingRules(
  rules: TargetingRule[],
  attributes: Record<string, UserAttributeValue>,
  mode: TargetingMatchMode = 'all',
): TargetingEvaluation {
  const enabledRules = rules.filter((rule) => rule.enabled)
  if (!enabledRules.length) {
    return { matched: true, matchedRuleIds: [], explanation: 'No enabled targeting conditions; the default configuration applies.' }
  }

  const results = enabledRules.map((rule) => ({
    rule,
    matched: Object.hasOwn(attributes, rule.attribute) &&
      compareValues(attributes[rule.attribute], rule.value, rule.operator),
  }))
  const matched = mode === 'any'
    ? results.some((result) => result.matched)
    : results.every((result) => result.matched)
  const matchedRuleIds = results.filter((result) => result.matched).map(({ rule }) => rule.id)
  const matchedCount = matchedRuleIds.length
  const explanation = matched
    ? mode === 'all'
      ? `${matchedCount === 1 ? 'The targeting condition matched' : 'All targeting conditions matched'} (${matchedCount}/${enabledRules.length}); this user qualifies for the configured value.`
      : `At least one targeting condition matched (${matchedCount}/${enabledRules.length}); this user qualifies for the configured value.`
    : mode === 'all'
      ? `${enabledRules.length === 1 ? 'The targeting condition did not match' : 'Not all targeting conditions matched'} (${matchedCount}/${enabledRules.length}); this user receives the default value.`
      : `No targeting condition${enabledRules.length === 1 ? '' : 's'} matched (${matchedCount}/${enabledRules.length}); this user receives the default value.`
  return { matched, matchedRuleIds, explanation }
}

function stableHash(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7)
}

export function evaluateFlagForUser(
  flag: FeatureFlag,
  environment: Environment,
  attributes: Record<string, UserAttributeValue>,
): UserFlagEvaluation {
  const config = getEnvironmentConfig(flag, environment)
  const targeting = evaluateTargetingRules(config.rules, attributes, config.ruleMatch ?? 'all')
  const attributeSignature = Object.entries(attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
  const identityEntry = ['user_id', 'userId', 'id'].find((attribute) => attributes[attribute] !== undefined && attributes[attribute] !== null)
  const cohortIdentity = identityEntry ? `${identityEntry}=${String(attributes[identityEntry])}` : attributeSignature
  const exposureBucket = stableHash(`${flag.key}:${environment}:${cohortIdentity}`) % 100
  const value = config.value

  if (!config.enabled) {
    return { enabled: false, value, matchedRuleIds: targeting.matchedRuleIds, exposureBucket, explanation: `${environment} configuration is disabled; the feature is off for this user.` }
  }
  if (!targeting.matched) {
    return { enabled: false, value, matchedRuleIds: targeting.matchedRuleIds, exposureBucket, explanation: targeting.explanation }
  }
  if (config.rollout <= exposureBucket) {
    return { enabled: false, value, matchedRuleIds: targeting.matchedRuleIds, exposureBucket, explanation: `${targeting.explanation} The deterministic demo cohort bucket is ${exposureBucket}, outside the ${config.rollout}% rollout.` }
  }
  return {
    enabled: true,
    value,
    matchedRuleIds: targeting.matchedRuleIds,
    exposureBucket,
    explanation: `${targeting.explanation} The deterministic demo cohort bucket is ${exposureBucket}, inside the ${config.rollout}% rollout.`,
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function compareEnvironmentConfigurations(
  flag: FeatureFlag,
  baselineEnvironment: Environment = isConfiguredInEnvironment(flag, flag.environment)
    ? flag.environment
    : environments.find((environment) => isConfiguredInEnvironment(flag, environment)) ?? environments[0],
): EnvironmentComparison[] {
  const baseline = getEnvironmentConfig(flag, baselineEnvironment)
  return environments.map((environment) => {
    const config = getEnvironmentConfig(flag, environment)
    const differences: string[] = []
    if (config.enabled !== baseline.enabled) differences.push('enabled state')
    if (!sameValue(config.value, baseline.value)) differences.push('default value')
    if (config.rollout !== baseline.rollout) differences.push('rollout')
    if ((config.ruleMatch ?? 'all') !== (baseline.ruleMatch ?? 'all') || !sameValue(config.rules, baseline.rules)) {
      differences.push('targeting rules')
    }
    return {
      environment,
      config,
      configured: isConfiguredInEnvironment(flag, environment),
      differsFrom: environment === baselineEnvironment ? null : baselineEnvironment,
      differences,
    }
  })
}

function formatValue(value: FlagValue): string {
  return JSON.stringify(value)
}

export function summarizeFlagChanges(previous: FeatureFlag, next: FeatureFlag): string[] {
  const changes: string[] = []
  if (previous.name !== next.name) changes.push(`name changed from "${previous.name}" to "${next.name}"`)
  if (previous.key !== next.key) changes.push(`key changed from "${previous.key}" to "${next.key}"`)
  if (previous.description !== next.description) changes.push('description updated')
  if (previous.flagType !== next.flagType) changes.push(`type changed from ${previous.flagType} to ${next.flagType}`)

  for (const environment of environments) {
    const before = getEnvironmentConfig(previous, environment)
    const after = getEnvironmentConfig(next, environment)
    const environmentChanges: string[] = []
    if (before.enabled !== after.enabled) environmentChanges.push(`flag ${after.enabled ? 'enabled' : 'disabled'}`)
    if (before.rollout !== after.rollout) environmentChanges.push(`rollout ${before.rollout}% → ${after.rollout}%`)
    if (!sameValue(before.value, after.value)) environmentChanges.push(`default value ${formatValue(before.value)} → ${formatValue(after.value)}`)
    const beforeMatch = before.ruleMatch ?? 'all'
    const afterMatch = after.ruleMatch ?? 'all'
    if (beforeMatch !== afterMatch) environmentChanges.push(`rule logic changed to ${afterMatch.toUpperCase()}`)
    if (!sameValue(before.rules, after.rules)) {
      environmentChanges.push(`targeting rules updated (${before.rules.length} → ${after.rules.length}; match ${afterMatch.toUpperCase()})`)
    }
    if (environmentChanges.length) changes.push(`${environment}: ${environmentChanges.join(', ')}`)
  }
  return changes
}

export function createFlagAuditEntry(
  flag: FeatureFlag,
  previous: FeatureFlag | undefined,
  actor: string,
): ActivityEntry {
  const editing = Boolean(previous)
  const changes = previous ? summarizeFlagChanges(previous, flag) : []
  const summary = previous
    ? changes.length ? changes.join('; ') : 'No configuration differences detected'
    : `created ${flag.flagType} flag "${flag.key}" with ${environments.filter((environment) => isConfiguredInEnvironment(flag, environment)).length} configured environment(s)`
  return {
    id: crypto.randomUUID(),
    flagId: flag.id,
    title: editing ? `${flag.name} updated` : `${flag.name} created`,
    detail: `${actor} · Local change · ${summary}`,
    environment: flag.lastConfiguredEnvironment ?? flag.environment,
    occurredAt: new Date().toISOString(),
    kind: editing ? 'edit' : 'create',
  }
}

export function localFlagHistory(flag: FeatureFlag, activity: ActivityEntry[]): ActivityEntry[] {
  const identifiers = [flag.name, flag.key].filter(Boolean).map((value) => value.toLowerCase())
  return activity.filter((entry) => {
    if (entry.flagId) return entry.flagId === flag.id
    const text = `${entry.title} ${entry.detail}`.toLowerCase()
    return identifiers.some((identifier) => text.includes(identifier))
  })
}
