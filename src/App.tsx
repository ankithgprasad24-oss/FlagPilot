import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Beaker, Bell, Bolt, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Code2, Command, Compass, Copy, Ellipsis, ExternalLink, Flag, FlaskConical,
  GitBranch, LockKeyhole,
  Menu, MoreHorizontal, Plus, RotateCcw, Search, Settings, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, ToggleLeft, Trash2, TrendingUp, Users, ListFilter,
  X, Zap,
} from 'lucide-react'
import { audience, environments, initialActivity, initialExperiments, initialFlags, navItems } from './data/mock'
import { getIntegrationConfig, type IntegrationConfig, type LiveIntegrationConfig } from './integrations/config'
import { createFlagDataSource, type IntegrationStatus } from './integrations/flagDataSource'
import type { ActivityEntry, ActivityKind, Environment, Experiment, FeatureFlag, Page, ReleaseTimelineEntry, Risk } from './types'
import { assessRelease, projectRelease, type ReleaseDecision } from './features/releaseSafety'
import { ReleaseSafetyPage } from './features/ReleaseSafetyPage'
import { ReleaseMonitoringPage } from './features/ReleaseMonitoringPage'
import { forEnvironment, getEnvironmentConfig, isConfiguredInEnvironment, normalizeFlag, withEnvironmentConfig } from './features/flagConfiguration'
import { createFlagAuditEntry } from './features/flagLifecycle'
import { createDemoScenarioState, demoScenarios, getDemoScenario, isDemoScenarioId, type DemoScenarioId } from './features/demoScenarios'
import { FlagEditorModal } from './features/FlagEditorModal'
import { nearestRolloutStage, rolloutStages, simulateRolloutMetrics } from './features/rolloutSimulation'
import { FlagsmithConnectionSettings } from './integrations/FlagsmithConnectionSettings'
import './App.css'
import './features.css'

function readStoredFlags(): FeatureFlag[] {
  const saved = localStorage.getItem('flagpilot-flags')
  if (!saved) return initialFlags
  try {
    const parsed: unknown = JSON.parse(saved)
    if (Array.isArray(parsed)) return (parsed as FeatureFlag[]).map((storedFlag) => {
      const flag = normalizeFlag(storedFlag)
      const sample = initialFlags.find((initialFlag) => initialFlag.id === flag.id)
      return sample ? { ...flag, owner: sample.owner } : flag
    })
    throw new Error('Stored flags are not a list')
  } catch (error) {
    console.error('Unable to load saved feature flags; using sample data.', error)
    return initialFlags
  }
}

function readStoredExperiments(): Experiment[] {
  const saved = localStorage.getItem('flagpilot-experiments')
  if (!saved) return initialExperiments
  try {
    const parsed: unknown = JSON.parse(saved)
    if (Array.isArray(parsed)) return (parsed as Experiment[]).map((experiment) => {
      const sample = initialExperiments.find((initialExperiment) => initialExperiment.key === experiment.key)
      return sample ? { ...experiment, owner: sample.owner } : experiment
    })
    throw new Error('Stored experiments are not a list')
  } catch (error) {
    console.error('Unable to load saved experiments; using sample data.', error)
    return initialExperiments
  }
}

function readStoredActivity(): ActivityEntry[] {
  const saved = localStorage.getItem('flagpilot-activity')
  if (!saved) return initialActivity
  try {
    const parsed: unknown = JSON.parse(saved)
    if (Array.isArray(parsed)) return parsed as ActivityEntry[]
    throw new Error('Stored activity is not a list')
  } catch (error) {
    console.error('Unable to load saved activity; using sample data.', error)
    return initialActivity
  }
}

function readStoredReleaseTimeline(): ReleaseTimelineEntry[] {
  const saved = localStorage.getItem('flagpilot-release-timeline')
  if (!saved) return []
  try {
    const parsed: unknown = JSON.parse(saved)
    if (Array.isArray(parsed)) return parsed as ReleaseTimelineEntry[]
    throw new Error('Stored release timeline is not a list')
  } catch (error) {
    console.error('Unable to load saved release timeline; starting with an empty timeline.', error)
    return []
  }
}

function readProfileName(): string {
  const saved = localStorage.getItem('flagpilot-profile-name')
  return saved || 'Ankith'
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

function formatActivityTime(timestamp: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime())
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))} hr ago`
  return new Date(timestamp).toLocaleString()
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return <span className={`status-badge ${enabled ? 'is-on' : 'is-off'}`}><span />{enabled ? 'Enabled' : 'Disabled'}</span>
}

function RiskBadge({ risk, known = true }: { risk: Risk; known?: boolean }) {
  return known ? <span className={`risk-badge risk-${risk.toLowerCase()}`}><span />{risk}</span> : <span className="risk-badge risk-unavailable">Not assessed</span>
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`switch ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span /></button>
}

function ProgressBar({ value, color = 'violet' }: { value: number; color?: string }) {
  return <div className={`progress-track ${color}`}><span style={{ width: `${value}%` }} /></div>
}

