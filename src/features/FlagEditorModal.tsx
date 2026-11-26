import { useState } from 'react'
import {
  Braces, Check, Code2, Copy, Flag, Plus, Trash2, X,
} from 'lucide-react'
import { environments } from '../data/mock'
import {
  createTargetingRule, getEnvironmentConfig, isConfiguredInEnvironment,
} from './flagConfiguration'
import {
  compareEnvironmentConfigurations, evaluateFlagForUser, localFlagHistory,
  validateFlagDraft,
} from './flagLifecycle'
import type {
  ActivityEntry, Environment, FeatureFlag, FlagEnvironmentConfig, FlagType, FlagValue, TargetingOperator,
} from '../types'

type Props = {
  flag: FeatureFlag | null
  existingFlags: FeatureFlag[]
  environment: Environment
  owner: string
  activity: ActivityEntry[]
  isDuplicate?: boolean
  onClose: () => void
  onSave: (flag: FeatureFlag) => void
  onDuplicate: (flag: FeatureFlag) => void
}

function initialConfigs(flag: FeatureFlag | null, environment: Environment): Record<Environment, FlagEnvironmentConfig> {
  return Object.fromEntries(environments.map((env) => [env, getEnvironmentConfig(
    flag ?? {
      id: '',
      name: '',
      description: '',
      key: '',
      flagType: 'Boolean',
      value: false,
      enabled: false,
      environment,
      rollout: 0,
      modified: 'Just now',
      owner: '',
      risk: 'Low',
    },
    env,
  )])) as Record<Environment, FlagEnvironmentConfig>
}

