import { useMemo, useState } from 'react'
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Check, CircleHelp, Clock3, Gauge, GitBranch, HeartPulse, RotateCcw, ShieldAlert,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import { stages } from '../data/mock'
import type {
  ActivityEntry, Environment, FeatureFlag, ReleaseTimelineEntry, Risk,
} from '../types'
import {
  assessRelease, projectRelease, type ReleaseAssessment, type ReleaseDecision,
} from './releaseSafety'
import {
  analyzeReleaseSafety, type ReleaseSafetyAnalysis,
} from './releaseSafetyAgent'

type Props = {
  flags: FeatureFlag[]
  environment: Environment
  activity: ActivityEntry[]
  timeline: ReleaseTimelineEntry[]
  readOnly: boolean
  selectedFlagId?: string
  onEvaluate: (flag: FeatureFlag, assessment: ReleaseAssessment) => void
  onDecision: (flag: FeatureFlag, decision: ReleaseDecision, target: number, projected: ReleaseAssessment) => void
}

function RiskPill({ risk }: { risk: Risk }) {
  return <span className={`safety-risk-pill safety-risk-${risk.toLowerCase()}`}><i />{risk} risk</span>
}

function SafetyProgress({ value, risk }: { value: number; risk: Risk }) {
  return <div className={`safety-progress safety-progress-${risk.toLowerCase()}`}><span style={{ width: `${value}%` }} /></div>
}

