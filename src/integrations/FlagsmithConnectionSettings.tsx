import { useState } from 'react'
import { AlertTriangle, Check, CircleHelp, Link2, LockKeyhole, LogOut, PlugZap, RefreshCw, ShieldCheck } from 'lucide-react'
import { DEFAULT_FLAGPILOT_BACKEND_URL, normalizeBackendUrl, type IntegrationConfig, type LiveIntegrationConfig } from './config'
import type { IntegrationStatus } from './flagDataSource'
import type { Environment } from '../types'

const environments: Environment[] = ['Development', 'Staging', 'Production']

type Props = {
  config: IntegrationConfig
  status: IntegrationStatus
  error: string
  onConnect: (config: LiveIntegrationConfig) => void
  onDisconnect: () => void
  onRefresh: () => void
}

export function FlagsmithConnectionSettings({ config, status, error, onConnect, onDisconnect, onRefresh }: Props) {
  const [backendUrl, setBackendUrl] = useState(config.mode === 'live' ? config.backendUrl : DEFAULT_FLAGPILOT_BACKEND_URL)
  const [environment, setEnvironment] = useState<Environment>(config.mode === 'live' ? config.environment : 'Production')
  const [formError, setFormError] = useState('')

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setFormError('')
      onConnect({ mode: 'live', backendUrl: normalizeBackendUrl(backendUrl), environment })
    } catch (validationError) {
      setFormError(validationError instanceof Error ? validationError.message : 'Backend URL is invalid.')
    }
  }

  function disconnect() {
    setBackendUrl(DEFAULT_FLAGPILOT_BACKEND_URL)
    setFormError('')
    onDisconnect()
  }

  return <section className="panel flagsmith-connection-panel">
    <header className="flagsmith-connection-header">
      <span className="flagsmith-connection-mark"><PlugZap size={17} /></span>
      <div><h2>Flagsmith connection</h2><p>Connect through the read-only FlagPilot backend.</p></div>
      <span className={`flagsmith-connection-status ${config.mode === 'live' ? status : 'demo'}`}><i />{config.mode === 'demo' ? 'DEMO MODE' : status === 'ready' ? 'CONNECTED' : status === 'loading' ? 'CONNECTING' : 'CONNECTION ERROR'}</span>
    </header>

    {config.mode === 'live' && status === 'ready' && <div className="flagsmith-connected-callout"><ShieldCheck size={15} /><span><b>Environment key verified.</b> Live flags are evaluated using the backend key mapped to {config.environment}.</span><button type="button" className="button button-quiet" onClick={onRefresh}><RefreshCw size={13} />Refresh flags</button></div>}
    {config.mode === 'live' && status === 'error' && <div className="flagsmith-error-callout"><AlertTriangle size={15} /><span><b>Connection failed.</b> {error || 'Check that the backend is running and its Flagsmith configuration is valid.'} No demo flags are shown as live data.</span></div>}
    {formError && <div className="flagsmith-error-callout"><AlertTriangle size={15} /><span>{formError}</span></div>}

    <form className="flagsmith-connection-form" onSubmit={connect}>
      <label className="form-field"><span>FLAGPILOT BACKEND URL</span>
        <div className="flagsmith-url-field"><Link2 size={13} /><input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} placeholder={DEFAULT_FLAGPILOT_BACKEND_URL || 'https://your-backend.onrender.com'} aria-label="FlagPilot backend URL" /></div>
        <small>{DEFAULT_FLAGPILOT_BACKEND_URL ? 'Using the configured backend URL. The backend verifies its Flagsmith connection before returning evaluated flags.' : 'Enter the deployed backend URL, or set VITE_FLAGPILOT_BACKEND_URL in your frontend hosting settings. Demo Mode does not require a backend.'}</small>
      </label>
      <label className="form-field"><span>FLAGSMITH ENVIRONMENT</span>
        <select value={environment} onChange={(event) => setEnvironment(event.target.value as Environment)} aria-label="Flagsmith environment">
          {environments.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <small>The backend uses the matching Flags API Environment Key configured for this environment. FlagPilot keeps the key on the backend.</small>
      </label>
      <div className="flagsmith-security-note"><LockKeyhole size={14} /><span><b>No Flagsmith key is entered in this browser.</b> Configure the Flags API Environment Key in backend environment settings (<code>backend/.env</code> locally, or your hosting dashboard when deployed). Never use an Organisation API token here.</span></div>
      <div className="flagsmith-security-note"><CircleHelp size={14} /><span><b>Read-only by design.</b> The backend exposes environment evaluation only. It has no project admin token and cannot create, edit, toggle, or roll back remote flags.</span></div>
      <footer className="flagsmith-connection-actions">
        <span>{config.mode === 'live' ? `Backend: ${config.backendUrl}` : 'Demo Mode is fully available without a backend or a Flags API Environment Key.'}</span>
        <div>{config.mode === 'live' && <button type="button" className="button button-quiet" onClick={disconnect}><LogOut size={13} />Disconnect</button>}<button type="submit" className="button button-primary" disabled={status === 'loading' && config.mode === 'live'}>{status === 'ready' && config.mode === 'live' ? <><Check size={14} />Reconnect</> : <><PlugZap size={14} />{config.mode === 'live' ? 'Connect again' : 'Connect to Flagsmith'}</>}</button></div>
      </footer>
    </form>
  </section>
}
