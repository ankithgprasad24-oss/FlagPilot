import {
  Activity, Flag, FlaskConical, GitBranch, Layers3, LayoutDashboard, Settings, ShieldAlert,
  Zap,
} from 'lucide-react'
import type { ActivityEntry, Environment, Experiment, FeatureFlag, Page } from '../types'

export const environments: Environment[] = ['Development', 'Staging', 'Production']
export const stages = [10, 25, 50, 75, 100]
export const audience: Record<Environment, number> = { Development: 1200, Staging: 8400, Production: 48200 }

export const navItems: { label: Page; icon: typeof LayoutDashboard; section?: string }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Feature Flags', icon: Flag, section: 'WORKSPACE' },
  { label: 'Rollouts', icon: GitBranch },
  { label: 'Release Monitoring', icon: Activity },
  { label: 'Experiments', icon: FlaskConical },
  { label: 'Environments', icon: Layers3, section: 'MANAGE' },
  { label: 'Release Risks', icon: ShieldAlert },
  { label: 'Kill Switch', icon: Zap, section: 'SAFETY' },
  { label: 'Activity Log', icon: Activity },
  { label: 'Settings', icon: Settings, section: 'PREFERENCES' },
]

export const initialFlags: FeatureFlag[] = [
  { id: '1', name: 'New checkout experience', description: 'Redesigned one-page checkout flow', key: 'checkout_v2', flagType: 'Boolean', value: true, targetingRules: [], enabled: true, environment: 'Production', rollout: 50, modified: '2 min ago', owner: 'Ankith', risk: 'Medium' },
  { id: '2', name: 'AI search recommendations', description: 'Personalized, AI-powered product discovery', key: 'ai_search', flagType: 'Boolean', value: true, targetingRules: [], enabled: true, environment: 'Staging', rollout: 25, modified: '18 min ago', owner: 'Marcus Lee', risk: 'Low' },
  { id: '3', name: 'Instant payouts', description: 'Same-day payouts for marketplace sellers', key: 'instant_payouts', flagType: 'Boolean', value: true, targetingRules: [], enabled: true, environment: 'Production', rollout: 10, modified: '1 hour ago', owner: 'Amara Okafor', risk: 'High' },
  { id: '4', name: 'Navigation refresh', description: 'Updated navigation and workspace switcher', key: 'nav_refresh', flagType: 'Boolean', value: false, targetingRules: [], enabled: false, environment: 'Development', rollout: 0, modified: '3 hours ago', owner: 'Jamie Park', risk: 'Low' },
  { id: '5', name: 'Usage-based billing', description: 'Metered billing for API customers', key: 'usage_billing', flagType: 'Number', value: 1, targetingRules: [], enabled: true, environment: 'Staging', rollout: 75, modified: 'Yesterday', owner: 'Ankith', risk: 'Medium' },
  { id: '6', name: 'Team analytics', description: 'Shared analytics for organization admins', key: 'team_analytics', flagType: 'String', value: 'enabled', targetingRules: [], enabled: true, environment: 'Production', rollout: 100, modified: 'Yesterday', owner: 'Theo Martin', risk: 'Low' },
  { id: '7', name: 'Dark mode', description: 'A new, easier-on-the-eyes interface', key: 'dark_mode', flagType: 'JSON', value: { theme: 'dark', density: 'comfortable' }, targetingRules: [], enabled: true, environment: 'Development', rollout: 100, modified: '2 days ago', owner: 'Jamie Park', risk: 'Low' },
]

export const initialActivity: ActivityEntry[] = [
  { id: 'activity-1', title: 'Checkout v2 rollout increased to 50%', detail: 'Ankith · New checkout experience', environment: 'Production', occurredAt: new Date(Date.now() - 2 * 60_000).toISOString(), kind: 'rollout' },
  { id: 'activity-2', title: 'Payment API health check passed', detail: 'Automated health check', environment: 'Production', occurredAt: new Date(Date.now() - 14 * 60_000).toISOString(), kind: 'flag' },
  { id: 'activity-3', title: 'Search ranking experiment started', detail: 'Marcus Lee · Search ranking v2', environment: 'Staging', occurredAt: new Date(Date.now() - 38 * 60_000).toISOString(), kind: 'flag' },
  { id: 'activity-4', title: 'Instant payouts enabled', detail: 'Amara Okafor · Instant payouts', environment: 'Production', occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(), kind: 'flag' },
]

export const initialExperiments: Experiment[] = [
  { name: 'Search ranking v2', key: 'search_ranking_exp', status: 'Running', variants: ['Control', 'Smart ranking'], traffic: [50, 50], conversion: ['4.82%', '5.61%'], lift: '+16.4%', owner: 'Marcus Lee', color: 'blue', users: '12,840' },
  { name: 'Onboarding flow', key: 'onboarding_flow_exp', status: 'Running', variants: ['Original', 'Short form'], traffic: [40, 60], conversion: ['32.1%', '36.8%'], lift: '+14.6%', owner: 'Ankith', color: 'violet', users: '8,240' },
  { name: 'Pricing page CTA', key: 'pricing_cta_exp', status: 'Completed', variants: ['Get started', 'Start free trial'], traffic: [50, 50], conversion: ['8.18%', '7.94%'], lift: '−2.9%', owner: 'Theo Martin', color: 'amber', users: '18,105' },
]
