import type {
  Environment, FeatureFlag, FlagEnvironmentConfig, FlagType, FlagValue, TargetingRule,
} from '../types'

export function defaultFlagValue(type: FlagType): FlagValue {
  if (type === 'Boolean') return false
  if (type === 'Number') return 0
  if (type === 'JSON') return {}
  return ''
}

export function normalizeFlag(flag: FeatureFlag): FeatureFlag {
  const flagType = flag.flagType ?? 'Boolean'
  const value = flag.value !== undefined ? flag.value : flag.enabled
  const targetingRules = flag.targetingRules ?? []
  const primaryConfig = flag.environmentConfigs?.[flag.environment] ?? {
    enabled: flag.enabled,
    rollout: flag.rollout,
    value,
    rules: targetingRules,
    ruleMatch: 'all' as const,
  }
  return {
    ...flag,
    flagType,
    value,
    targetingRules,
    environmentConfigs: {
      ...flag.environmentConfigs,
      [flag.environment]: primaryConfig,
    },
  }
}

export function getEnvironmentConfig(flag: FeatureFlag, environment: Environment): FlagEnvironmentConfig {
  const stored = flag.environmentConfigs?.[environment]
  if (stored) return { ...stored, ruleMatch: stored.ruleMatch ?? 'all' }
  if (flag.environment === environment) {
    return {
      enabled: flag.enabled,
      rollout: flag.rollout,
      value: flag.value !== undefined ? flag.value : flag.enabled,
      rules: flag.targetingRules ?? [],
      ruleMatch: 'all',
    }
  }
  return {
    enabled: false,
    rollout: 0,
    value: defaultFlagValue(flag.flagType ?? 'Boolean'),
    rules: [],
    ruleMatch: 'all',
  }
}

export function isConfiguredInEnvironment(flag: FeatureFlag, environment: Environment): boolean {
  return flag.environment === environment || Boolean(flag.environmentConfigs?.[environment])
}

export function forEnvironment(flag: FeatureFlag, environment: Environment): FeatureFlag {
  const config = getEnvironmentConfig(flag, environment)
  return {
    ...flag,
    environment,
    enabled: config.enabled,
    rollout: config.rollout,
    value: config.value,
    targetingRules: config.rules,
  }
}

export function withEnvironmentConfig(
  flag: FeatureFlag,
  environment: Environment,
  config: FlagEnvironmentConfig,
): FeatureFlag {
  const next: FeatureFlag = {
    ...flag,
    environmentConfigs: {
      ...flag.environmentConfigs,
      [environment]: config,
    },
  }
  if (flag.environment === environment) {
    return {
      ...next,
      enabled: config.enabled,
      rollout: config.rollout,
      value: config.value,
      targetingRules: config.rules,
    }
  }
  return next
}

export function createTargetingRule(): TargetingRule {
  return {
    id: crypto.randomUUID(),
    attribute: 'country',
    operator: 'equals',
    value: '',
    enabled: true,
  }
}