function App() {
  const [integrationConfig, setIntegrationConfig] = useState(getIntegrationConfig)
  const flagSource = useMemo(() => createFlagDataSource(integrationConfig), [integrationConfig])
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(integrationConfig.mode === 'demo' ? 'demo' : 'loading')
  const [integrationError, setIntegrationError] = useState('')
  const [flags, setFlags] = useState<FeatureFlag[]>(() => integrationConfig.mode === 'demo' ? readStoredFlags() : [])
  const [activity, setActivity] = useState<ActivityEntry[]>(readStoredActivity)
  const [releaseTimeline, setReleaseTimeline] = useState<ReleaseTimelineEntry[]>(readStoredReleaseTimeline)
  const [profileName, setProfileName] = useState(readProfileName)
  const [killConfirmFlag, setKillConfirmFlag] = useState<FeatureFlag | null>(null)
  const [killTargetId, setKillTargetId] = useState('')
  const [page, setPage] = useState<Page>('Overview')
  const [environment, setEnvironment] = useState<Environment>(() => integrationConfig.mode === 'live' ? integrationConfig.environment : (localStorage.getItem('flagpilot-environment') as Environment) || 'Production')
  const [query, setQuery] = useState('')
  const [flagFilter, setFlagFilter] = useState<'All flags' | 'Enabled' | 'Disabled' | 'In rollout' | 'Boolean' | 'String' | 'Number' | 'JSON'>('All flags')
  const [modalFlag, setModalFlag] = useState<FeatureFlag | null | undefined>(undefined)
  const [duplicateMode, setDuplicateMode] = useState(false)
  const [rolloutId, setRolloutId] = useState('1')
  const [monitoringFlagId, setMonitoringFlagId] = useState('')
  const [rolloutPercent, setRolloutPercent] = useState(50)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('flagpilot-notifications') !== 'off')
  const [demoScenarioId, setDemoScenarioId] = useState<DemoScenarioId | null>(() => {
    const stored = localStorage.getItem('flagpilot-demo-scenario')
    return isDemoScenarioId(stored) ? stored : null
  })
  const [tourIndex, setTourIndex] = useState<number | null>(null)
  const [tourCompleted, setTourCompleted] = useState(() => localStorage.getItem('flagpilot-tour-completed') === 'true')
  const [resetConfirmation, setResetConfirmation] = useState(false)

  useEffect(() => {
    if (flagSource.mode === 'demo') return
    let active = true
    void flagSource.initialize(
      (liveFlags) => { if (active) { setFlags(liveFlags); setIntegrationStatus('ready') } },
      (error) => { if (active) { setIntegrationError(error.message); setIntegrationStatus('error') } },
      (liveEnvironment) => { if (active) setEnvironment(liveEnvironment) },
    ).catch((error: unknown) => {
      if (active) {
        const message = error instanceof Error ? error.message : 'Flagsmith initialization failed.'
        setIntegrationError(message)
        setIntegrationStatus('error')
      }
    })
    return () => { active = false; flagSource.dispose() }
  }, [flagSource])
  useEffect(() => { if (flagSource.mode === 'demo') localStorage.setItem('flagpilot-flags', JSON.stringify(flags)) }, [flags, flagSource.mode])
  useEffect(() => { localStorage.setItem('flagpilot-activity', JSON.stringify(activity)) }, [activity])
  useEffect(() => { localStorage.setItem('flagpilot-release-timeline', JSON.stringify(releaseTimeline)) }, [releaseTimeline])
  useEffect(() => { localStorage.setItem('flagpilot-profile-name', profileName) }, [profileName])
  useEffect(() => { localStorage.setItem('flagpilot-notifications', notificationsEnabled ? 'on' : 'off') }, [notificationsEnabled])
  useEffect(() => { if (flagSource.mode === 'demo') localStorage.setItem('flagpilot-environment', environment) }, [environment, flagSource.mode])
  useEffect(() => {
    if (flagSource.mode !== 'demo') return
    if (demoScenarioId) localStorage.setItem('flagpilot-demo-scenario', demoScenarioId)
    else localStorage.removeItem('flagpilot-demo-scenario')
  }, [demoScenarioId, flagSource.mode])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const envFlags = useMemo(() => flags.filter((flag) => isConfiguredInEnvironment(flag, environment)).map((flag) => forEnvironment(flag, environment)), [flags, environment])
  const filteredFlags = useMemo(() => envFlags.filter((flag) => {
    const searchMatch = `${flag.name} ${flag.description} ${flag.key} ${flag.owner}`.toLowerCase().includes(query.toLowerCase())
    const filterMatch = flagFilter === 'All flags' || (flagFilter === 'Enabled' && flag.enabled) || (flagFilter === 'Disabled' && !flag.enabled) || (flagFilter === 'In rollout' && flag.enabled && flag.rollout > 0 && flag.rollout < 100) || flag.flagType === flagFilter
    return searchMatch && filterMatch
  }), [envFlags, flagFilter, query])
  const activeFlags = envFlags.filter((flag) => flag.enabled).length
  const inRollout = envFlags.filter((flag) => flag.enabled && flag.rollout > 0 && flag.rollout < 100).length
  const isLive = flagSource.mode === 'live'
  const highRisk = isLive ? 0 : envFlags.filter((flag) => flag.enabled && assessRelease(flag, activity).risk === 'High').length
  const displayName = profileName.trim() || 'Ankith'
  const rolloutFlags = flags.filter((flag) => isConfiguredInEnvironment(flag, environment)).map((flag) => forEnvironment(flag, environment))
  const selectedRolloutFlag = rolloutFlags.find((flag) => flag.id === rolloutId) ?? rolloutFlags[0]
  const activeDemoScenario = !isLive && demoScenarioId ? getDemoScenario(demoScenarioId) : undefined

  function showToast(message: string) { setToast(message) }
  function applyDemoScenario(id: DemoScenarioId) {
    if (isLive) {
      showToast('Demo scenarios are unavailable in Live Mode. Disconnect Flagsmith to explore simulated data.')
      return
    }
    const scenarioState = createDemoScenarioState(id)
    setFlags(scenarioState.flags)
    setActivity(scenarioState.activity)
    setReleaseTimeline(scenarioState.timeline)
    setEnvironment(scenarioState.scenario.environment)
    setRolloutId(scenarioState.scenario.flagId)
    setMonitoringFlagId(scenarioState.scenario.flagId)
    setRolloutPercent(scenarioState.scenario.rollout)
    setDemoScenarioId(id)
    showToast(`${scenarioState.scenario.name} loaded · simulated demo data`)
  }
  const tourSteps: { page: Page; title: string; description: string }[] = [
    { page: 'Overview', title: 'Release command center', description: 'Scan flag activity, environment health, rollout progress, and risk signals from one place.' },
    { page: 'Feature Flags', title: 'Manage feature flags', description: 'Inspect typed flags, environment-specific values, targeting rules, and local change history.' },
    { page: 'Rollouts', title: 'Release progressively', description: 'Preview exposure stages and simulated health metrics before advancing or rolling back.' },
    { page: 'Release Risks', title: 'Make safer release decisions', description: 'Review risk assessments and recommendations. Nothing is changed automatically.' },
    { page: 'Release Monitoring', title: 'Understand release health', description: 'Compare simulated metrics with a baseline, inspect trends, and follow related local events.' },
    { page: 'Release Risks', title: 'Use the Release Safety Agent Skill', description: 'The skill-assisted panel evaluates structured release context with a deterministic local fallback. It is not a configured AI model and never applies changes.' },
    { page: 'Settings', title: 'Configure and reset safely', description: 'Connect the protected Flagsmith backend or reset only the local demo workspace. Profile and connection preferences are preserved.' },
  ]
  function startTour() {
    setTourIndex(0)
    setPage(tourSteps[0].page)
  }
  function closeTour() {
    setTourIndex(null)
    setTourCompleted(true)
    localStorage.setItem('flagpilot-tour-completed', 'true')
  }
  function moveTour(direction: -1 | 1) {
    if (tourIndex === null) return
    const next = tourIndex + direction
    if (next < 0) return
    if (next >= tourSteps.length) {
      closeTour()
      return
    }
    setTourIndex(next)
    setPage(tourSteps[next].page)
  }
  function openMonitoring(flagId?: string) {
    const target = flagId ? flags.find((flag) => flag.id === flagId) : undefined
    const fallback = flags.find((flag) => isConfiguredInEnvironment(flag, environment) && flag.enabled) ??
      flags.find((flag) => isConfiguredInEnvironment(flag, environment))
    setMonitoringFlagId(target && isConfiguredInEnvironment(target, environment) ? target.id : fallback?.id ?? '')
    setPage('Release Monitoring')
  }
  function changeEnvironment(nextEnvironment: Environment) {
    setEnvironment(nextEnvironment)
    if (isLive) {
      if (integrationConfig.mode === 'live' && integrationConfig.environment !== nextEnvironment) {
        setFlags([])
        setIntegrationError('')
        setIntegrationStatus('loading')
        setIntegrationConfig({ ...integrationConfig, environment: nextEnvironment })
      }
      return
    }
    const nextFlags = flags.filter((flag) => isConfiguredInEnvironment(flag, nextEnvironment)).map((flag) => forEnvironment(flag, nextEnvironment))
    const nextFlag = nextFlags.find((flag) => flag.id === rolloutId) ?? nextFlags[0]
    setRolloutPercent(nextFlag ? nearestRolloutStage(nextFlag.rollout) : 0)
  }
  async function refreshFlags() {
    if (!isLive) {
      showToast('Demo workspace data is up to date')
      return
    }
    setFlags([])
    setIntegrationStatus('loading')
    try {
      await flagSource.refresh()
      setIntegrationStatus('ready')
      showToast('Flagsmith evaluations refreshed')
    } catch (error) {
      setIntegrationStatus('error')
      setIntegrationError(error instanceof Error ? error.message : 'Flagsmith refresh failed.')
    }
  }
  function connectFlagsmith(config: LiveIntegrationConfig) {
    setFlags([])
    setIntegrationError('')
    setIntegrationStatus('loading')
    setIntegrationConfig(config)
    setEnvironment(config.environment)
    setPage('Overview')
    showToast('Connecting to Flagsmith…')
  }
  function disconnectFlagsmith() {
    setIntegrationConfig({ mode: 'demo' })
    setFlags(readStoredFlags())
    setIntegrationError('')
    setIntegrationStatus('demo')
    const savedEnvironment = localStorage.getItem('flagpilot-environment') as Environment | null
    setEnvironment(savedEnvironment && environments.includes(savedEnvironment) ? savedEnvironment : 'Production')
    showToast('Disconnected · Demo Mode restored')
  }
  function recordActivity(kind: ActivityKind, title: string, detail: string, eventEnvironment: Environment, flagId?: string) {
    setActivity((current) => [{ id: crypto.randomUUID(), ...(flagId ? { flagId } : {}), title, detail: `${displayName} · ${detail}`, environment: eventEnvironment, occurredAt: new Date().toISOString(), kind }, ...current].slice(0, 100))
  }
  function recordSafetyEvents(flag: FeatureFlag, events: Omit<ReleaseTimelineEntry, 'id' | 'flagId' | 'flagName' | 'environment' | 'occurredAt'>[]) {
    const occurredAt = new Date().toISOString()
    const entries = events.map((event) => ({ ...event, id: crypto.randomUUID(), flagId: flag.id, flagName: flag.name, environment: flag.environment, occurredAt }))
    setReleaseTimeline((current) => [...entries, ...current].slice(0, 100))
    for (const entry of entries) {
      const kind = entry.kind === 'rollback' ? 'rollback' : entry.kind === 'stage' ? 'rollout' : 'safety'
      recordActivity(kind, entry.title, entry.detail, flag.environment, flag.id)
    }
  }
  function evaluateRelease(flag: FeatureFlag, assessment: ReturnType<typeof assessRelease>) {
    const previousRisk = releaseTimeline.find((entry) => entry.flagId === flag.id && entry.kind === 'risk')?.risk
    const events: Omit<ReleaseTimelineEntry, 'id' | 'flagId' | 'flagName' | 'environment' | 'occurredAt'>[] = [
      { kind: 'health', title: 'Release health evaluated', detail: `${assessment.risk} risk · score ${assessment.score}/100 · ${assessment.metrics.errorRate.toFixed(2)}% simulated errors · ${assessment.metrics.latencyMs} ms simulated latency` },
    ]
    if (previousRisk !== assessment.risk) {
      events.push({ kind: 'risk', title: previousRisk ? `Risk changed from ${previousRisk} to ${assessment.risk}` : `Risk assessed as ${assessment.risk}`, detail: `Risk score ${assessment.score}/100 · ${flag.environment} · ${flag.enabled ? `${flag.rollout}% rollout` : 'flag disabled'}`, risk: assessment.risk, previousRisk })
    }
    recordSafetyEvents(flag, events)
    showToast(`Health evaluation recorded · ${assessment.risk.toLowerCase()} risk`)
  }
  function applyReleaseDecision(flag: FeatureFlag, decision: ReleaseDecision, target: number, projected: ReturnType<typeof assessRelease>) {
    if (flagSource.readOnly) {
      showToast('Release safety actions are demo-only; live Flagsmith flags are read-only.')
      return
    }
    const changedFlag = projectRelease(flag, decision, target)
    if (decision !== 'hold') {
      setFlags((current) => current.map((item) => item.id === flag.id ? { ...changedFlag, modified: 'Just now' } : item))
    }
    const decisionTitle = decision === 'continue' ? `Rollout continued to ${target}%`
      : decision === 'reduce' ? `Rollout reduced to ${target}%`
        : decision === 'rollback' ? 'Simulated rollback completed'
          : `Rollout held at ${flag.rollout}%`
    const decisionDetail = decision === 'rollback'
      ? `Simulated rollback · ${flag.name} disabled and exposure reduced to 0%`
      : decision === 'hold'
        ? `Release decision · ${flag.name} remains at ${flag.rollout}% exposure`
        : `Release decision · ${flag.name} ${decision === 'continue' ? 'advanced' : 'reduced'} to ${target}% exposure`
    const events: Omit<ReleaseTimelineEntry, 'id' | 'flagId' | 'flagName' | 'environment' | 'occurredAt'>[] = [
      { kind: 'decision', title: decisionTitle, detail: decisionDetail },
    ]
    if (decision !== 'hold') events.push({ kind: 'stage', title: `Rollout stage set to ${changedFlag.rollout}%`, detail: changedFlag.enabled ? `${flag.name} · ${flag.environment} exposure is now ${changedFlag.rollout}%.` : `${flag.name} is disabled and no users are exposed.` })
    if (decision === 'rollback') events.push({ kind: 'rollback', title: 'Rollback event recorded', detail: 'The feature was disabled in the local demo workspace; no live system was changed.' })
    const previousRisk = releaseTimeline.find((entry) => entry.flagId === flag.id && entry.kind === 'risk')?.risk
    events.push({ kind: 'health', title: 'Post-decision health evaluated', detail: `${projected.risk} risk · score ${projected.score}/100 · ${projected.metrics.errorRate.toFixed(2)}% simulated errors · ${projected.metrics.latencyMs} ms simulated latency` })
    if (previousRisk !== projected.risk) events.push({ kind: 'risk', title: previousRisk ? `Risk changed from ${previousRisk} to ${projected.risk}` : `Risk assessed as ${projected.risk}`, detail: `Risk score ${projected.score}/100 after ${decisionTitle.toLowerCase()}.`, risk: projected.risk, previousRisk })
    recordSafetyEvents(flag, events)
    showToast(decision === 'rollback' ? `Simulated rollback completed for ${flag.name}` : decision === 'hold' ? `Rollout held at ${flag.rollout}%` : `${decision === 'continue' ? 'Rollout advanced' : 'Rollout reduced'} to ${target}%`)
  }
  function toggleFlag(flag: FeatureFlag) {
    if (flagSource.readOnly) {
      showToast('Live Flagsmith flags are read-only; remote changes are not exposed by this backend.')
      return
    }
    const nextEnabled = !flag.enabled
    if (flag.enabled) {
      setKillConfirmFlag(flag)
      return
    }
    setFlags((current) => current.map((item) => item.id === flag.id ? { ...withEnvironmentConfig(item, flag.environment, { ...getEnvironmentConfig(item, flag.environment), enabled: nextEnabled }), modified: 'Just now' } : item))
    recordActivity('flag', `${flag.name} enabled`, `Feature flag enabled · ${flag.name}`, flag.environment, flag.id)
    showToast(nextEnabled ? `${flag.name} enabled in ${flag.environment}` : `Kill switch activated — ${flag.name} is off`)
  }
  function confirmKillSwitch() {
    if (!killConfirmFlag) return
    if (flagSource.readOnly) {
      setKillConfirmFlag(null)
      showToast('Live Flagsmith flags are read-only; the backend does not expose a remote kill-switch operation.')
      return
    }
    const flag = killConfirmFlag
    setFlags((current) => current.map((item) => item.id === flag.id ? { ...withEnvironmentConfig(item, flag.environment, { ...getEnvironmentConfig(item, flag.environment), enabled: false }), modified: 'Just now' } : item))
    recordActivity('kill', `Kill switch activated for ${flag.name}`, `Emergency disable · ${flag.name}`, flag.environment, flag.id)
    setKillConfirmFlag(null)
    showToast(`Kill switch activated — ${flag.name} is off`)
  }
  function saveFlag(value: FeatureFlag) {
    if (flagSource.readOnly) {
      showToast('Live Flagsmith flags are read-only; the backend does not expose remote flag-management operations.')
      return
    }
    const previous = flags.find((item) => item.id === value.id)
    const editing = Boolean(previous)
    const savedFlag = { ...value, id: editing ? value.id : crypto.randomUUID(), modified: 'Just now' }
    setFlags((current) => current.some((item) => item.id === savedFlag.id)
      ? current.map((item) => item.id === savedFlag.id ? savedFlag : item)
      : [{ ...savedFlag, owner: displayName }, ...current])
    const auditEntry = createFlagAuditEntry(savedFlag, previous, displayName)
    setActivity((current) => [auditEntry, ...current].slice(0, 100))
    setModalFlag(undefined)
    setDuplicateMode(false)
    showToast(editing ? 'Feature flag updated' : 'Feature flag created')
  }
  function duplicateFlag(flag: FeatureFlag) {
    let suffix = 1
    let key = `${flag.key}_copy`
    while (flags.some((item) => item.key === key)) {
      suffix += 1
      key = `${flag.key}_copy_${suffix}`
    }
    const duplicate: FeatureFlag = {
      ...flag,
      id: '',
      name: `${flag.name} copy`,
      key,
      environmentConfigs: Object.fromEntries(environments.filter((env) => isConfiguredInEnvironment(flag, env)).map((env) => {
        const config = getEnvironmentConfig(flag, env)
        return [env, { ...config, rules: config.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })) }]
      })),
      targetingRules: flag.targetingRules?.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
      modified: 'Just now',
    }
    setModalFlag(duplicate)
    setDuplicateMode(true)
  }
  function applyRollout(value = rolloutPercent) {
    if (!selectedRolloutFlag) return
    if (flagSource.readOnly) {
      showToast('Rollout changes are simulated only; the backend exposes read-only Flagsmith evaluations.')
      return
    }
    const changedFlag = withEnvironmentConfig(selectedRolloutFlag, selectedRolloutFlag.environment, {
      ...getEnvironmentConfig(selectedRolloutFlag, selectedRolloutFlag.environment),
      rollout: value,
      enabled: value > 0,
    })
    setFlags((current) => current.map((item) => item.id === selectedRolloutFlag.id ? { ...changedFlag, modified: 'Just now' } : item))
    const assessment = assessRelease(changedFlag, activity)
    const previousRisk = releaseTimeline.find((entry) => entry.flagId === selectedRolloutFlag.id && entry.kind === 'risk')?.risk
    const events: Omit<ReleaseTimelineEntry, 'id' | 'flagId' | 'flagName' | 'environment' | 'occurredAt'>[] = [
      { kind: 'stage', title: `Rollout stage set to ${value}%`, detail: `${selectedRolloutFlag.name} · ${selectedRolloutFlag.environment} simulated exposure is now ${value}%.` },
      { kind: 'health', title: 'Simulated rollout health evaluated', detail: `${assessment.risk} risk · ${assessment.metrics.errorRate.toFixed(2)}% simulated errors · ${assessment.metrics.latencyMs} ms simulated latency.` },
    ]
    if (previousRisk !== assessment.risk) events.push({ kind: 'risk', title: previousRisk ? `Risk changed from ${previousRisk} to ${assessment.risk}` : `Risk assessed as ${assessment.risk}`, detail: `Risk score ${assessment.score}/100 after applying ${value}% simulated exposure.`, risk: assessment.risk, previousRisk })
    recordSafetyEvents(selectedRolloutFlag, events)
    showToast(`Simulated rollout updated to ${value}% for ${selectedRolloutFlag.name}`)
  }
  function rollbackRollout() {
    if (!selectedRolloutFlag) return
    if (flagSource.readOnly) {
      showToast('Live Flagsmith flags are read-only; rollback is available in Demo Mode only.')
      return
    }
    const rolledBackFlag = withEnvironmentConfig(selectedRolloutFlag, selectedRolloutFlag.environment, {
      ...getEnvironmentConfig(selectedRolloutFlag, selectedRolloutFlag.environment),
      enabled: false,
      rollout: 0,
    })
    setFlags((current) => current.map((item) => item.id === selectedRolloutFlag.id ? { ...rolledBackFlag, modified: 'Just now' } : item))
    setRolloutPercent(0)
    const assessment = assessRelease(rolledBackFlag, activity)
    const previousRisk = releaseTimeline.find((entry) => entry.flagId === selectedRolloutFlag.id && entry.kind === 'risk')?.risk
    const events: Omit<ReleaseTimelineEntry, 'id' | 'flagId' | 'flagName' | 'environment' | 'occurredAt'>[] = [
      { kind: 'decision', title: 'Simulated rollout rollback confirmed', detail: `${selectedRolloutFlag.name} · ${selectedRolloutFlag.environment} exposure reset from ${selectedRolloutFlag.rollout}% to 0%.` },
      { kind: 'rollback', title: `${selectedRolloutFlag.name} rolled back to 0%`, detail: 'Feature disabled in the local demo workspace. No live system was changed.' },
      { kind: 'stage', title: 'Rollout stage set to 0%', detail: `${selectedRolloutFlag.name} is disabled; simulated exposure is now 0%.` },
      { kind: 'health', title: 'Post-rollback health evaluated', detail: `${assessment.risk} risk · ${assessment.metrics.errorRate.toFixed(2)}% simulated errors · ${assessment.metrics.latencyMs} ms simulated latency.` },
    ]
    if (previousRisk !== assessment.risk) events.push({ kind: 'risk', title: previousRisk ? `Risk changed from ${previousRisk} to ${assessment.risk}` : `Risk assessed as ${assessment.risk}`, detail: `Risk score ${assessment.score}/100 after simulated rollback.`, risk: assessment.risk, previousRisk })
    recordSafetyEvents(selectedRolloutFlag, events)
    showToast(`${selectedRolloutFlag.name} rolled back to 0% in the demo workspace`)
  }
  function resetWorkspace() {
    if (!flagSource.readOnly) {
      setFlags(initialFlags.map(normalizeFlag))
      setEnvironment('Production')
    }
    localStorage.removeItem('flagpilot-flags')
    localStorage.removeItem('flagpilot-environment')
    localStorage.removeItem('flagpilot-experiments')
    localStorage.removeItem('flagpilot-activity')
    localStorage.removeItem('flagpilot-release-timeline')
    localStorage.removeItem('flagpilot-demo-scenario')
    setActivity(initialActivity)
    setReleaseTimeline([])
    setDemoScenarioId(null)
    setResetConfirmation(false)
    showToast(flagSource.readOnly
      ? 'Local demo history reset. Live Flagsmith data and settings were not changed.'
      : 'Demo workspace restored. Your profile and preferences were preserved.')
  }

  return (
    <div className="app-shell">
      {mobileNav && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row"><div className="brand-mark"><Command size={17} strokeWidth={2.5} /></div><span className="brand-name">flagpilot</span><span className="brand-tag">BETA</span><button className="sidebar-collapse" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={16} /></button></div>
        <button className="workspace-switch" onClick={() => setProfileOpen(!profileOpen)}><span className="workspace-glyph">F</span><span className="workspace-text"><b>FlagForge</b><small>Pro workspace</small></span><ChevronDown size={15} /></button>
        <div className="nav-scroll">
          {navItems.map(({ label, icon: Icon, section }) => <div key={label}>
            {section && <div className="nav-section">{section}</div>}
            <button className={`nav-item ${page === label ? 'nav-active' : ''}`} onClick={() => { setPage(label); setMobileNav(false); setQuery(''); if (label === 'Release Monitoring') openMonitoring() }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Release Risks' && highRisk > 0 && <span className="nav-count">{highRisk}</span>}{label === 'Feature Flags' && <span className="nav-count muted">{envFlags.length}</span>}</button>
          </div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="usage-card"><div className="usage-title"><span>Monthly evaluations</span><span>72%</span></div><ProgressBar value={72} /><small>7.2M <span>of 10M events</span></small><button onClick={() => { setPage('Settings'); setMobileNav(false) }}>View usage <ArrowRight size={12} /></button></div>
          <button className="help-link" onClick={startTour}><Compass size={16} />{tourCompleted ? 'Replay product tour' : 'Take product tour'}<ExternalLink size={13} /></button>
          <button className="profile-card" onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{getInitials(displayName)}</span><span className="profile-info"><b>{displayName}</b><small>Admin</small></span><MoreHorizontal size={17} /></button>
          {profileOpen && <div className="profile-menu"><b>{displayName}</b><span>Workspace admin</span><button onClick={() => { setPage('Settings'); setProfileOpen(false) }}>Account settings</button></div>}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>FlagForge</span><ChevronRight size={14} /><b>{page}</b></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setPage('Feature Flags') }} placeholder="Search anything..." /><kbd>⌘ K</kbd></label>
            <div className="top-divider" />
            <span className={`integration-mode ${!isLive ? 'mode-demo' : integrationStatus === 'ready' ? 'mode-live' : integrationStatus === 'error' ? 'mode-error' : 'mode-loading'}`}><i />{isLive ? integrationStatus === 'ready' ? 'Flagsmith connected' : integrationStatus === 'error' ? 'Flagsmith error' : 'Connecting' : 'Demo Mode'}</span>
            <label className="env-select" title={isLive ? 'Switch to an environment mapped to a server-side Flagsmith key.' : undefined}><span className={`env-dot ${environment.toLowerCase()}`} /><select value={environment} onChange={(event) => changeEnvironment(event.target.value as Environment)} aria-label="Select environment">{environments.map((env) => <option key={env}>{env}</option>)}</select><ChevronDown size={14} /></label>
            <div className="popover-wrap"><button className={`icon-button ${notificationsOpen ? 'selected' : ''}`} aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={17} /><i /></button>{notificationsOpen && <div className="notification-popover"><div className="popover-heading">Notifications <span>2 new</span></div><p><span className="notice-dot" />Checkout v2 passed its health check <small>14 min ago</small></p><p><span className="notice-dot amber-dot" />Instant payouts is marked high risk <small>1 hour ago</small></p><button onClick={() => { setPage('Release Risks'); setNotificationsOpen(false) }}>View release risks <ArrowRight size={13} /></button></div>}</div>
            <button className="top-avatar" onClick={() => setProfileOpen(!profileOpen)} aria-label={`Open ${displayName} profile`}>{getInitials(displayName)}</button>
          </div>
        </header>

        <div className="page-content">
          <IntegrationNotice mode={flagSource.mode} status={integrationStatus} error={integrationError} />
          {page === 'Overview' && <OverviewPage flags={flags} envFlags={envFlags} environment={environment} activeFlags={activeFlags} inRollout={inRollout} highRisk={highRisk} profileName={displayName} activity={activity} readOnly={flagSource.readOnly} scenario={activeDemoScenario} scenarioId={demoScenarioId} onScenarioSelect={applyDemoScenario} onStartTour={startTour} onRefresh={refreshFlags} onNavigate={setPage} onMonitor={openMonitoring} onToggle={toggleFlag} onEdit={(flag) => setModalFlag(flags.find((item) => item.id === flag.id) ?? flag)} onToast={showToast} />}
          {page === 'Feature Flags' && <FlagsPage flags={filteredFlags} total={envFlags.length} environment={environment} readOnly={flagSource.readOnly} query={query} setQuery={setQuery} filter={flagFilter} setFilter={setFlagFilter} onNew={() => flagSource.readOnly ? showToast('Remote flag creation is not exposed by this read-only backend.') : setModalFlag(null)} onEdit={(flag) => setModalFlag(flags.find((item) => item.id === flag.id) ?? flag)} onToggle={toggleFlag} onToast={showToast} />}
          {page === 'Rollouts' && <RolloutPage flags={rolloutFlags} environment={environment} readOnly={flagSource.readOnly} selected={selectedRolloutFlag?.id ?? ''} setSelected={(id) => { setRolloutId(id); const flag = rolloutFlags.find((item) => item.id === id); if (flag) setRolloutPercent(nearestRolloutStage(flag.rollout)) }} selectedFlag={selectedRolloutFlag} percent={rolloutPercent} setPercent={setRolloutPercent} apply={applyRollout} onRollback={rollbackRollout} onMonitor={() => openMonitoring(selectedRolloutFlag?.id)} />}
          {page === 'Release Monitoring' && <ReleaseMonitoringPage flags={rolloutFlags} environment={environment} activity={activity} timeline={releaseTimeline} readOnly={flagSource.readOnly} selectedFlagId={monitoringFlagId} scenarioPattern={activeDemoScenario?.monitoringPattern} onSelectFlag={setMonitoringFlagId} onNavigate={setPage} />}
          {page === 'Experiments' && <ExperimentsPage profileName={displayName} onToast={showToast} />}
          {page === 'Environments' && <EnvironmentsPage environment={environment} setEnvironment={changeEnvironment} flags={flags} readOnly={flagSource.readOnly} onToast={showToast} />}
          {page === 'Release Risks' && <ReleaseSafetyPage flags={envFlags} environment={environment} activity={activity} timeline={releaseTimeline} readOnly={flagSource.readOnly} selectedFlagId={activeDemoScenario?.flagId} onEvaluate={evaluateRelease} onDecision={applyReleaseDecision} />}
          {page === 'Kill Switch' && <KillSwitchPage flags={flags} readOnly={flagSource.readOnly} selectedId={killTargetId} setSelectedId={setKillTargetId} onRequestKill={toggleFlag} />}
          {page === 'Activity Log' && <ActivityLogPage activity={activity} mode={flagSource.mode} />}
          {page === 'Settings' && <SettingsPage environment={environment} setEnvironment={changeEnvironment} readOnly={flagSource.readOnly} profileName={profileName} setProfileName={setProfileName} notificationsEnabled={notificationsEnabled} setNotificationsEnabled={setNotificationsEnabled} reset={() => setResetConfirmation(true)} onStartTour={startTour} onToast={showToast} integrationConfig={integrationConfig} integrationStatus={integrationStatus} integrationError={integrationError} onConnect={connectFlagsmith} onDisconnect={disconnectFlagsmith} onRefresh={refreshFlags} />}
        </div>
      </main>
      {modalFlag !== undefined && !flagSource.readOnly && <FlagEditorModal key={`${modalFlag?.id ?? 'new'}:${duplicateMode ? 'duplicate' : 'edit'}`} flag={modalFlag} existingFlags={flags} environment={environment} owner={displayName} activity={activity} isDuplicate={duplicateMode} onClose={() => { setModalFlag(undefined); setDuplicateMode(false) }} onSave={saveFlag} onDuplicate={duplicateFlag} />}
      {killConfirmFlag && <KillConfirmModal flag={killConfirmFlag} onCancel={() => setKillConfirmFlag(null)} onConfirm={confirmKillSwitch} />}
      {tourIndex !== null && <ProductTourStep index={tourIndex} total={tourSteps.length} step={tourSteps[tourIndex]} onPrevious={() => moveTour(-1)} onNext={() => moveTour(1)} onClose={closeTour} />}
      {resetConfirmation && <ResetDemoConfirmation readOnly={flagSource.readOnly} onCancel={() => setResetConfirmation(false)} onConfirm={resetWorkspace} />}
      {toast && <div className="toast"><span className="toast-check"><Check size={14} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>
}

function IntegrationNotice({ mode, status, error }: { mode: IntegrationConfig['mode']; status: IntegrationStatus; error: string }) {
  if (mode === 'demo') return <div className="integration-notice demo-notice"><span className="integration-notice-icon"><Sparkles size={14} /></span><div><b>Demo Mode</b><span>Sample flags and local changes are stored in this browser. No Flagsmith connection is configured.</span></div></div>
  if (status === 'loading') return <div className="integration-notice loading-notice"><span className="integration-spinner" /><div><b>Connecting to Flagsmith</b><span>Verifying the backend configuration and loading evaluated flags.</span></div></div>
  if (status === 'error') return <div className="integration-notice error-notice"><span className="integration-notice-icon"><AlertTriangle size={14} /></span><div><b>Flagsmith evaluation failed</b><span>{error || 'Check the backend configuration and network, then retry.'} No demo data is being shown as live data.</span></div></div>
  return <div className="integration-notice live-notice"><span className="integration-notice-icon"><ShieldCheck size={14} /></span><div><b>Live Flagsmith · read-only evaluation</b><span>Flags are evaluated by the official SDK in the backend. Mutations, rollout percentages, experiments, and activity history remain local/demo-only.</span></div></div>
}

function OverviewPage({ flags, envFlags, environment, activeFlags, inRollout, highRisk, profileName, activity, readOnly, scenario, scenarioId, onScenarioSelect, onStartTour, onRefresh, onNavigate, onMonitor, onToggle, onEdit, onToast }: {
  flags: FeatureFlag[]; envFlags: FeatureFlag[]; environment: Environment; activeFlags: number; inRollout: number; highRisk: number
  profileName: string; activity: ActivityEntry[]; readOnly: boolean; onRefresh: () => void
  scenario?: ReturnType<typeof getDemoScenario>; scenarioId: DemoScenarioId | null
  onScenarioSelect: (id: DemoScenarioId) => void; onStartTour: () => void
  onNavigate: (page: Page) => void; onMonitor: (flagId?: string) => void; onToggle: (flag: FeatureFlag) => void; onEdit: (flag: FeatureFlag) => void; onToast: (message: string) => void
}) {
  const [notice, setNotice] = useState(true)
  const [range, setRange] = useState('Last 7 days')
  const [greeting, setGreeting] = useState(getTimeGreeting)
  useEffect(() => {
    const updateGreeting = () => setGreeting(getTimeGreeting())
    const timer = window.setInterval(updateGreeting, 30_000)
    window.addEventListener('focus', updateGreeting)
    document.addEventListener('visibilitychange', updateGreeting)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateGreeting)
      document.removeEventListener('visibilitychange', updateGreeting)
    }
  }, [])
  const safetyFlag = (scenario && envFlags.find((flag) => flag.id === scenario.flagId)) ?? envFlags.find((flag) => flag.enabled && flag.rollout > 0) ?? envFlags[0]
  const safetyAssessment = !readOnly && safetyFlag ? assessRelease(safetyFlag, activity) : null
  const activeFlag = envFlags.find((flag) => flag.enabled)
  const rolloutFlag = envFlags.find((flag) => flag.enabled && flag.rollout > 0 && flag.rollout < 100)
  const highRiskFlag = envFlags.find((flag) => flag.enabled && assessRelease(flag, activity).risk === 'High')
  const stats = [
    { title: 'Total feature flags', value: flags.length.toString(), change: readOnly ? 'Evaluated by Flagsmith' : '+3 this week', icon: Flag, tone: 'violet', trend: 'up', flagId: envFlags[0]?.id },
    { title: 'Active flags', value: activeFlags.toString(), change: `${Math.round(activeFlags / Math.max(envFlags.length, 1) * 100)}% enabled evaluation`, icon: Bolt, tone: 'green', trend: 'up', flagId: activeFlag?.id },
    { title: 'Flags in rollout', value: readOnly ? '—' : inRollout.toString(), change: readOnly ? 'Not exposed by evaluation' : 'Across active releases', icon: GitBranch, tone: 'blue', trend: 'steady', flagId: rolloutFlag?.id },
    { title: 'High-risk releases', value: readOnly ? '—' : highRisk.toString().padStart(2, '0'), change: readOnly ? 'Risk signals unavailable' : highRisk ? 'Needs your attention' : 'Everything looks good', icon: ShieldAlert, tone: readOnly ? 'blue' : highRisk ? 'amber' : 'green', trend: highRisk ? 'down' : 'up', flagId: highRiskFlag?.id ?? safetyFlag?.id },
  ]
  return <>
    {notice && <div className="welcome-banner"><div className="welcome-orb"><Sparkles size={16} /></div><div><b>Your releases, under control.</b><span>Monitor rollouts, catch risks early, and ship with confidence.</span></div><button onClick={() => { onNavigate('Rollouts'); }} className="banner-link">Explore rollouts <ArrowRight size={14} /></button><button className="banner-close" onClick={() => setNotice(false)} aria-label="Dismiss welcome message"><X size={15} /></button></div>}
    <PageHeading eyebrow={`${environment.toUpperCase()} ENVIRONMENT`} title={`${greeting}, ${profileName}`} description="Here's what's happening across your releases today." action={<><button className="button button-quiet" onClick={onRefresh}><Activity size={15} />Refresh</button><button className="button button-primary" disabled={readOnly} onClick={() => onNavigate('Feature Flags')}><Plus size={16} />Create a flag</button></>} />
    <section className="panel demo-showcase">
      <div className="demo-showcase-intro"><span className="demo-showcase-icon"><Compass size={17} /></span><div><b>FlagPilot release command center</b><span>Explore safe progressive releases, monitoring, and release-risk analysis in one local demo.</span></div></div>
      <div className="demo-showcase-actions">
        {readOnly ? <span className="demo-live-note"><LockKeyhole size={14} />Scenarios are disabled in Live Mode</span> : <label className="demo-scenario-select"><span>Demo scenario</span><select value={scenarioId ?? ''} onChange={(event) => { if (isDemoScenarioId(event.target.value)) onScenarioSelect(event.target.value) }} aria-label="Choose a simulated demo scenario"><option value="">Choose a release scenario</option>{demoScenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <button className="button button-quiet" onClick={onStartTour}><Compass size={15} />{scenario ? 'Explore product' : 'Take product tour'}</button>
      </div>
      {scenario && <div className="demo-scenario-summary"><span className="simulation-tag"><span />SIMULATED SCENARIO</span><b>{scenario.name}</b><span>{scenario.summary}</span><button className="text-button" onClick={() => onMonitor(scenario.flagId)}>Open monitoring <ArrowRight size={13} /></button></div>}
    </section>
    <div className="stats-grid">{stats.map(({ title, value, change, icon: Icon, tone, trend, flagId }) => <button type="button" className="stat-card stat-card-action" key={title} onClick={() => onMonitor(flagId)} aria-label={`${title}: ${value}. Open release monitoring`}><div className="stat-top"><span>{title}</span><span className={`stat-icon ${tone}`}><Icon size={16} /></span></div><div className="stat-value">{value}</div><div className={`stat-change ${tone}`}><span>{trend === 'down' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{change}</span>{title === 'Total feature flags' && <span className="change-period">vs last week</span>}</div></button>)}</div>
    <button className="panel safety-overview-card" onClick={() => onNavigate('Release Risks')}>
      <span className={`safety-overview-icon ${safetyAssessment ? `safety-overview-${safetyAssessment.risk.toLowerCase()}` : ''}`}><ShieldAlert size={18} /></span>
      <span className="safety-overview-copy"><small>RELEASE SAFETY INTELLIGENCE · {readOnly ? 'LIVE SIGNALS UNAVAILABLE' : 'SIMULATED'}</small><b>{readOnly ? 'Risk signals are unavailable for live Flagsmith evaluations' : safetyFlag ? `${safetyAssessment?.risk} risk · ${safetyFlag.name}` : `No flags in ${environment}`}</b><span>{readOnly ? 'The backend evaluation endpoint does not provide deployment health or rollout history.' : safetyAssessment ? safetyAssessment.recommendation.reason : 'Create a feature flag to start an assessment.'}</span></span>
      {safetyAssessment && <span className="safety-overview-score"><b>{safetyAssessment.score}</b><small>/100</small></span>}
      <span className="safety-overview-link">Open assessment <ArrowRight size={14} /></span>
    </button>
    <div className="overview-grid">
      <section className="panel activity-chart-panel">
        <div className="panel-heading"><div><h2>{readOnly ? 'Demo deployment activity' : 'Deployment activity'}</h2><p>{readOnly ? 'Illustrative sample chart · not Flagsmith telemetry' : 'Flag updates and rollouts over time'}</p></div><div className="dashboard-chart-actions"><select className="small-select" value={range} onChange={(event) => setRange(event.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select><button className="text-button" onClick={() => onMonitor(safetyFlag?.id)}>Detailed monitoring <ArrowRight size={13} /></button></div></div>
        <div className="chart-legend"><span><i className="legend-dot violet-dot" />Deployments</span><span><i className="legend-dot soft-dot" />Rollouts</span></div>
        <div className="chart-wrap"><div className="chart-y-labels"><span>20</span><span>15</span><span>10</span><span>5</span><span>0</span></div><svg className="activity-chart" viewBox="0 0 640 190" preserveAspectRatio="none" role="img" aria-label={`Deployment activity for ${range}`}><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b6bff" stopOpacity=".22" /><stop offset="100%" stopColor="#8b6bff" stopOpacity="0" /></linearGradient></defs><path className="chart-gridline" d="M0 10H640M0 52H640M0 94H640M0 136H640M0 178H640" /><path d="M0 152 C30 148 36 120 67 128 S105 144 135 111 S177 119 202 99 S243 115 270 91 S309 100 337 74 S375 89 405 62 S445 80 473 56 S510 69 540 38 S578 66 604 30 S624 42 640 20 L640 178 L0 178Z" fill="url(#chartFill)" /><path d="M0 152 C30 148 36 120 67 128 S105 144 135 111 S177 119 202 99 S243 115 270 91 S309 100 337 74 S375 89 405 62 S445 80 473 56 S510 69 540 38 S578 66 604 30 S624 42 640 20" fill="none" stroke="#9275ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><path d="M0 164 C38 160 50 146 84 152 S122 165 153 145 S190 151 220 132 S257 146 286 121 S323 130 354 114 S387 129 419 102 S455 119 484 92 S518 106 550 80 S586 104 612 67 S628 80 640 61" fill="none" stroke="#c7b9ff" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" /><circle cx="540" cy="38" r="4" fill="#9e85ff" stroke="#211b34" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg></div>
        <div className="chart-x-labels">{['May 20', 'May 21', 'May 22', 'May 23', 'May 24', 'May 25', 'May 26'].map((day) => <span key={day}>{day}</span>)}</div>
      </section>
      <section className="panel env-overview">
        <div className="panel-heading"><div><h2>Environments</h2><p>Release health at a glance</p></div><button className="text-button" onClick={() => onNavigate('Environments')}>Manage <ArrowRight size={13} /></button></div>
        {(readOnly ? [environment] : environments).map((env) => {
          const envList = flags.filter((flag) => isConfiguredInEnvironment(flag, env)).map((flag) => forEnvironment(flag, env))
          const enabled = envList.filter((flag) => flag.enabled).length
          const health = readOnly ? 'Evaluated' : env === 'Production' ? 'Healthy' : env === 'Staging' ? 'Stable' : 'Healthy'
          return <button className={`env-row ${environment === env ? 'env-row-current' : ''}`} key={env} onClick={() => onNavigate('Environments')}><span className={`env-indicator ${env.toLowerCase()}`}><Code2 size={15} /></span><span className="env-row-info"><b>{env}</b><small>{enabled} of {envList.length} flags enabled</small></span><span className="health-label"><i />{health}</span><ChevronRight size={14} /></button>
        })}
        <div className="env-foot"><span>Current context</span><b><span className={`env-dot ${environment.toLowerCase()}`} />{environment}</b></div>
      </section>
    </div>
    <div className="overview-grid lower-grid">
      <section className="panel flags-panel"><div className="panel-heading"><div><h2>Feature flags</h2><p>Recently updated in {environment}</p></div><button className="text-button" onClick={() => onNavigate('Feature Flags')}>View all flags <ArrowRight size={13} /></button></div>
        <FlagTable flags={envFlags.slice(0, 4)} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} onToast={onToast} compact />
      </section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>{readOnly ? 'Local demo history · not from Flagsmith' : 'Latest changes from your team'}</p></div><button className="text-button" onClick={() => onNavigate('Activity Log')}>View log <ArrowRight size={13} /></button></div>
        <ActivityList entries={activity.slice(0, 4)} /><button className="activity-footer" onClick={() => onNavigate('Activity Log')}>View all activity <ArrowRight size={13} /></button>
      </section>
    </div>
  </>
}

function FlagTable({ flags, onToggle, onEdit, onToast, compact = false, readOnly = false, emptyMessage }: { flags: FeatureFlag[]; onToggle: (flag: FeatureFlag) => void; onEdit: (flag: FeatureFlag) => void; onToast: (message: string) => void; compact?: boolean; readOnly?: boolean; emptyMessage?: { title: string; description: string } }) {
  if (flags.length === 0) return <div className="empty-state"><Flag size={20} /><b>{emptyMessage?.title ?? 'No flags found'}</b><span>{emptyMessage?.description ?? 'Try changing the environment or your search.'}</span></div>
  return <div className="table-scroll"><table className={compact ? 'compact-table' : ''}><thead><tr><th>FEATURE FLAG</th><th>TYPE</th><th>STATUS</th><th>ROLLOUT</th>{!compact && <th>ENVIRONMENTS</th>}<th>LAST MODIFIED</th><th /></tr></thead><tbody>{flags.map((flag) => <tr key={`${flag.id}-${flag.environment}`}><td><button className="flag-name-cell" disabled={readOnly} onClick={() => onEdit(flag)}><span className={`flag-symbol ${flag.enabled ? 'enabled' : ''}`}><Flag size={15} /></span><span><b>{flag.name}</b><small>{flag.key}</small><small className="flag-row-description">{flag.description || 'No description provided'}</small></span></button></td><td><span className={`flag-type-badge type-${(flag.flagType ?? 'Boolean').toLowerCase()}`}>{flag.flagType ?? 'Boolean'}</span></td><td><StatusBadge enabled={flag.enabled} /></td><td><div className="rollout-cell"><ProgressBar value={flag.enabled && flag.rolloutKnown !== false ? flag.rollout : 0} /><span>{flag.rolloutKnown === false ? '—' : `${flag.enabled ? flag.rollout : 0}%`}</span></div></td>{!compact && <td><div className="flag-env-states">{environments.map((env) => { const config = getEnvironmentConfig(flag, env); const evaluated = readOnly && flag.environment === env; const known = readOnly ? evaluated : isConfiguredInEnvironment(flag, env); const enabled = evaluated ? flag.enabled : config.enabled; const unknownLabel = readOnly ? 'not evaluated by the configured key' : 'not configured'; return <span key={env} title={known ? `${env}: ${enabled ? readOnly ? 'Enabled by Flagsmith evaluation' : `Enabled · ${config.rollout}% rollout` : 'Disabled'}` : `${env}: ${unknownLabel}`} className={known ? enabled ? 'env-state-on' : 'env-state-off' : 'env-state-unknown'}><i className={`env-dot ${env.toLowerCase()}`} />{env === 'Development' ? 'DEV' : env === 'Staging' ? 'STG' : 'PROD'}<small>{!known ? '—' : readOnly ? enabled ? 'on' : 'off' : enabled ? `${config.rollout}%` : 'off'}</small></span> })}</div></td>}<td className="modified-cell">{flag.modified}</td><td><div className="row-actions"><button disabled={readOnly} title={readOnly ? 'Live flags are read-only through the backend' : flag.enabled ? 'Emergency kill switch' : 'Enable feature flag'} aria-label={flag.enabled ? `Disable ${flag.name}` : `Enable ${flag.name}`} className={`quick-toggle ${flag.enabled ? 'quick-on' : ''}`} onClick={() => onToggle(flag)}><ToggleLeft size={16} /></button><button disabled={readOnly} title={readOnly ? 'Flag management is not exposed by the read-only backend' : 'Inspect flag details'} aria-label={`Edit ${flag.name}`} className="row-more" onClick={() => onEdit(flag)}><MoreHorizontal size={17} /></button><button title="Copy flag key" aria-label={`Copy key for ${flag.name}`} className="row-more" onClick={() => { void navigator.clipboard?.writeText(flag.key); onToast(`Copied ${flag.key}`) }}><Copy size={14} /></button></div></td></tr>)}</tbody></table></div>
}

function FlagsPage({ flags, total, environment, readOnly, query, setQuery, filter, setFilter, onNew, onEdit, onToggle, onToast }: {
  flags: FeatureFlag[]; total: number; environment: Environment; query: string; setQuery: (value: string) => void
  readOnly: boolean
  filter: 'All flags' | 'Enabled' | 'Disabled' | 'In rollout' | 'Boolean' | 'String' | 'Number' | 'JSON'; setFilter: (value: 'All flags' | 'Enabled' | 'Disabled' | 'In rollout' | 'Boolean' | 'String' | 'Number' | 'JSON') => void
  onNew: () => void; onEdit: (flag: FeatureFlag) => void; onToggle: (flag: FeatureFlag) => void; onToast: (message: string) => void
}) {
  return <><PageHeading eyebrow="RELEASE MANAGEMENT" title="Feature flags" description={readOnly ? 'Live Flagsmith evaluations are read-only through the backend.' : 'Manage typed feature controls and configure releases by environment.'} action={<button className="button button-primary" disabled={readOnly} onClick={onNew}><Plus size={16} />Create flag</button>} />
    <div className="flag-management-summary"><div><span className="flag-summary-icon"><Flag size={15} /></span><span><b>{total} configured flags</b><small>Environment · {environment}</small></span></div><div><span className="flag-summary-stat"><b>{flags.filter((flag) => flag.enabled).length}</b><small>enabled</small></span><i /><span className="flag-summary-stat"><b>{readOnly ? '—' : flags.filter((flag) => flag.enabled && flag.rollout > 0 && flag.rollout < 100).length}</b><small>{readOnly ? 'rollout data' : 'in rollout'}</small></span><i /><span className="flag-summary-stat"><b>{new Set(flags.map((flag) => flag.flagType)).size}</b><small>flag types</small></span></div></div>
    <section className="panel flag-directory"><div className="directory-top"><div className="directory-title"><div className="count-bubble">{flags.length}</div><div><b>Feature flag registry</b><span>{flags.length} flags configured in {environment}</span></div></div><div className="directory-controls"><label className="table-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flags..." /></label><label className="filter-select"><SlidersHorizontal size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter feature flags"><option>All flags</option><option>Enabled</option><option>Disabled</option><option>In rollout</option><option disabled>──────────</option><option>Boolean</option><option>String</option><option>Number</option><option>JSON</option></select><ChevronDown size={13} /></label><button className="icon-button outlined" aria-label="More flag actions" onClick={() => onToast('Flag configurations are saved automatically in this browser')}><Ellipsis size={17} /></button></div></div>
      <FlagTable flags={flags} readOnly={readOnly} onToggle={onToggle} onEdit={onEdit} onToast={onToast} emptyMessage={readOnly && total === 0 ? { title: 'No Flagsmith flags in this environment', description: `The connection was verified, but ${environment} returned no evaluated feature flags.` } : undefined} />
      <div className="table-footer"><span>Showing <b>{flags.length}</b> of <b>{total}</b> flags</span><div><button disabled aria-label="Previous page"><ChevronLeft size={15} /></button><button className="page-number">1</button><button disabled aria-label="Next page"><ChevronRight size={15} /></button></div></div>
    </section>
    <div className="kill-switch-note"><span className="kill-icon"><AlertOctagon size={17} /></span><div><b>Need to stop a release?</b><span>Use the kill switch <ToggleLeft size={13} /> beside any flag to disable it immediately.</span></div><ShieldCheck size={17} className="note-shield" /></div>
  </>
}

function RolloutPage({ flags, environment, readOnly, selected, setSelected, selectedFlag, percent, setPercent, apply, onRollback, onMonitor }: {
  flags: FeatureFlag[]; environment: Environment; selected: string; setSelected: (id: string) => void; selectedFlag?: FeatureFlag
  readOnly: boolean
  percent: number; setPercent: (value: number) => void; apply: (value?: number) => void; onRollback: () => void; onMonitor: () => void
}) {
  const [errorThreshold, setErrorThreshold] = useState(1.2)
  const [latencyThreshold, setLatencyThreshold] = useState(320)
  const [rollbackConfirmation, setRollbackConfirmation] = useState(false)
  const stageIndex = rolloutStages.indexOf(nearestRolloutStage(percent) as typeof rolloutStages[number])
  const metrics = selectedFlag ? simulateRolloutMetrics(selectedFlag, environment, percent, errorThreshold, latencyThreshold) : undefined
  const comparisons = selectedFlag ? rolloutStages.map((stage) => simulateRolloutMetrics(selectedFlag, environment, stage, errorThreshold, latencyThreshold)) : []
  const nextStage = rolloutStages.find((stage) => stage > percent)
  const monitoringWarning = metrics !== undefined && metrics.health !== 'Healthy'
  const warningReason = metrics && [
    metrics.errorRate >= errorThreshold ? `error rate ${metrics.errorRate.toFixed(2)}% is at or above ${errorThreshold.toFixed(1)}%` : '',
    metrics.latencyMs >= latencyThreshold ? `latency ${metrics.latencyMs} ms is at or above ${latencyThreshold} ms` : '',
  ].filter(Boolean).join(' and ')

  function confirmRollback() {
    setRollbackConfirmation(false)
    onRollback()
  }

  return <>
    <PageHeading eyebrow="CONTROLLED RELEASES" title="Rollout simulator" description="Release to a small group first, watch simulated health, then decide whether to continue." action={<span className="simulation-tag"><span />SIMULATED DATA</span>} />
    <div className="rollout-layout rollout-simulator-layout">
      <div className="rollout-main">
        <section className="panel rollout-config">
          <div className="rollout-card-head"><span className="big-icon violet"><GitBranch size={19} /></span><div><h2>Configure rollout</h2><p>Choose a feature and preview its release stages.</p></div></div>
          <label className="field-label" htmlFor="rollout-feature-select">FEATURE FLAG · {environment.toUpperCase()}</label>
          <select className="full-select" id="rollout-feature-select" value={selected} disabled={!flags.length} onChange={(event) => setSelected(event.target.value)}>
            {!flags.length && <option value="">No flags configured in this environment</option>}
            {flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name} · {flag.environment}</option>)}
          </select>
          {selectedFlag && <>
            <div className="rollout-number-row"><div><span className="field-label">ROLLOUT PERCENTAGE</span><p>Pick how many users receive the feature</p></div><div className="percent-value">{percent}<span>%</span></div></div>
            <input className="range-slider rollout-stage-slider" type="range" min="0" max={rolloutStages.length - 1} step="1" value={stageIndex} style={{ '--range-progress': `${stageIndex / (rolloutStages.length - 1) * 100}%` } as React.CSSProperties} onChange={(event) => setPercent(rolloutStages[Number(event.target.value)])} aria-label="Rollout stage percentage" />
            <div className="stage-block rollout-stage-block">
              <div className="stage-title"><span>Release stages</span><span>Choose a stage to preview</span></div>
              <div className="stage-buttons rollout-stage-buttons">{rolloutStages.map((stage, index) => <button type="button" key={stage} className={`stage-button ${percent === stage ? 'stage-selected' : ''}`} aria-pressed={percent === stage} onClick={() => setPercent(stage)}><span>{stage}%</span><small>{['Off', 'Canary', 'Early access', 'Halfway', 'Broad', 'Full release'][index]}</small></button>)}</div>
              <button type="button" className="rollout-advance-button" disabled={nextStage === undefined} onClick={() => nextStage !== undefined && setPercent(nextStage)}>{nextStage === undefined ? 'Full rollout previewed' : `Preview next stage · ${nextStage}%`}<ArrowRight size={13} /></button>
            </div>
            <div className="rollout-bottom"><span><LockKeyhole size={13} />{readOnly ? 'Preview only · live Flagsmith is read-only' : <>Simulated change for <b>{selectedFlag.environment}</b></>}</span><div className="rollout-action-buttons">
              <button type="button" className="button button-danger rollout-rollback-button" disabled={readOnly || (!selectedFlag.enabled && selectedFlag.rollout === 0 && percent === 0)} onClick={() => setRollbackConfirmation(true)}><RotateCcw size={14} />Rollback</button>
              <button type="button" className="button button-primary" disabled={readOnly} onClick={() => apply(percent)}><GitBranch size={15} />{readOnly ? 'Preview only' : `Apply ${percent}% stage`}</button>
            </div></div>
          </>}
        </section>

        {selectedFlag && metrics && <section className="panel rollout-results-panel">
          <div className="panel-heading"><div><h2>Traffic &amp; simulated results</h2><p>Estimated users and sample outcomes at {percent}% rollout · {selectedFlag.name}</p></div><div className="rollout-results-actions"><button type="button" className="text-button" onClick={onMonitor}>Detailed monitoring <ArrowRight size={13} /></button><span className="simulation-tag"><span />SIMULATED</span></div></div>
          <div className="rollout-traffic-card">
            <div className="rollout-traffic-heading"><span><Users size={14} />{metrics.totalUsers.toLocaleString()} simulated users</span><b>{percent}% feature · {100 - percent}% control</b></div>
            <div className="rollout-traffic-bar" role="img" aria-label={`${metrics.featureUsers} users receive the feature, ${metrics.controlUsers} stay on control`}><span style={{ width: `${percent}%` }} /></div>
            <div className="rollout-traffic-legend"><span><i className="traffic-feature-dot" />Feature <b>{metrics.featureUsers.toLocaleString()}</b></span><span><i className="traffic-control-dot" />Control <b>{metrics.controlUsers.toLocaleString()}</b></span></div>
          </div>
          <div className="rollout-metric-grid">
            <div className="rollout-metric-card"><span>FEATURE CONVERSION</span><b>{metrics.featureConversionRate.toFixed(2)}%</b><small>Control: {metrics.controlConversionRate.toFixed(2)}%</small></div>
            <div className={`rollout-metric-card ${metrics.errorRate >= errorThreshold ? 'metric-warning' : ''}`}><span>ERROR RATE</span><b>{metrics.errorRate.toFixed(2)}%</b><small>Alert threshold: {errorThreshold.toFixed(1)}%</small></div>
            <div className={`rollout-metric-card ${metrics.latencyMs >= latencyThreshold ? 'metric-warning' : ''}`}><span>LATENCY</span><b>{metrics.latencyMs} ms</b><small>Alert threshold: {latencyThreshold} ms</small></div>
            <div className={`rollout-metric-card ${metrics.impactConversions < 0 ? 'metric-negative' : 'metric-positive'}`}><span>ESTIMATED IMPACT</span><b>{metrics.impactConversions > 0 ? '+' : ''}{metrics.impactConversions}</b><small>Conversions vs. control group</small></div>
          </div>
          <div className="rollout-sim-disclaimer"><CircleHelp size={13} />Every value here is generated by a deterministic demo simulation—not live analytics, customer traffic, or production telemetry.</div>
        </section>}

        {selectedFlag && <section className="panel rollout-comparison-panel">
          <div className="panel-heading"><div><h2>Compare every stage</h2><p>See how exposure and simulated health change as rollout grows.</p></div></div>
          <div className="rollout-comparison-scroll"><table className="rollout-comparison-table"><thead><tr><th>STAGE</th><th>FEATURE / CONTROL USERS</th><th>FEATURE CONVERSION</th><th>ERROR RATE</th><th>LATENCY</th><th>HEALTH</th></tr></thead><tbody>
            {comparisons.map((row) => <tr key={row.stage} className={row.stage === percent ? 'comparison-current' : ''}><td><button type="button" onClick={() => setPercent(row.stage)}>{row.stage}%{row.stage === percent && <small>PREVIEW</small>}</button></td><td>{row.featureUsers.toLocaleString()} / {row.controlUsers.toLocaleString()}</td><td>{row.featureConversionRate.toFixed(2)}% <small>vs {row.controlConversionRate.toFixed(2)}%</small></td><td className={row.errorRate >= errorThreshold ? 'comparison-alert' : ''}>{row.errorRate.toFixed(2)}%</td><td className={row.latencyMs >= latencyThreshold ? 'comparison-alert' : ''}>{row.latencyMs} ms</td><td><span className={`rollout-health-badge health-${row.health.toLowerCase()}`}><i />{row.health}</span></td></tr>)}
          </tbody></table></div>
        </section>}
      </div>

      <aside className="rollout-aside">
        <section className={`health-card rollout-monitor-card ${monitoringWarning ? 'monitor-warning' : ''} ${metrics?.health === 'Critical' ? 'monitor-critical' : ''}`}>
          <div className="health-card-top"><span className={`health-icon ${monitoringWarning ? 'health-icon-warning' : ''}`}>{monitoringWarning ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}</span><span className={`health-pulse ${monitoringWarning ? 'pulse-warning' : ''}`} /></div>
          <span className="rollout-monitor-kicker">SIMULATED HEALTH MONITOR</span>
          <b>{!metrics ? 'Choose a feature to begin' : metrics.health === 'Critical' ? 'Safety limits exceeded' : metrics.health === 'Warning' ? 'Health warning detected' : 'Release health looks steady'}</b>
          <p>{!metrics ? 'Select a feature flag to preview its simulated rollout health.' : monitoringWarning ? `At ${percent}% rollout, ${warningReason}. ${metrics.health === 'Critical' ? 'Recommend rolling back to 0%.' : 'Recommend holding exposure while you investigate.'}` : `At ${percent}% rollout, simulated error and latency metrics are within your configured limits.`}</p>
          <div><span><i />Error rate</span><b>{metrics ? `${metrics.errorRate.toFixed(2)}%` : '—'}</b></div>
          <div><span><i />Latency</span><b>{metrics ? `${metrics.latencyMs} ms` : '—'}</b></div>
          <div className="rollout-threshold-settings"><b>Alert thresholds</b><label>Error rate<input type="number" min="0.1" max="10" step="0.1" value={errorThreshold} onChange={(event) => setErrorThreshold(Math.max(0.1, Number(event.target.value) || 0.1))} aria-label="Simulated error rate threshold percentage" /><span>%</span></label><label>Latency<input type="number" min="50" max="2000" step="10" value={latencyThreshold} onChange={(event) => setLatencyThreshold(Math.max(50, Number(event.target.value) || 50))} aria-label="Simulated latency threshold in milliseconds" /><span>ms</span></label></div>
          {metrics && <button type="button" className={`rollout-recommendation-button ${monitoringWarning ? 'recommendation-warning' : ''}`} onClick={() => {
            if (metrics.health === 'Critical') setRollbackConfirmation(true)
            else if (metrics.health === 'Warning') {
              const appliedStage = nearestRolloutStage(selectedFlag?.rollout ?? 0)
              setPercent(appliedStage)
              apply(appliedStage)
            } else if (nextStage !== undefined) setPercent(nextStage)
          }} disabled={Boolean((metrics.health === 'Healthy' && nextStage === undefined) || readOnly)}>
            {metrics.health === 'Critical' ? 'Review rollback' : metrics.health === 'Warning' ? `Hold at ${nearestRolloutStage(selectedFlag?.rollout ?? 0)}%` : nextStage === undefined ? 'Fully rolled out' : `Preview ${nextStage}% stage`}<ArrowRight size={13} />
          </button>}
          <div className="rollout-monitor-disclaimer">Illustrative metrics only · no production telemetry</div>
        </section>
      </aside>
    </div>

    {rollbackConfirmation && selectedFlag && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRollbackConfirmation(false) }}><section className="flag-modal rollout-rollback-modal" role="dialog" aria-modal="true" aria-labelledby="rollout-rollback-title"><div className="modal-header"><div><span className="kill-modal-icon"><AlertTriangle size={18} /></span><div><h2 id="rollout-rollback-title">Confirm simulated rollback</h2><p>This will stop the feature for all simulated users.</p></div><button className="icon-button subtle" aria-label="Close rollback confirmation" onClick={() => setRollbackConfirmation(false)}><X size={17} /></button></div></div><div className="rollout-rollback-impact"><b>{selectedFlag.name}</b><span><i className={`env-dot ${selectedFlag.environment.toLowerCase()}`} />{selectedFlag.environment} · current saved exposure {selectedFlag.rollout}%</span><p>The demo flag will be disabled and reset to 0% rollout. A rollback event will be added to Activity Log and Release Risks. No live Flagsmith flag or real users will be affected.</p></div><div className="modal-footer"><button type="button" className="button button-quiet" onClick={() => setRollbackConfirmation(false)}>Cancel</button><button type="button" className="button button-danger" onClick={confirmRollback}><RotateCcw size={14} />Confirm rollback</button></div></section></div>}
  </>
}

function ExperimentsPage({ profileName, onToast }: { profileName: string; onToast: (message: string) => void }) {
  const [tab, setTab] = useState('All experiments')
  const [experiments, setExperiments] = useState<Experiment[]>(readStoredExperiments)
  useEffect(() => { localStorage.setItem('flagpilot-experiments', JSON.stringify(experiments)) }, [experiments])
  const shown = tab === 'All experiments' ? experiments : experiments.filter((experiment) => experiment.status === tab)
  function createExperiment() {
    const number = experiments.filter((experiment) => experiment.key.startsWith('new_experiment')).length + 1
    const newExperiment: Experiment = { name: `New experiment${number > 1 ? ` ${number}` : ''}`, key: `new_experiment_${number}`, status: 'Running', variants: ['Control', 'Variant A'], traffic: [50, 50], conversion: ['0.00%', '0.00%'], lift: '+0.0%', owner: profileName, color: 'violet', users: '0' }
    setExperiments((current) => [newExperiment, ...current])
    setTab('All experiments')
    onToast('Experiment created with a 50/50 traffic split')
  }
  return <><PageHeading eyebrow="LEARN & OPTIMIZE" title="Experiments" description="Demo experiments are local sample data and are not read from Flagsmith." action={<button className="button button-primary" onClick={createExperiment}><Plus size={16} />New experiment</button>} />
    <div className="experiment-summary"><div className="experiment-summary-card"><span className="summary-icon violet"><FlaskConical size={17} /></span><div><small>Running experiments</small><b>02</b></div><span className="summary-foot">Across 2 environments</span></div><div className="experiment-summary-card"><span className="summary-icon green"><TrendingUp size={17} /></span><div><small>Avg. conversion lift</small><b>+15.5%</b></div><span className="summary-foot positive"><ArrowUpRight size={12} />vs. control groups</span></div><div className="experiment-summary-card"><span className="summary-icon blue"><Users size={17} /></span><div><small>Users in experiments</small><b>39.2k</b></div><span className="summary-foot">Across all variants</span></div></div>
    <section className="panel experiments-panel"><div className="directory-top"><div className="directory-title"><span className="mini-icon"><Beaker size={16} /></span><div><b>Your experiments</b><span>Measure what matters</span></div></div><div className="tab-switch">{['All experiments', 'Running', 'Completed'].map((item) => <button key={item} className={tab === item ? 'tab-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div></div>
      <div className="experiment-list">{shown.map((experiment) => <article className="experiment-card" key={experiment.key}><div className="experiment-card-top"><div className="experiment-title"><span className={`experiment-symbol ${experiment.color}`}><FlaskConical size={16} /></span><div><h3>{experiment.name}</h3><span>{experiment.key}</span></div></div><span className={`experiment-status ${experiment.status.toLowerCase()}`}><i />{experiment.status}</span><button className="row-more" aria-label={`More options for ${experiment.name}`} onClick={() => onToast(`${experiment.name} settings opened`)}><MoreHorizontal size={17} /></button></div>      <div className="experiment-stats"><div><span>PARTICIPANTS</span><b><Users size={13} />{experiment.users}</b></div><div className="variant-metric"><span>VARIANT DISTRIBUTION</span><div>{experiment.variants.map((variant, index) => <div className="variant-row" key={variant}><span>{variant}</span><ProgressBar value={experiment.traffic[index]} color={index === 0 ? 'soft-violet' : experiment.color} /><b>{experiment.traffic[index]}%</b></div>)}</div></div><div><span>CONVERSION RATE</span><div className="conversion-values">{experiment.conversion.map((value, index) => <b key={`${experiment.key}-${index}`} className={index === 1 ? 'accent-text' : ''}>{value}<small>{experiment.variants[index]}</small></b>)}</div></div><div><span>CONVERSION LIFT</span><b className={experiment.lift.includes('−') ? 'negative-lift' : 'positive-lift'}>{experiment.lift}</b><small className="confidence-label">{experiment.status === 'Running' ? '95% confidence' : 'Result inconclusive'}</small></div></div><div className="experiment-card-footer"><span><span className="avatar tiny">{experiment.owner.split(' ').map((part) => part[0]).join('')}</span>{experiment.owner}</span><span><Clock3 size={12} />{experiment.status === 'Running' ? 'Started 3 days ago' : 'Ended 2 days ago'}</span><button onClick={() => onToast(`Showing results for ${experiment.name}`)}>View results <ArrowRight size={13} /></button></div></article>)}</div>
    </section>
  </>
}

function EnvironmentsPage({ environment, setEnvironment, flags, readOnly, onToast }: { environment: Environment; setEnvironment: (environment: Environment) => void; flags: FeatureFlag[]; readOnly: boolean; onToast: (message: string) => void }) {
  const config: Record<Environment, { subtitle: string; host: string; health: string; color: string; deploy: string; version: string }> = {
    Development: { subtitle: 'Build and validate upcoming changes.', host: 'dev.northstar.app', health: 'Healthy', color: 'development', deploy: '4 min ago', version: 'v2.18.0-dev.4' },
    Staging: { subtitle: 'Test releases in a production-like environment.', host: 'staging.northstar.app', health: 'Stable', color: 'staging', deploy: '38 min ago', version: 'v2.17.3-rc.2' },
    Production: { subtitle: 'Live environment serving your customers.', host: 'app.northstar.app', health: 'Healthy', color: 'production', deploy: '2 hours ago', version: 'v2.17.2' },
  }
  return <><PageHeading eyebrow="YOUR WORKSPACE" title="Environments" description={readOnly ? 'The backend key evaluates one Flagsmith environment. Other environment cards are demo metadata.' : 'Separate development, testing, and production releases.'} action={<button className="button button-quiet" disabled={readOnly} onClick={() => onToast('Environment configuration is up to date')}><Settings size={15} />Configure</button>} />
    <div className="environment-cards">{(readOnly ? [environment] : environments).map((env) => { const data = config[env]; const list = flags.filter((flag) => isConfiguredInEnvironment(flag, env)).map((flag) => forEnvironment(flag, env)); return <article className={`environment-card ${environment === env ? 'environment-selected' : ''}`} key={env}><div className="environment-card-top"><span className={`environment-large-icon ${data.color}`}><Code2 size={19} /></span><span className="health-label"><i />{readOnly ? 'Evaluated' : data.health}</span><button className="row-more" disabled={readOnly} aria-label={`Configure ${env}`} onClick={() => onToast(`${env} settings opened`)}><MoreHorizontal size={17} /></button></div><h2>{env}{env === 'Production' && <LockKeyhole size={13} />}</h2><p>{readOnly ? 'Local environment alias mapped to a Flags API Environment Key in backend configuration.' : data.subtitle}</p><div className="environment-details">{readOnly ? <><div><span>FLAG EVALUATIONS</span><b>{list.length}</b></div><div><span>ENABLED EVALUATIONS</span><b>{list.filter((flag) => flag.enabled).length}</b></div><div><span>ROLLOUT PERCENTAGES</span><b>Not provided by evaluation</b></div><div><span>MANAGEMENT</span><b>Read-only</b></div></> : <><div><span>APPLICATION URL</span><b>{data.host}<ExternalLink size={12} /></b></div><div><span>ACTIVE FLAGS</span><b>{list.filter((flag) => flag.enabled).length}<small> / {list.length}</small></b></div><div><span>LAST DEPLOYMENT</span><b>{data.deploy}</b></div><div><span>VERSION</span><b className="version-code">{data.version}</b></div></>}</div><button disabled={readOnly} className={`button ${environment === env ? 'button-quiet selected-env-button' : 'button-secondary'}`} onClick={() => { setEnvironment(env); onToast(`${env} is now your active environment`) }}>{readOnly ? <><Check size={14} />Configured Flagsmith environment</> : environment === env ? <><Check size={14} />Current environment</> : <>Switch to {env}<ArrowRight size={14} /></>}</button></article> })}</div>
    {!readOnly && <section className="panel env-rollout-panel"><div className="panel-heading"><div><h2>Environment promotion flow</h2><p>Changes move safely through each stage</p></div><button className="text-button" onClick={() => onToast('Promotion policies are configured')}><Settings size={13} />Promotion policy</button></div><div className="promotion-flow">{environments.map((env, index) => <div className="promotion-node-wrap" key={env}><button className="promotion-node" onClick={() => { setEnvironment(env); onToast(`${env} selected`) }}><span className={`env-indicator ${env.toLowerCase()}`}><Code2 size={15} /></span><span><b>{env}</b><small>{index === 0 ? 'Continuous deploy' : index === 1 ? 'Manual approval' : 'Protected release'}</small></span></button>{index < 2 && <div className="promotion-arrow"><span>{index === 0 ? 'promote' : 'approve'}</span><ArrowRight size={16} /></div>}</div>)}</div></section>}
  </>
}

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  const iconForKind = { flag: Flag, rollout: GitBranch, kill: AlertOctagon, create: Plus, edit: Settings, safety: ShieldAlert, rollback: RotateCcw }
  const colorForKind = { flag: 'blue', rollout: 'violet', kill: 'amber', create: 'green', edit: 'blue', safety: 'violet', rollback: 'amber' }
  return <div className="activity-list">{entries.map((entry) => {
    const Icon = iconForKind[entry.kind]
    return <div className="activity-item" key={entry.id}><span className={`activity-icon ${colorForKind[entry.kind]}`}><Icon size={14} /></span><div className="activity-copy"><b>{entry.title}</b><span>{entry.detail} · {entry.environment}</span></div><time>{formatActivityTime(entry.occurredAt)}</time></div>
  })}</div>
}

function ActivityLogPage({ activity, mode }: { activity: ActivityEntry[]; mode: IntegrationConfig['mode'] }) {
  const [filter, setFilter] = useState<'All environments' | Environment>('All environments')
  const entries = filter === 'All environments' ? activity : activity.filter((entry) => entry.environment === filter)
  return <><PageHeading eyebrow="AUDIT TRAIL" title="Activity log" description={mode === 'live' ? 'Local demo history only. This browser integration does not load a Flagsmith audit log.' : 'A local record of simulated flag changes and release actions.'} action={<span className="simulation-tag"><span />{mode === 'live' ? 'LOCAL HISTORY' : 'DEMO MODE'}</span>} />
    <section className="panel activity-log-panel"><div className="directory-top"><div className="directory-title"><span className="count-bubble">{entries.length}</span><div><b>Workspace events</b><span>Most recent activity first · stored on this device</span></div></div><label className="filter-select"><ListFilter size={14} /><select aria-label="Filter activity by environment" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option>All environments</option>{environments.map((env) => <option key={env}>{env}</option>)}</select><ChevronDown size={13} /></label></div>
      {entries.length ? <ActivityList entries={entries} /> : <div className="empty-state"><Activity size={21} /><b>No activity in this environment</b><span>Changes made in this workspace will appear here.</span></div>}
    </section>
  </>
}

function KillSwitchPage({ flags, readOnly, selectedId, setSelectedId, onRequestKill }: { flags: FeatureFlag[]; readOnly: boolean; selectedId: string; setSelectedId: (id: string) => void; onRequestKill: (flag: FeatureFlag) => void }) {
  const enabled = flags.filter((flag) => flag.enabled)
  const target = enabled.find((flag) => flag.id === selectedId) ?? enabled[0]
  const exposure = target && !readOnly ? Math.round(audience[target.environment] * target.rollout / 100) : null
  return <><PageHeading eyebrow="EMERGENCY RELEASE CONTROL" title="Kill switch" description="Stop exposure to a live feature immediately. Every action is recorded in the activity log." action={<span className="simulation-tag"><span />SIMULATED CONTROL</span>} />
    <div className="kill-switch-layout"><section className="panel kill-control-panel"><span className="kill-control-icon"><Zap size={21} /></span><div className="kill-control-copy"><h2>Disable a feature instantly</h2><p>Select an enabled flag to preview its current impact before confirming the kill switch.</p></div>
      {enabled.length ? <><label className="field-label" htmlFor="kill-target">ACTIVE FEATURE FLAG</label><select className="full-select" id="kill-target" value={target?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>{enabled.map((flag) => <option key={flag.id} value={flag.id}>{flag.name} · {flag.environment}</option>)}</select>
        {target && <div className="kill-impact"><div className="kill-impact-heading"><span><AlertTriangle size={15} />Impact preview</span><RiskBadge risk={target.risk} known={target.riskKnown !== false} /></div><div className="kill-impact-grid"><div><span>FEATURE</span><b>{target.name}</b></div><div><span>ENVIRONMENT</span><b><i className={`env-dot ${target.environment.toLowerCase()}`} />{target.environment}</b></div><div><span>{readOnly ? 'ROLLOUT PERCENTAGE' : 'LIVE ROLLOUT'}</span><b>{target.rolloutKnown === false ? 'Not provided by evaluation' : `${target.rollout}%`}</b></div><div><span>{readOnly ? 'USER EXPOSURE' : 'EST. USERS AFFECTED'}</span><b>{exposure === null ? 'Not available' : exposure.toLocaleString()}</b></div></div><p>{readOnly ? 'Flagsmith evaluation returns flag state but not rollout targeting or user exposure. The backend has no management endpoint, so this preview cannot disable a live flag.' : `Disabling this flag stops its exposure in ${target.environment}. The flag configuration remains available to re-enable later.`}</p></div>}
        <button className="button button-danger kill-confirm-trigger" disabled={!target || readOnly} onClick={() => target && onRequestKill(target)}><Zap size={15} />{readOnly ? 'Live kill switch unavailable' : `Disable ${target?.name ?? 'feature'} now`}</button>
      </> : <div className="empty-state"><ShieldCheck size={23} /><b>No enabled flags to disable</b><span>All features in this workspace are currently off.</span></div>}
    </section><aside className="kill-aside"><div className="kill-aside-badge"><ShieldAlert size={18} /></div><h3>{readOnly ? 'Live evaluation, no mutation' : 'Built for the unexpected'}</h3><p>{readOnly ? 'The backend exposes read-only Flagsmith evaluation, so a live kill switch is not available.' : 'Pause a rollout when release health degrades. Your change is simulated locally and does not contact a live Flagsmith project.'}</p><div className="kill-aside-fact">{readOnly ? <><span><Check size={13} />Live flag state is read from Flagsmith</span><span><Check size={13} />No server API token in the browser</span><span><Check size={13} />Management action stays disabled</span></> : <><span><Check size={13} />Immediate simulated disable</span><span><Check size={13} />Activity log records the action</span><span><Check size={13} />Re-enable anytime from Feature Flags</span></>}</div></aside></div>
  </>
}

function KillConfirmModal({ flag, onCancel, onConfirm }: { flag: FeatureFlag; onCancel: () => void; onConfirm: () => void }) {
  const exposure = Math.round(audience[flag.environment] * flag.rollout / 100)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="flag-modal kill-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="kill-modal-title"><div className="modal-header"><div><span className="kill-modal-icon"><AlertOctagon size={18} /></span><div><h2 id="kill-modal-title">Confirm emergency kill switch</h2><p>This simulated action takes effect immediately.</p></div></div><button className="icon-button subtle" aria-label="Close confirmation" onClick={onCancel}><X size={17} /></button></div><div className="kill-confirm-impact"><b>{flag.name}</b><span><i className={`env-dot ${flag.environment.toLowerCase()}`} />{flag.environment} · {flag.rollout}% rollout</span><p>Exposure will stop for an estimated <strong>{exposure.toLocaleString()} users</strong>. The flag will remain in your workspace and can be re-enabled at any time.</p></div><div className="modal-footer"><button className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-danger" onClick={onConfirm}><Zap size={14} />Confirm kill switch</button></div></section></div>
}

function ProductTourStep({ index, total, step, onPrevious, onNext, onClose }: {
  index: number
  total: number
  step: { page: Page; title: string; description: string }
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  return <div className="modal-backdrop tour-backdrop"><section className="flag-modal product-tour-modal" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <div className="modal-header"><div><span className="tour-icon"><Compass size={18} /></span><div><h2 id="tour-title">{step.title}</h2><p>{step.page}{step.page === 'Release Risks' && index === 5 ? ' · Agent Skill' : ''}</p></div></div><button className="icon-button subtle" aria-label="Close product tour" onClick={onClose}><X size={17} /></button></div>
    <p className="tour-description">{step.description}</p>
    <div className="tour-progress"><span>{index + 1} of {total}</span><div>{Array.from({ length: total }, (_unused, dotIndex) => <i key={dotIndex} className={dotIndex <= index ? 'active' : ''} />)}</div></div>
    <div className="modal-footer"><button className="button button-quiet" onClick={onClose}>Skip tour</button><span className="tour-footer-spacer" /><button className="button button-quiet" disabled={index === 0} onClick={onPrevious}>Back</button><button className="button button-primary" onClick={onNext}>{index === total - 1 ? 'Finish tour' : 'Next'}<ArrowRight size={14} /></button></div>
  </section></div>
}

function ResetDemoConfirmation({ readOnly, onCancel, onConfirm }: { readOnly: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="flag-modal reset-demo-modal" role="dialog" aria-modal="true" aria-labelledby="reset-demo-title">
    <div className="modal-header"><div><span className="kill-modal-icon"><RotateCcw size={18} /></span><div><h2 id="reset-demo-title">Reset the demo workspace?</h2><p>This only resets locally saved demonstration data.</p></div></div><button className="icon-button subtle" aria-label="Cancel reset" onClick={onCancel}><X size={17} /></button></div>
    <p className="reset-demo-copy">{readOnly
      ? 'Local demo flags, experiments, activity, and release history will be restored or cleared. Your live Flagsmith connection and remote flags will not be changed.'
      : 'Sample flags and activity will be restored, and local experiment and release history will be cleared.'} Your profile name, notification preference, tour status, and Flagsmith connection settings will be preserved.</p>
    <div className="modal-footer"><button className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-danger" onClick={onConfirm}><RotateCcw size={14} />Reset demo data</button></div>
  </section></div>
}

function SettingsPage({ environment, setEnvironment, readOnly, profileName, setProfileName, notificationsEnabled, setNotificationsEnabled, reset, onStartTour, onToast, integrationConfig, integrationStatus, integrationError, onConnect, onDisconnect, onRefresh }: {
  environment: Environment
  setEnvironment: (environment: Environment) => void
  readOnly: boolean
  profileName: string
  setProfileName: (name: string) => void
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => void
  reset: () => void
  onStartTour: () => void
  onToast: (message: string) => void
  integrationConfig: IntegrationConfig
  integrationStatus: IntegrationStatus
  integrationError: string
  onConnect: (config: LiveIntegrationConfig) => void
  onDisconnect: () => void
  onRefresh: () => void
}) {
  return <>
    <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings" description="Manage your profile, integration mode, workspace preferences, and local data." />
    <div className="settings-layout"><div className="settings-content">
      <FlagsmithConnectionSettings key={integrationConfig.mode === 'live' ? integrationConfig.environment : 'demo'} config={integrationConfig} status={integrationStatus} error={integrationError} onConnect={onConnect} onDisconnect={onDisconnect} onRefresh={onRefresh} />
      <section className="panel settings-panel tour-settings-panel"><div className="settings-section-head"><div><h2>Explore FlagPilot</h2><p>Take a short, optional tour of the release workflow and its safety tools.</p></div><button className="button button-quiet" onClick={onStartTour}><Compass size={15} />{localStorage.getItem('flagpilot-tour-completed') === 'true' ? 'Replay product tour' : 'Start product tour'}</button></div></section>
      <section className="panel settings-panel">
        <div className="settings-section-head"><div><h2>Your profile</h2><p>Personalize your FlagPilot demo profile. No account or authentication required.</p></div><span className="avatar settings-avatar">{getInitials(profileName || 'Ankith')}</span></div>
        <div className="setting-row"><div><b>Display name</b><span>Shown in your greeting, profile, and simulated actions.</span></div><input value={profileName} onChange={(event) => setProfileName(event.target.value)} aria-label="Profile display name" maxLength={40} /></div>
      </section>
      <section className="panel settings-panel">
        <div className="settings-section-head"><div><h2>Workspace</h2><p>Configure how FlagPilot behaves for this workspace.</p></div><span className="workspace-glyph large">N</span></div>
        <div className="setting-row"><div><b>Workspace name</b><span>The name your team sees across FlagPilot.</span></div><input value="FlagForge" readOnly aria-label="Workspace name" /></div>
        <div className="setting-row"><div><b>{readOnly ? 'Flagsmith environment' : 'Default environment'}</b><span>{readOnly ? 'Select a local alias mapped to a Flags API Environment Key in backend configuration.' : 'Choose which environment opens by default.'}</span></div><select value={environment} onChange={(event) => { setEnvironment(event.target.value as Environment); onToast(`${readOnly ? 'Flagsmith environment switched to' : 'Default environment set to'} ${event.target.value}`) }}>{environments.map((env) => <option key={env}>{env}</option>)}</select></div>
        <div className="setting-row"><div><b>Release notifications</b><span>Get notified when a release needs attention.</span></div><Toggle checked={notificationsEnabled} onChange={() => { const enabled = !notificationsEnabled; setNotificationsEnabled(enabled); onToast(`Release notifications ${enabled ? 'enabled' : 'disabled'}`) }} label="Release notifications" /></div>
      </section>
      <section className="panel settings-panel danger-panel"><div><h2>Reset demo data</h2><p>{readOnly ? 'Restore local sample data and clear local history. Remote Flagsmith flags, profile, and connection settings are not changed.' : 'Restore sample flags and clear local experiment and release history. Your profile and preferences stay as they are.'}</p></div><button className="button button-danger" onClick={reset}><Trash2 size={14} />Reset demo data</button></section>
      <div className="local-data-note"><LockKeyhole size={15} /><span><b>Demo data stays on this device.</b> FlagPilot stores demo workspace changes in browser localStorage. Live Flagsmith evaluations use the SDK and are not saved as demo flags.</span></div>
    </div></div>
  </>
}

export default App


