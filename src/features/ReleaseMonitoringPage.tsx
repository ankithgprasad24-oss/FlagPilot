import { useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, Clock3,
  Gauge, GitBranch, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, Users,
} from 'lucide-react'
import type { ActivityEntry, Environment, FeatureFlag, Page, ReleaseTimelineEntry } from '../types'
import {
  buildMonitoringData, formatMonitoringTime, getRangeStart, monitoringRanges,
  type MonitoringPattern, type MonitoringRange, type MonitoringSample,
} from './releaseMonitoring'

type Props = {
  flags: FeatureFlag[]
  environment: Environment
  activity: ActivityEntry[]
  timeline: ReleaseTimelineEntry[]
  readOnly: boolean
  selectedFlagId: string
  scenarioPattern?: MonitoringPattern
  onSelectFlag: (id: string) => void
  onNavigate: (page: Page) => void
}

type EventRow = {
  id: string
  title: string
  detail: string
  timestamp: number
  source: 'LOCAL WORKSPACE' | 'SIMULATED SIGNAL'
  kind: string
}

function deltaLabel(current: number, baseline: number, unit: string, digits = 0, direction: 'higher-good' | 'higher-bad' | 'neutral' = 'neutral'): { label: string; tone: string } {
  const delta = current - baseline
  const formatted = `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}${unit}`
  const tone = direction === 'neutral' || delta === 0
    ? ''
    : direction === 'higher-good'
      ? delta > 0 ? 'metric-positive' : 'metric-warning'
      : delta > 0 ? 'metric-warning' : 'metric-positive'
  return { label: `${formatted} vs baseline`, tone }
}