function serializeValue(value: FlagValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function coerceValue(value: FlagValue, type: FlagType): FlagValue {
  if (type === 'Boolean') return typeof value === 'boolean' ? value : false
  if (type === 'String') return typeof value === 'string' ? value : JSON.stringify(value)
  if (type === 'Number') return typeof value === 'number' ? value : Number(value) || 0
  if (typeof value !== 'string') return value !== null && typeof value === 'object' ? value : {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' ? parsed as FlagValue : {}
  } catch { return {} }
}

export function FlagEditorModal({
  flag, existingFlags, environment, owner, activity, isDuplicate = false,
  onClose, onSave, onDuplicate,
}: Props) {
  const [name, setName] = useState(flag?.name ?? '')
  const [description, setDescription] = useState(flag?.description ?? '')
  const [key, setKey] = useState(flag?.key ?? '')
  const [flagType, setFlagType] = useState<FlagType>(flag?.flagType ?? 'Boolean')
  const [configs, setConfigs] = useState(() => initialConfigs(flag, environment))
  const [configuredEnvironments, setConfiguredEnvironments] = useState<Environment[]>(
    () => flag ? environments.filter((env) => isConfiguredInEnvironment(flag, env)) : [environment],
  )
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment>(environment)
  const [jsonDraft, setJsonDraft] = useState(() => {
    const config = getEnvironmentConfig(flag ?? {
      id: '', name: '', description: '', key: '', flagType: 'Boolean', value: false,
      enabled: false, environment, rollout: 0, modified: '', owner: '', risk: 'Low',
    }, environment)
    return JSON.stringify(config.value ?? false, null, 2)
  })
  const [error, setError] = useState('')
  const [sampleAttributes, setSampleAttributes] = useState<Record<string, string>>({
    country: 'US',
    plan: 'enterprise',
    user_id: 'demo-user-001',
  })
  const config = configs[selectedEnvironment]
  const selectedEnvironmentConfigured = configuredEnvironments.includes(selectedEnvironment)
  const storedConfigs: Partial<Record<Environment, FlagEnvironmentConfig>> = {}
  for (const env of configuredEnvironments) storedConfigs[env] = configs[env]
  const primaryEnvironment = flag?.environment ?? environment
  const workingFlag: FeatureFlag = {
    id: flag?.id ?? '',
    name,
    description,
    key,
    flagType,
    value: configs[primaryEnvironment].value,
    environmentConfigs: storedConfigs,
    enabled: configs[primaryEnvironment].enabled,
    environment: primaryEnvironment,
    rollout: configs[primaryEnvironment].rollout,
    modified: flag?.modified ?? 'Just now',
    owner: flag?.owner ?? owner,
    risk: flag?.risk ?? 'Low',
  }
  const environmentComparisons = compareEnvironmentConfigurations(workingFlag, selectedEnvironment)
  const sampleEvaluation = evaluateFlagForUser(workingFlag, selectedEnvironment, sampleAttributes)
  const history = flag && !isDuplicate ? localFlagHistory(flag, activity).slice(0, 5) : []

  function updateConfig(patch: Partial<FlagEnvironmentConfig>) {
    setConfigs((current) => ({ ...current, [selectedEnvironment]: { ...current[selectedEnvironment], ...patch } }))
    setConfiguredEnvironments((current) => current.includes(selectedEnvironment) ? current : [...current, selectedEnvironment])
  }

  function changeEnvironment(next: Environment) {
    setSelectedEnvironment(next)
    setJsonDraft(JSON.stringify(configs[next].value, null, 2))
    setError('')
  }

  function changeType(nextType: FlagType) {
    setFlagType(nextType)
    setConfigs((current) => Object.fromEntries(environments.map((env) => [
      env,
      { ...current[env], value: coerceValue(current[env].value, nextType) },
    ])) as Record<Environment, FlagEnvironmentConfig>)
    if (nextType === 'JSON') setJsonDraft(JSON.stringify(coerceValue(config.value, nextType), null, 2))
    setError('')
  }

  function updateJsonValue(value: string) {
    setJsonDraft(value)
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed === null || typeof parsed !== 'object') {
        setError('JSON flag values must be an object or array.')
        return
      }
      updateConfig({ value: parsed as FlagValue })
      setError('')
    } catch {
      setError('Enter valid JSON before saving.')
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (flagType === 'JSON') {
      try {
        const parsed: unknown = JSON.parse(jsonDraft)
        if (parsed === null || typeof parsed !== 'object') throw new Error('JSON must be an object or array.')
        updateConfig({ value: parsed as FlagValue })
      } catch { setError('Enter a valid JSON object or array before saving.'); return }
    }
    const validationError = validateFlagDraft({ name, key, flagType, configs }, existingFlags, isDuplicate ? undefined : flag?.id)
    if (validationError) { setError(validationError); return }
    const primaryEnvironment = flag?.environment ?? environment
    const primaryConfig = configs[primaryEnvironment]
    onSave({
      id: flag?.id ?? '',
      name: name.trim(),
      description: description.trim(),
      key,
      flagType,
      value: primaryConfig.value,
      targetingRules: primaryConfig.rules,
      environmentConfigs: storedConfigs,
      enabled: primaryConfig.enabled,
      environment: primaryEnvironment,
      lastConfiguredEnvironment: selectedEnvironment,
      rollout: primaryConfig.rollout,
      modified: 'Just now',
      owner: flag?.owner ?? owner,
      risk: flag?.risk ?? 'Low',
    })
  }

  function addSampleAttribute() {
    let index = 1
    while (Object.hasOwn(sampleAttributes, `attribute_${index}`)) index += 1
    setSampleAttributes((current) => ({ ...current, [`attribute_${index}`]: '' }))
  }

  return <div className="modal-backdrop flag-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="flag-editor-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="flag-editor-header">
        <div className="flag-editor-heading"><span className="flag-editor-mark"><Flag size={17} /></span><div><h2 id="modal-title">{isDuplicate ? 'Duplicate feature flag' : flag ? 'Flag details' : 'Create feature flag'}</h2><p>{isDuplicate ? 'Create a separate local flag using this configuration as a starting point.' : flag ? 'Inspect configuration, targeting, environment differences, and local change history.' : 'Define a typed flag and configure its first release.'}</p></div></div>
        <button className="icon-button subtle" aria-label="Close modal" onClick={onClose}><X size={17} /></button>
      </header>
      <form onSubmit={handleSubmit} className="flag-editor-form">
        <div className="flag-editor-main-fields">
          <label className="form-field"><span>FEATURE NAME</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. New checkout experience" /></label>
          <label className="form-field"><span>FLAG KEY</span><div className="key-input"><Code2 size={14} /><input value={key} onChange={(event) => setKey(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g. checkout_v2" /></div><small>Use a stable key in your application code.</small></label>
          <label className="form-field"><span>DESCRIPTION <i>OPTIONAL</i></span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this feature do?" /></label>
          <label className="form-field flag-type-field"><span>FLAG TYPE</span><select value={flagType} onChange={(event) => changeType(event.target.value as FlagType)}><option>Boolean</option><option>String</option><option>Number</option><option>JSON</option></select></label>
        </div>
        <div className="flag-config-area">
          <div className="flag-config-heading"><div><b>Environment configuration</b><span>Independent values and targeting for each environment</span></div><span className="simulation-tag"><span />LOCAL CONFIG</span></div>
          <details className="flag-environment-comparison" open>
            <summary><span>Compare environments</span><small>Differences are measured against {selectedEnvironment}</small></summary>
            <div className="flag-comparison-grid">{environmentComparisons.map(({ environment: env, config: envConfig, configured, differsFrom, differences }) => <article key={env} className={`${differences.length ? 'has-differences' : ''} ${!configured ? 'not-configured' : ''}`}>
              <div><i className={`env-dot ${env.toLowerCase()}`} /><b>{env}</b><span>{configured ? envConfig.enabled ? 'Enabled' : 'Disabled' : 'Not configured'}</span></div>
              <strong>{envConfig.rollout}% <small>rollout</small></strong>
              <span className="flag-comparison-value">Value: {JSON.stringify(envConfig.value)}</span>
              <small>{envConfig.rules.filter((rule) => rule.enabled).length} active condition(s) · match {envConfig.ruleMatch ?? 'all'}</small>
              <em>{!configured ? 'Defaults previewed · not configured' : differsFrom === null ? 'Comparison baseline' : differences.length ? `Differs: ${differences.join(', ')}` : `Matches ${selectedEnvironment}`}</em>
            </article>)}</div>
          </details>
          <div className="flag-environment-tabs" role="tablist" aria-label="Flag environment configuration">{environments.map((env) => <button type="button" role="tab" aria-selected={selectedEnvironment === env} className={selectedEnvironment === env ? 'active' : ''} key={env} onClick={() => changeEnvironment(env)}><i className={`env-dot ${env.toLowerCase()}`} />{env}</button>)}</div>
          <div className="flag-config-content">
            <div className="flag-config-topline"><div><span className={`env-indicator ${selectedEnvironment.toLowerCase()}`}><Code2 size={14} /></span><span><b>{selectedEnvironment}</b><small>{!selectedEnvironmentConfigured ? 'Not configured · edits create this environment' : config.enabled ? 'Enabled in this environment' : 'Disabled in this environment'}</small></span></div><button type="button" className={`flag-enable-control ${config.enabled ? 'enabled' : ''}`} role="switch" aria-checked={config.enabled} aria-label={`Enable in ${selectedEnvironment}`} onClick={() => updateConfig({ enabled: !config.enabled })}><i /></button></div>
            <div className="flag-detail-two-col">
              <label className="form-field"><span>DEFAULT VALUE · {flagType.toUpperCase()}</span>
                {flagType === 'Boolean' ? <select value={String(config.value)} onChange={(event) => updateConfig({ value: event.target.value === 'true' })}><option value="false">false</option><option value="true">true</option></select>
                  : flagType === 'Number' ? <input type="number" required step="any" value={typeof config.value === 'number' ? config.value : 0} onChange={(event) => updateConfig({ value: Number(event.target.value) })} />
                    : flagType === 'JSON' ? <textarea className="flag-json-input" rows={4} value={jsonDraft} onChange={(event) => updateJsonValue(event.target.value)} spellCheck={false} />
                      : <input value={typeof config.value === 'string' ? config.value : serializeValue(config.value)} onChange={(event) => updateConfig({ value: event.target.value })} placeholder="Enter a string value" />}
              </label>
              <div className="form-field"><span>PERCENTAGE ROLLOUT <b className="flag-rollout-value">{config.rollout}%</b></span><input className="range-slider flag-detail-slider" type="range" min="0" max="100" step="1" value={config.rollout} style={{ '--range-progress': `${config.rollout}%` } as React.CSSProperties} onChange={(event) => updateConfig({ rollout: Number(event.target.value) })} aria-label={`${selectedEnvironment} rollout percentage`} /><small>Estimated exposure is limited to this environment.</small></div>
            </div>
            <div className="flag-rules-heading"><div><span className="flag-rules-icon"><Braces size={14} /></span><div><b>Targeting rules</b><small>Choose how enabled conditions combine for this environment.</small></div></div><button type="button" className="text-button" onClick={() => updateConfig({ rules: [...config.rules, createTargetingRule()] })}><Plus size={13} />Add rule</button></div>
            <label className="flag-rule-logic">Match
              <select aria-label="Targeting condition logic" value={config.ruleMatch ?? 'all'} onChange={(event) => updateConfig({ ruleMatch: event.target.value as 'all' | 'any' })}>
                <option value="all">ALL conditions (AND)</option><option value="any">ANY condition (OR)</option>
              </select>
            </label>
            {config.rules.length ? <div className="flag-rule-list">{config.rules.map((rule) => <div className="flag-rule-row" key={rule.id}>
              <label className="flag-rule-enabled"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateConfig({ rules: config.rules.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item) })} aria-label="Enable targeting rule" /></label>
              <input aria-label="Targeting attribute" value={rule.attribute} onChange={(event) => updateConfig({ rules: config.rules.map((item) => item.id === rule.id ? { ...item, attribute: event.target.value } : item) })} placeholder="Attribute" />
              <select aria-label="Targeting operator" value={rule.operator} onChange={(event) => updateConfig({ rules: config.rules.map((item) => item.id === rule.id ? { ...item, operator: event.target.value as TargetingOperator } : item) })}><option value="equals">equals</option><option value="not-equals">does not equal</option><option value="contains">contains</option><option value="greater-than">greater than</option><option value="less-than">less than</option></select>
              <input aria-label="Targeting value" value={rule.value} onChange={(event) => updateConfig({ rules: config.rules.map((item) => item.id === rule.id ? { ...item, value: event.target.value } : item) })} placeholder="Value" />
              <button type="button" aria-label="Remove targeting rule" onClick={() => updateConfig({ rules: config.rules.filter((item) => item.id !== rule.id) })}><Trash2 size={13} /></button>
            </div>)}</div> : <div className="flag-rules-empty"><Braces size={15} /><span>No targeting rules. This flag uses its default value for everyone in {selectedEnvironment}.</span></div>}
            <details className="flag-evaluation-preview" open>
              <summary><span>Sample user evaluation</span><small>Deterministic local simulation</small></summary>
              <div className="flag-sample-attributes">{Object.entries(sampleAttributes).map(([attribute, value]) => <label key={attribute}><span>{attribute}</span><input value={value} onChange={(event) => setSampleAttributes((current) => ({ ...current, [attribute]: event.target.value }))} aria-label={`Sample user ${attribute}`} /></label>)}<button type="button" className="text-button" onClick={addSampleAttribute}><Plus size={13} />Add attribute</button></div>
              <div className={`flag-evaluation-result ${sampleEvaluation.enabled ? 'evaluation-on' : 'evaluation-off'}`}><b>{sampleEvaluation.enabled ? 'Feature enabled' : 'Default / disabled result'}</b><code>{JSON.stringify(sampleEvaluation.value)}</code><span>{sampleEvaluation.explanation}</span></div>
            </details>
          </div>
          <div className="flag-editor-note"><Check size={13} /><span>Each environment keeps its own enabled state, value, rollout, and targeting rules.</span></div>
        </div>
        {flag && !isDuplicate && <details className="flag-local-history">
          <summary><span>Local change history</span><small>{history.length} matching event(s) · this browser only</small></summary>
          {history.length ? <ol>{history.map((entry) => <li key={entry.id}><b>{entry.title}</b><span>{entry.detail}</span><time>{new Date(entry.occurredAt).toLocaleString()}</time></li>)}</ol>
            : <p className="flag-local-history-empty">No local events are recorded for this flag. Flagsmith server-side audit history is not available here.</p>}
        </details>}
        {error && <div className="form-error"><X size={14} />{error}</div>}
        <footer className="flag-editor-footer"><span><Code2 size={12} />Local configuration · saved in this browser</span><div>{flag && !isDuplicate && <button type="button" className="button button-quiet" onClick={() => onDuplicate(flag)}><Copy size={14} />Duplicate</button>}<button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">{flag && !isDuplicate ? <><Check size={15} />Save changes</> : <><Plus size={15} />{isDuplicate ? 'Create duplicate' : 'Create flag'}</>}</button></div></footer>
      </form>
    </section>
  </div>
}