function formatTime(value: string): string {
  const date = new Date(value)
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

const timelineIcons = {
  stage: GitBranch,
  health: HeartPulse,
  risk: ShieldAlert,
  decision: Activity,
  rollback: RotateCcw,
}

function getTarget(flag: FeatureFlag, decision: ReleaseDecision, assessment: ReleaseAssessment): number {
  if (decision === 'continue') return stages.find((stage) => stage > flag.rollout) ?? flag.rollout
  if (decision === 'reduce') return assessment.recommendation.decision === 'reduce'
    ? assessment.recommendation.target
    : Math.max(flag.rollout > 0 ? 1 : 0, flag.rollout - 25)
  if (decision === 'rollback') return 0
  return flag.rollout
}

export function ReleaseSafetyPage({
  flags, environment, activity, timeline, readOnly, selectedFlagId, onEvaluate, onDecision,
}: Props) {
  const [selectedId, setSelectedId] = useState(
    selectedFlagId && flags.some((flag) => flag.id === selectedFlagId) ? selectedFlagId : flags[0]?.id ?? '',
  )
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [agentAnalysis, setAgentAnalysis] = useState<{ flagId: string; result: ReleaseSafetyAnalysis } | null>(null)
  const selectedFlag = flags.find((flag) => flag.id === selectedId) ?? flags[0]

  const assessment = useMemo(
    () => selectedFlag ? assessRelease(selectedFlag, activity) : null,
    [selectedFlag, activity],
  )
  const selectedTimeline = selectedFlag
    ? timeline.filter((entry) => entry.flagId === selectedFlag.id).slice(0, 12)
    : []
  const projections = useMemo(() => {
    if (!selectedFlag || !assessment) return []
    return (['continue', 'hold', 'reduce', 'rollback'] as const).map((decision) => {
      const target = getTarget(selectedFlag, decision, assessment)
      const projectedFlag = projectRelease(selectedFlag, decision, target)
      return { decision, target, assessment: assessRelease(projectedFlag, activity) }
    })
  }, [selectedFlag, assessment, activity])

  function applyDecision(decision: ReleaseDecision) {
    if (!selectedFlag || !assessment) return
    if (decision === 'rollback') {
      setConfirmRollback(true)
      return
    }
    const target = getTarget(selectedFlag, decision, assessment)
    const projected = assessRelease(projectRelease(selectedFlag, decision, target), activity)
    onDecision(selectedFlag, decision, target, projected)
  }

  function confirmRollbackAction() {
    if (!selectedFlag) return
    const projected = assessRelease(projectRelease(selectedFlag, 'rollback', 0), activity)
    onDecision(selectedFlag, 'rollback', 0, projected)
    setConfirmRollback(false)
  }

  function runAgentAnalysis() {
    if (!selectedFlag || !assessment) return
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const matchingChanges = activity
      .filter((entry) => {
        const occurredAt = new Date(entry.occurredAt).getTime()
        const text = `${entry.title} ${entry.detail}`.toLowerCase()
        return Number.isFinite(occurredAt) && occurredAt >= cutoff &&
          (text.includes(selectedFlag.name.toLowerCase()) || text.includes(selectedFlag.key.toLowerCase()))
      })
      .map((entry) => ({ description: `${entry.title}: ${entry.detail}`, occurredAt: entry.occurredAt }))
    const result = analyzeReleaseSafety({
      flag: {
        name: selectedFlag.name,
        purpose: selectedFlag.description,
        key: selectedFlag.key,
        enabled: selectedFlag.enabled,
        rolloutPercent: selectedFlag.rollout,
        targetEnvironment: selectedFlag.environment,
        configuration: {
          configuredInEnvironment: true,
          targetingRuleCount: selectedFlag.targetingRules?.filter((rule) => rule.enabled).length ?? 0,
        },
      },
      recentChanges: matchingChanges,
      metrics: {
        errorRatePercent: assessment.metrics.errorRate,
        latencyMs: assessment.metrics.latencyMs,
        conversionRatePercent: assessment.metrics.conversionRate,
        successfulRequests: assessment.metrics.successfulRequests,
        failedRequests: assessment.metrics.failedRequests,
      },
      riskAssessment: {
        level: assessment.risk,
        score: assessment.score,
        reasons: assessment.reasons,
      },
      dataProvenance: 'simulated',
    })
    setAgentAnalysis({ flagId: selectedFlag.id, result })
  }

  if (readOnly) {
    return <>
      <header className="page-heading"><div><div className="eyebrow">RELEASE SAFETY INTELLIGENCE</div><h1>Release safety</h1><p>Understand rollout risk before increasing exposure.</p></div></header>
      <section className="panel safety-unavailable">
        <span className="safety-unavailable-icon"><CircleHelp size={20} /></span>
        <div><h2>Safety simulation is available in Demo Mode</h2><p>The Flagsmith evaluation API does not provide rollout history, health telemetry, or deployment risk signals. FlagPilot will not infer live risk or simulate rollback against live flags. Switch to Demo Mode to explore the deterministic safety model.</p></div>
        <span className="simulation-tag">NO LIVE TELEMETRY</span>
      </section>
    </>
  }

  if (!selectedFlag || !assessment) {
    return <>
      <header className="page-heading"><div><div className="eyebrow">RELEASE SAFETY INTELLIGENCE</div><h1>Release safety</h1><p>Understand rollout risk before increasing exposure.</p></div></header>
      <section className="panel safety-empty"><ShieldCheck size={23} /><b>No flags in {environment}</b><span>Create or switch to an environment with feature flags to assess a release.</span></section>
    </>
  }

  const { metrics, recommendation } = assessment
  const nextStage = getTarget(selectedFlag, 'continue', assessment)
  const changedAt = activity.find((entry) => `${entry.title} ${entry.detail}`.toLowerCase().includes(selectedFlag.name.toLowerCase()))

  return <>
    <header className="page-heading safety-page-heading">
      <div><div className="eyebrow">RELEASE SAFETY INTELLIGENCE · DEMO SIMULATION</div><h1>Release safety</h1><p>Evaluate rollout exposure, simulated health, and recent changes before your next release decision.</p></div>
      <div className="safety-heading-controls">
        <label className="filter-select safety-flag-select"><GitBranch size={14} /><select aria-label="Select release flag" value={selectedFlag.id} onChange={(event) => { setSelectedId(event.target.value); setAgentAnalysis(null) }}>{flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name} · {flag.environment}</option>)}</select></label>
        <button className="button button-quiet" onClick={() => onEvaluate(selectedFlag, assessment)}><Activity size={14} />Evaluate health</button>
      </div>
    </header>

    <div className={`safety-disclaimer ${assessment.risk === 'High' ? 'safety-disclaimer-high' : ''}`}>
      <Sparkles size={14} /><span><b>Simulated release signals.</b> These deterministic estimates are for the demo only—not production telemetry or a Flagsmith health connection.</span>
      <span className="safety-updated"><Clock3 size={12} />{changedAt ? `Recent change ${formatTime(changedAt.occurredAt)}` : 'No recent change recorded'}</span>
    </div>

    <section className="panel safety-agent-panel" aria-labelledby="safety-agent-title">
      <div className="safety-agent-heading">
        <span className="safety-agent-icon"><Sparkles size={17} /></span>
        <div><h2 id="safety-agent-title">Release Safety Agent</h2><p>Analyze the selected flag with structured context and a read-only local fallback.</p></div>
        <span className="safety-agent-mode">LOCAL RULE-BASED · NO AI MODEL</span>
      </div>
      <div className="safety-agent-controls">
        <span>Input source: <b>simulated FlagPilot demo data</b></span>
        <button type="button" className="button button-primary" onClick={runAgentAnalysis}><Sparkles size={14} />Analyze selected flag</button>
      </div>
      <p className="safety-agent-guardrail">Analysis only. This does not query Flagsmith, apply a rollout, or perform a rollback. Any release change requires a separate authorized workflow and explicit human confirmation.</p>
      {agentAnalysis?.flagId === selectedFlag.id && <AgentAnalysisResult analysis={agentAnalysis.result} />}
    </section>

    <section className={`panel safety-assessment safety-assessment-${assessment.risk.toLowerCase()}`}>
      <div className="safety-assessment-main">
        <div className="safety-assessment-top">
          <div className="safety-assessment-title"><span className="safety-shield"><ShieldAlert size={18} /></span><div><span className="eyebrow">CURRENT RELEASE ASSESSMENT</span><h2>{selectedFlag.name}</h2><span className="safety-flag-meta"><code>{selectedFlag.key}</code><i className={`env-dot ${selectedFlag.environment.toLowerCase()}`} />{selectedFlag.environment}<span>·</span>{selectedFlag.enabled ? 'Enabled' : 'Disabled'}</span></div></div>
          <RiskPill risk={assessment.risk} />
        </div>
        <div className="safety-score-row"><div><span>Risk score</span><b>{assessment.score}<small> / 100</small></b></div><SafetyProgress value={assessment.score} risk={assessment.risk} /><span className="safety-rollout-value">{selectedFlag.rollout}% rollout</span></div>
        <div className="safety-stage-progress" aria-label={`Rollout progression at ${selectedFlag.rollout}%`}>
          {stages.map((stage, index) => <span className={selectedFlag.rollout >= stage ? 'stage-reached' : ''} key={stage}><i />{stage}%{index === stages.length - 1 ? ' · GA' : ''}</span>)}
        </div>
        <div className="safety-reasons"><b>Why this score?</b><ul>{assessment.reasons.map((reason) => <li key={reason}><span />{reason}</li>)}</ul></div>
      </div>
      <aside className="safety-recommendation">
        <div className="safety-recommendation-label"><span><Sparkles size={13} />RECOMMENDED ACTION</span><RiskPill risk={assessment.risk} /></div>
        <h3>{recommendation.title}</h3><p>{recommendation.reason}</p>
        <div className="safety-recommendation-impact"><span>Suggested exposure</span><b>{recommendation.target}%</b></div>
        <button className={`button ${recommendation.decision === 'rollback' ? 'button-danger' : 'button-primary'}`} onClick={() => applyDecision(recommendation.decision)} disabled={recommendation.decision === 'continue' && nextStage === selectedFlag.rollout}>
          {recommendation.decision === 'rollback' ? <RotateCcw size={14} /> : recommendation.decision === 'hold' ? <Check size={14} /> : recommendation.decision === 'reduce' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
          {recommendation.decision === 'continue' ? `Apply suggested stage · ${recommendation.target}%` : recommendation.decision === 'hold' ? 'Record hold decision' : recommendation.decision === 'reduce' ? `Apply reduction · ${recommendation.target}%` : 'Review rollback'}
        </button>
      </aside>
    </section>

    <div className="safety-section-heading"><div><h2>Release health metrics</h2><p>Deterministic estimates respond to rollout, environment, flag state, and recent changes.</p></div><span className="simulation-tag"><span />SIMULATED</span></div>
    <section className="safety-metrics-grid">
      <article className="panel safety-metric-card"><div className="safety-metric-title"><span className="safety-metric-icon error"><AlertTriangle size={15} /></span><span>Error rate</span><span className={metrics.errorRate >= 0.75 ? 'metric-warning' : 'metric-good'}>{metrics.errorRate >= 0.75 ? 'Elevated' : 'Nominal'}</span></div><b>{metrics.errorRate.toFixed(2)}<small>%</small></b><small className="safety-metric-foot">Simulated failed requests</small><div className="safety-metric-track"><span style={{ width: `${Math.min(metrics.errorRate / 1.5 * 100, 100)}%` }} /></div></article>
      <article className="panel safety-metric-card"><div className="safety-metric-title"><span className="safety-metric-icon latency"><Gauge size={15} /></span><span>Latency</span><span className={metrics.latencyMs >= 300 ? 'metric-warning' : 'metric-good'}>{metrics.latencyMs >= 300 ? 'Watch' : 'Stable'}</span></div><b>{metrics.latencyMs}<small> ms</small></b><small className="safety-metric-foot">Estimated response time</small><div className="safety-metric-track latency-track"><span style={{ width: `${Math.min(metrics.latencyMs / 500 * 100, 100)}%` }} /></div></article>
      <article className="panel safety-metric-card"><div className="safety-metric-title"><span className="safety-metric-icon success"><Check size={15} /></span><span>Successful requests</span><span className="metric-good">Simulated</span></div><b>{metrics.successfulRequests.toLocaleString()}</b><small className="safety-metric-foot">of {metrics.totalRequests.toLocaleString()} requests</small><div className="safety-metric-track success-track"><span style={{ width: `${metrics.successfulRequests / metrics.totalRequests * 100}%` }} /></div></article>
      <article className="panel safety-metric-card"><div className="safety-metric-title"><span className="safety-metric-icon failed"><AlertOctagon size={15} /></span><span>Failed requests</span><span className={metrics.errorRate >= 0.75 ? 'metric-warning' : 'metric-neutral'}>Simulated</span></div><b>{metrics.failedRequests.toLocaleString()}</b><small className="safety-metric-foot">{metrics.errorRate.toFixed(2)}% of estimated volume</small><div className="safety-metric-track failed-track"><span style={{ width: `${Math.max(metrics.failedRequests / metrics.totalRequests * 100, 1)}%` }} /></div></article>
      <article className="panel safety-metric-card safety-conversion-card"><div className="safety-metric-title"><span className="safety-metric-icon conversion"><ArrowUpRight size={15} /></span><span>Engagement indicator</span><span className="metric-good">Simulated</span></div><b>{metrics.conversionRate.toFixed(2)}<small>%</small></b><small className="safety-metric-foot">Estimated conversion rate · positive direction</small><div className="safety-engagement-bars" aria-label="Simulated engagement trend"><i style={{ height: '34%' }} /><i style={{ height: '47%' }} /><i style={{ height: '42%' }} /><i style={{ height: '58%' }} /><i style={{ height: '53%' }} /><i style={{ height: '70%' }} /><i style={{ height: `${Math.min(78 + selectedFlag.rollout / 5, 96)}%` }} /></div></article>
    </section>

    <div className="safety-section-heading"><div><h2>Decision preview</h2><p>Compare the estimated impact before applying any simulated action.</p></div></div>
    <section className="safety-decisions-grid">
      {projections.map(({ decision, target, assessment: projection }) => {
        const content = {
          continue: { title: 'Continue rollout', icon: ArrowUpRight, detail: nextStage === selectedFlag.rollout ? 'Already at the final stage' : `Advance exposure to ${target}%` },
          hold: { title: 'Hold rollout', icon: Check, detail: `Keep exposure at ${selectedFlag.rollout}%` },
          reduce: { title: 'Reduce rollout', icon: ArrowDownRight, detail: `Lower exposure to ${target}%` },
          rollback: { title: 'Simulate rollback', icon: RotateCcw, detail: 'Disable flag and stop exposure' },
        }[decision]
        const Icon = content.icon
        return <article className={`panel safety-decision-card ${decision === 'rollback' ? 'decision-rollback' : ''}`} key={decision}>
          <div className="safety-decision-title"><span><Icon size={15} /></span><b>{content.title}</b></div>
          <p>{content.detail}</p>
          <div className="safety-decision-projection"><span>Projected risk</span><RiskPill risk={projection.risk} /></div>
          <div className="safety-projection-line"><span>Projected errors</span><b>{projection.metrics.errorRate.toFixed(2)}%</b></div>
          <div className="safety-projection-line"><span>Projected latency</span><b>{projection.metrics.latencyMs} ms</b></div>
          <button type="button" className={`button ${decision === 'rollback' ? 'button-danger' : 'button-quiet'}`} onClick={() => applyDecision(decision)} disabled={decision === 'continue' && nextStage === selectedFlag.rollout || decision === 'reduce' && target === selectedFlag.rollout || decision === 'rollback' && !selectedFlag.enabled}>
            {decision === 'rollback' ? 'Review rollback' : decision === 'continue' ? `Apply ${target}% stage` : decision === 'reduce' ? `Apply ${target}% reduction` : 'Hold at current stage'}<ArrowRight size={13} />
          </button>
        </article>
      })}
    </section>

    <section className="panel safety-timeline-panel">
      <div className="safety-timeline-heading"><div><span className="safety-timeline-icon"><Clock3 size={15} /></span><div><h2>Release timeline</h2><p>Rollout stages, health checks, risk changes, and decisions for {selectedFlag.name}.</p></div></div><button className="button button-quiet" onClick={() => onEvaluate(selectedFlag, assessment)}><HeartPulse size={14} />Run health check</button></div>
      {selectedTimeline.length ? <ol className="safety-timeline">{selectedTimeline.map((entry) => {
        const Icon = timelineIcons[entry.kind]
        return <li className={`safety-timeline-entry timeline-${entry.kind}`} key={entry.id}><span className="safety-timeline-node"><Icon size={13} /></span><div className="safety-timeline-copy"><div><b>{entry.title}</b>{entry.risk && <RiskPill risk={entry.risk} />}</div><span>{entry.detail}</span><time>{formatTime(entry.occurredAt)}</time></div></li>
      })}</ol> : <div className="safety-timeline-empty"><HeartPulse size={19} /><b>No release events yet</b><span>Run a health check or make a rollout decision to start this release timeline.</span><button className="text-button" onClick={() => onEvaluate(selectedFlag, assessment)}>Evaluate this release <ArrowRight size={13} /></button></div>}
    </section>

    {confirmRollback && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRollback(false) }}><section className="modal safety-rollback-modal" role="dialog" aria-modal="true" aria-labelledby="rollback-title">
      <div className="modal-header"><span className="kill-modal-icon"><RotateCcw size={19} /></span><div><h2 id="rollback-title">Confirm simulated rollback</h2><p>This disables the feature in the local demo workspace.</p></div><button className="modal-close" aria-label="Close dialog" onClick={() => setConfirmRollback(false)}><X size={17} /></button></div>
      <div className="safety-rollback-impact"><b>{selectedFlag.name}</b><span><Users size={13} />Exposure will move from {selectedFlag.enabled ? `${selectedFlag.rollout}%` : '0%'} to 0%; the flag will be disabled.</span><span><ShieldCheck size={13} />The rollback and health evaluation will be recorded in the activity log.</span></div>
      <div className="modal-actions"><button className="button button-quiet" onClick={() => setConfirmRollback(false)}>Cancel</button><button className="button button-danger" onClick={confirmRollbackAction}><RotateCcw size={14} />Confirm simulated rollback</button></div>
    </section></div>}
  </>
}

