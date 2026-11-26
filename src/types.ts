export type Environment = 'Development' | 'Staging' | 'Production'
export type Page = 'Overview' | 'Feature Flags' | 'Rollouts' | 'Release Monitoring' | 'Experiments' | 'Environments' | 'Release Risks' | 'Kill Switch' | 'Activity Log' | 'Settings'
export type Risk = 'Low' | 'Medium' | 'High'
export type FlagType = 'Boolean' | 'String' | 'Number' | 'JSON'
export type FlagValue = boolean | string | number | Record<string, unknown> | unknown[] | null
export type TargetingOperator = 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than'
export type TargetingMatchMode = 'all' | 'any'

export type TargetingRule = {
  id: string
  attribute: string
  operator: TargetingOperator
  value: string
  enabled: boolean
}

export type FlagEnvironmentConfig = {
  enabled: boolean
  rollout: number
  value: FlagValue
  rules: TargetingRule[]
  ruleMatch?: TargetingMatchMode
}
export type ActivityKind = 'flag' | 'rollout' | 'kill' | 'create' | 'edit' | 'safety' | 'rollback'

export type ReleaseTimelineKind = 'stage' | 'health' | 'risk' | 'decision' | 'rollback'

export type ReleaseTimelineEntry = {
  id: string
  flagId: string
  flagName: string
  environment: Environment
  kind: ReleaseTimelineKind
  title: string
  detail: string
  occurredAt: string
  risk?: Risk
  previousRisk?: Risk
}

export type ActivityEntry = {
  id: string
  flagId?: string
  title: string
  detail: string
  environment: Environment
  occurredAt: string
  kind: ActivityKind
}

export type FeatureFlag = {
  id: string
  name: string
  description: string
  key: string
  flagType: FlagType
  value: FlagValue
  environmentConfigs?: Partial<Record<Environment, FlagEnvironmentConfig>>
  targetingRules?: TargetingRule[]
  enabled: boolean
  environment: Environment
  lastConfiguredEnvironment?: Environment
  rollout: number
  rolloutKnown?: boolean
  riskKnown?: boolean
  modified: string
  owner: string
  risk: Risk
}

export type Experiment = {
  name: string
  key: string
  status: 'Running' | 'Completed'
  variants: string[]
  traffic: number[]
  conversion: string[]
  lift: string
  owner: string
  color: 'blue' | 'violet' | 'amber'
  users: string
}