function makeLinePath(samples: MonitoringSample[], key: keyof MonitoringSample, width: number, height: number, min: number, max: number): string {
  const range = Math.max(max - min, 1)
  return samples.map((sample, index) => {
    const x = samples.length <= 1 ? 0 : (index / (samples.length - 1)) * width
    const value = Number(sample[key])
    const y = height - ((value - min) / range) * height
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function MonitoringChart({ title, description, samples, metric, color, range, unit, valueDigits = 0 }: {
  title: string
  description: string
  samples: MonitoringSample[]
  metric: keyof MonitoringSample
  color: string
  range: MonitoringRange
  unit: string
  valueDigits?: number
}) {
  const values = samples.map((sample) => Number(sample[metric]))
  const min = Math.min(0, ...values) * (metric === 'exposurePercent' ? 1 : 0.9)
  const max = Math.max(...values, 1) * 1.12
  const path = makeLinePath(samples, metric, 680, 150, min, max)
  const last = samples.at(-1)
  return <section className="panel monitoring-chart-panel">
    <div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="monitoring-chart-current">{last ? `${Number(last[metric]).toFixed(valueDigits)}${unit}` : '—'}</span></div>
    <div className="monitoring-chart-legend"><span><i style={{ backgroundColor: color }} />Simulated {title.toLowerCase()}</span><span className="chart-range-label">{monitoringRanges.find((item) => item.value === range)?.label}</span></div>
    <div className="monitoring-chart-wrap">
      <div className="monitoring-chart-y-labels"><span>{(max).toFixed(valueDigits)}{unit}</span><span>{((max + min) / 2).toFixed(valueDigits)}{unit}</span><span>{min.toFixed(valueDigits)}{unit}</span></div>
      <svg className="monitoring-chart" viewBox="0 0 680 150" preserveAspectRatio="none" role="img" aria-label={`${title} simulated trend over ${monitoringRanges.find((item) => item.value === range)?.label}`}>
        <path className="chart-gridline" d="M0 4H680M0 75H680M0 146H680" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {samples.map((sample, index) => {
          const x = samples.length <= 1 ? 0 : (index / (samples.length - 1)) * 680
          const y = 150 - ((Number(sample[metric]) - min) / Math.max(max - min, 1)) * 150
          return <circle key={sample.timestamp} cx={x} cy={y} r={index === samples.length - 1 ? 4 : 2.4} fill={color} className="monitoring-chart-point"><title>{`${formatMonitoringTime(sample.timestamp, range)}: ${Number(sample[metric]).toFixed(valueDigits)}${unit}`}</title></circle>
        })}
      </svg>
    </div>
    <div className="monitoring-chart-x-labels"><span>{formatMonitoringTime(samples[0]?.timestamp ?? 0, range)}</span><span>{formatMonitoringTime(samples[Math.floor(samples.length / 2)]?.timestamp ?? 0, range)}</span><span>Now</span></div>
  </section>
}

function MetricCard({ label, value, unit, baseline, current, digits = 0, icon: Icon, tone = 'violet', direction = 'neutral' }: {
  label: string
  value: number
  unit: string
  baseline: number
  current: number
  digits?: number
  icon: typeof Activity
  tone?: string
  direction?: 'higher-good' | 'higher-bad' | 'neutral'
}) {
  const delta = deltaLabel(current, baseline, unit, digits, direction)
  return <article className="panel monitoring-metric-card">
    <div className="monitoring-metric-head"><span>{label}</span><i className={`monitoring-metric-icon ${tone}`}><Icon size={15} /></i></div>
    <b>{value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}{unit}</b>
    <div className={`monitoring-metric-delta ${delta.tone}`}><span>{current > baseline ? <ArrowUpRight size={13} /> : current < baseline ? <ArrowDownRight size={13} /> : <Check size={13} />}{delta.label}</span></div>
    <small>Baseline {baseline.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}{unit}</small>
  </article>
}

export function ReleaseMonitoringPage({ flags, environment, activity, timeline, readOnly, selectedFlagId, scenarioPattern, onSelectFlag, onNavigate }: Props) {
  const [range, setRange] = useState<MonitoringRange>('24h')
  const selectedFlag = flags.find((flag) => flag.id === selectedFlagId) ?? flags[0]
  const monitoring = useMemo(
    () => selectedFlag && !readOnly ? buildMonitoringData(selectedFlag, activity, range, undefined, scenarioPattern) : undefined,
    [selectedFlag, activity, range, readOnly, scenarioPattern],
  )

  const eventRows = useMemo<EventRow[]>(() => {
    if (!selectedFlag || !monitoring) return []
    const start = monitoring.samples[0]?.timestamp ?? getRangeStart(range)
    const end = monitoring.samples.at(-1)?.timestamp ?? start
    const localEvents: EventRow[] = monitoring.relatedActivity.map((entry) => ({
      id: entry.id,
      title: entry.title,
      detail: `${entry.detail} · ${entry.environment}`,
      timestamp: Date.parse(entry.occurredAt),
      source: 'LOCAL WORKSPACE',
      kind: entry.kind,
    }))
    const timelineEvents: EventRow[] = timeline.filter((entry) =>
      entry.flagId === selectedFlag.id && entry.environment === selectedFlag.environment &&
      Date.parse(entry.occurredAt) >= start && Date.parse(entry.occurredAt) <= end,
    ).map((entry) => ({
      id: entry.id,
      title: entry.title,
      detail: `${entry.detail} · ${entry.environment}`,
      timestamp: Date.parse(entry.occurredAt),
      source: 'LOCAL WORKSPACE',
      kind: entry.kind,
    }))
    const simulatedSignals: EventRow[] = monitoring.signals.map((signal) => ({
      id: `signal-${signal.id}`,
      title: `${signal.severity === 'critical' ? 'Critical' : 'Warning'} · ${signal.metric} changed`,
      detail: `${signal.change}. ${signal.explanation}`,
      timestamp: monitoring.samples.at(-1)?.timestamp ?? end,
      source: 'SIMULATED SIGNAL',
      kind: signal.severity,
    }))
    return [...localEvents, ...timelineEvents, ...simulatedSignals]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 8)
  }, [selectedFlag, monitoring, timeline, range])

  return <>
    <div className="page-heading monitoring-page-heading">
      <div><div className="eyebrow">RELEASE OBSERVABILITY</div><h1>Release monitoring</h1><p>Track rollout progression, compare metrics with baseline, and review signals before changing exposure.</p></div>
      <div className="heading-action"><span className={`monitoring-data-badge ${readOnly ? 'monitoring-live-badge' : ''}`}><i />{readOnly ? 'FLAGS EVALUATED · NO TELEMETRY' : 'SIMULATED MONITORING'}</span><button className="button button-secondary" onClick={() => onNavigate('Release Risks')}><ShieldAlert size={15} />Release safety</button></div>
    </div>

    {flags.length === 0 ? <section className="panel monitoring-empty-state"><Activity size={24} /><h2>{readOnly ? 'No evaluated flags to inspect' : `No flags configured in ${environment}`}</h2><p>{readOnly ? 'Connect and verify a Flagsmith environment to inspect evaluated flag states. Flagsmith evaluation does not include monitoring telemetry.' : 'Create or configure a feature flag to start exploring release monitoring.'}</p>{!readOnly && <button className="button button-primary" onClick={() => onNavigate('Feature Flags')}>Open feature flags <ArrowRight size={14} /></button>}</section>
      : <section className="panel monitoring-toolbar">
        <label className="monitoring-flag-select"><span>FEATURE FLAG · {environment.toUpperCase()}</span><select value={selectedFlag?.id ?? ''} onChange={(event) => onSelectFlag(event.target.value)} aria-label="Select flag to monitor">{flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name} · {flag.key}</option>)}</select></label>
        {!readOnly && <fieldset className="monitoring-range-control"><legend>TIME RANGE</legend>{monitoringRanges.map((item) => <button type="button" key={item.value} className={range === item.value ? 'range-selected' : ''} aria-pressed={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}</fieldset>}
        {readOnly && <div className="monitoring-live-context"><span className="live-dot" />Verified Flagsmith evaluation · {selectedFlag?.enabled ? 'Enabled' : 'Disabled'} · rollout and telemetry unavailable</div>}
      </section>}

    {selectedFlag && readOnly && <section className="panel monitoring-live-empty">
      <span className="monitoring-empty-icon"><Gauge size={19} /></span><div><h2>Release telemetry is not available from this connection</h2><p>FlagPilot has the evaluated flag state from Flagsmith, but the read-only evaluation endpoint does not return exposure history, request volume, errors, latency, conversion metrics, or deployment activity. No simulated production measurements are shown here.</p></div><button className="button button-secondary" onClick={() => onNavigate('Settings')}>Connection settings <ArrowRight size={14} /></button>
    </section>}

    {selectedFlag && monitoring && <>
      <section className={`panel monitoring-health-summary health-${monitoring.health.toLowerCase()}`}>
        <div className="monitoring-health-icon">{monitoring.health === 'Healthy' ? <ShieldCheck size={20} /> : monitoring.health === 'Critical' ? <AlertTriangle size={20} /> : <ShieldAlert size={20} />}</div>
        <div className="monitoring-health-copy"><div><span className={`monitoring-health-badge health-${monitoring.health.toLowerCase()}`}><i />{monitoring.health} release health</span><span className="monitoring-health-flag">{selectedFlag.name} · {selectedFlag.environment}</span></div><h2>{monitoring.healthExplanation}</h2><p>{monitoring.recommendation}</p><small>Uses deterministic demo metrics and the existing {monitoring.assessmentRisk.toLowerCase()}-risk safety assessment ({monitoring.assessmentScore}/100). A signal is an investigation prompt, not proof this flag caused a change.</small></div>
        <button className="button button-secondary" onClick={() => onNavigate('Release Risks')}>Review safety assessment <ArrowRight size={14} /></button>
      </section>

      <section className="monitoring-metrics-grid" aria-label="Current metrics compared with baseline">
        <MetricCard label="REQUEST VOLUME" value={monitoring.current.requestVolume} unit="" baseline={monitoring.baseline.requestVolume} current={monitoring.current.requestVolume} icon={Activity} />
        <MetricCard label="ERROR RATE" value={monitoring.current.errorRatePercent} unit="%" baseline={monitoring.baseline.errorRatePercent} current={monitoring.current.errorRatePercent} digits={2} icon={AlertTriangle} tone="amber" direction="higher-bad" />
        <MetricCard label="LATENCY" value={monitoring.current.latencyMs} unit=" ms" baseline={monitoring.baseline.latencyMs} current={monitoring.current.latencyMs} icon={Clock3} tone="blue" direction="higher-bad" />
        <MetricCard label="CONVERSION" value={monitoring.current.conversionRatePercent} unit="%" baseline={monitoring.baseline.conversionRatePercent} current={monitoring.current.conversionRatePercent} digits={2} icon={TrendingUp} tone="green" direction="higher-good" />
      </section>

      <section className="panel monitoring-exposure-panel">
        <div className="panel-heading"><div><h2>Rollout progression</h2><p>{selectedFlag.enabled ? 'Current configured exposure' : 'Feature is currently disabled'} · simulated release progression over the selected range</p></div><span className="monitoring-exposure-value">{monitoring.current.exposurePercent}%<small> exposed</small></span></div>
        <div className="monitoring-exposure-track"><span style={{ width: `${monitoring.current.exposurePercent}%` }} /></div>
        <div className="monitoring-stage-rail">{[0, 10, 25, 50, 75, 100].map((stage) => <span key={stage} className={`${monitoring.current.exposurePercent >= stage ? 'stage-reached' : ''} ${monitoring.current.exposurePercent === stage ? 'stage-current' : ''}`}><i />{stage}%</span>)}</div>
        <div className="monitoring-exposure-foot"><span><Users size={14} />Exposure is a local simulation based on this flag's configured rollout. It is not a real user count.</span><button className="text-button" onClick={() => onNavigate('Rollouts')}><GitBranch size={14} />Open rollout simulator <ArrowRight size={13} /></button></div>
      </section>

      <div className="monitoring-chart-grid">
        <MonitoringChart title="Request volume" description="Requests per sample interval" samples={monitoring.samples} metric="requestVolume" color="#9d83ff" range={range} unit="" />
        <MonitoringChart title="Error rate" description="Percentage of simulated requests" samples={monitoring.samples} metric="errorRatePercent" color="#e5a56d" range={range} unit="%" valueDigits={2} />
        <MonitoringChart title="Latency" description="Simulated response time" samples={monitoring.samples} metric="latencyMs" color="#80b7ff" range={range} unit=" ms" />
        <MonitoringChart title="Exposure" description="Feature exposure across simulated stages" samples={monitoring.samples} metric="exposurePercent" color="#77d1a2" range={range} unit="%" />
      </div>

      <div className="monitoring-lower-grid">
        <section className="panel monitoring-signals-panel">
          <div className="panel-heading"><div><h2>Detected signals</h2><p>Deterministic comparisons against the early-window baseline</p></div><span className="monitoring-signal-count">{monitoring.signals.length}</span></div>
          {monitoring.signals.length ? <div className="monitoring-signal-list">{monitoring.signals.map((signal) => <article className={`monitoring-signal signal-${signal.severity}`} key={signal.id}><span>{signal.severity === 'critical' ? <AlertTriangle size={16} /> : <TrendingDown size={16} />}</span><div><div><b>{signal.metric}</b><strong>{signal.change}</strong></div><p>{signal.explanation}</p></div></article>)}</div> : <div className="monitoring-no-signals"><ShieldCheck size={17} /><span><b>No unusual pattern detected</b><small>No configured error, latency, request-volume, or conversion threshold was crossed in this window.</small></span></div>}
          <p className="monitoring-correlation-note">Observed changes can have other causes. Compare cohorts and service logs before drawing conclusions.</p>
        </section>
        <section className="panel monitoring-events-panel">
          <div className="panel-heading"><div><h2>Release activity &amp; signals</h2><p>Flag-related local history plus generated monitoring observations</p></div></div>
          {eventRows.length ? <div className="monitoring-event-list">{eventRows.map((entry) => <article className="monitoring-event" key={entry.id}><span className={`monitoring-event-icon ${entry.source === 'SIMULATED SIGNAL' ? 'event-signal' : ''}`}>{entry.source === 'SIMULATED SIGNAL' ? <AlertTriangle size={14} /> : <GitBranch size={14} />}</span><div><div className="monitoring-event-title"><b>{entry.title}</b><small className={entry.source === 'SIMULATED SIGNAL' ? 'event-source-simulated' : ''}>{entry.source}</small></div><p>{entry.detail}</p><time>{new Date(entry.timestamp).toLocaleString()}</time></div></article>)}</div> : <div className="monitoring-no-events"><Activity size={18} /><b>No events for this flag in the selected window</b><span>Rollout changes and generated signals will appear here when available.</span></div>}
        </section>
      </div>
    </>}
  </>
}