function AgentAnalysisResult({ analysis }: { analysis: ReleaseSafetyAnalysis }) {
  const recommendationClass = analysis.recommendation.toLowerCase().replaceAll(' ', '-')
  return <div className="safety-agent-result" aria-live="polite">
    <div className={`safety-agent-recommendation recommendation-${recommendationClass}`}>
      <span className="eyebrow">SKILL-GUIDED LOCAL ANALYSIS · {analysis.dataProvenance.toUpperCase()} INPUT</span>
      <b>{analysis.recommendation}</b>
      <p>{analysis.summary}</p>
    </div>
    <div className="safety-agent-detail-grid">
      <div><h3>Reasoning</h3><ul>{analysis.reasoning.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div><h3>Risk signals</h3>{analysis.riskSignals.length
        ? <ul>{analysis.riskSignals.map((item) => <li key={item}>{item}</li>)}</ul>
        : <p>No risk signals were identified in the supplied context.</p>}</div>
      <div><h3>Missing information</h3>{analysis.missingInformation.length
        ? <ul>{analysis.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
        : <p>No required information was missing from this analysis.</p>}</div>
    </div>
    <p className="safety-agent-rerun-hint">The analysis uses the data available at run time. Re-run it after changing the flag or adding context.</p>
  </div>
}
