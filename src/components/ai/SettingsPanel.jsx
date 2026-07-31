import { useState } from 'react'
import { Card, CardHeader, Switch, Select, Input, Button, Icon, EmptyState } from '../ui'
import { useAIGovernance } from '../../lib/ai/governance'
import { loadOrgPrompts, saveOrgPrompt, deleteOrgPrompt } from '../../lib/ai/promptLibrary'
import { AI_ACTIONS, getAiAction } from '../../lib/ai/prompts'

const WORKSPACE_LABELS = { candidates: 'Candidates', jobs: 'Jobs', pipeline: 'Pipeline', tasks: 'Tasks & Targets', communication: 'Communication' }
const FEATURE_LABELS = { chat: 'Copilot Chat', actions: 'AI Actions', automations: 'AI Automations' }

/**
 * Part 3 (Governance) + Part 5 (Team AI) combined into one Settings
 * surface. Everything here is functional where it honestly can be
 * client-side (features/workspace toggles, streaming, response style,
 * usage limit) and clearly disclosed where it can't be (model routing,
 * cross-device team sync) rather than faking capability that needs a
 * backend this phase isn't allowed to add.
 */
export default function SettingsPanel({ orgId, userName }) {
  const { settings, updateSettings } = useAIGovernance(orgId)
  const [orgPrompts, setOrgPrompts] = useState(() => loadOrgPrompts(orgId))
  const [newPromptContent, setNewPromptContent] = useState('')
  const [newPromptAction, setNewPromptAction] = useState('draft')

  const refreshOrgPrompts = () => setOrgPrompts(loadOrgPrompts(orgId))
  const addOrgPrompt = () => {
    if (!newPromptContent.trim()) return
    saveOrgPrompt(orgId, { content: newPromptContent, actionId: newPromptAction, addedBy: userName || 'Recruiter' })
    setNewPromptContent('')
    refreshOrgPrompts()
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Card>
        <CardHeader title="Enabled AI Features" subtitle="Turn AI Center surfaces on or off" />
        <div className="flex flex-col gap-3">
          {Object.entries(settings.features).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-text2">{FEATURE_LABELS[key] || key}</span>
              <Switch checked={value} onChange={(v) => updateSettings({ features: { ...settings.features, [key]: v } })} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Workspace AI Permissions" subtitle="Show or hide the AI tab inside each workspace" />
        <div className="flex flex-col gap-3">
          {Object.entries(settings.workspaces).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-text2">{WORKSPACE_LABELS[key] || key}</span>
              <Switch checked={value} onChange={(v) => updateSettings({ workspaces: { ...settings.workspaces, [key]: v } })} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Model & Behavior" />
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1.5">Preferred Provider</label>
            <div className="w-full sm:w-64">
              <Select
                value={settings.modelPreference}
                onChange={(v) => updateSettings({ modelPreference: v })}
                options={[{ value: 'auto', label: 'Auto (Gemini, Groq fallback)' }, { value: 'gemini', label: 'Gemini' }, { value: 'groq', label: 'Groq' }]}
              />
            </div>
            <p className="text-[11px] text-text3 mt-1.5">Requests always try Gemini first with automatic Groq fallback for reliability today. This preference is saved for when provider routing becomes configurable server-side.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1.5">Default Response Style</label>
            <div className="w-full sm:w-64">
              <Select
                value={settings.responseStyle}
                onChange={(v) => updateSettings({ responseStyle: v })}
                options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]}
              />
            </div>
            <p className="text-[11px] text-text3 mt-1.5">Applied to every Copilot chat reply.</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-text2 block">Streaming Responses</span>
              <span className="text-[11px] text-text3">Show Copilot's answer as it's generated instead of all at once</span>
            </div>
            <Switch checked={settings.streamingEnabled} onChange={(v) => updateSettings({ streamingEnabled: v })} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="AI Usage Limits" subtitle="A soft daily limit enforced in this browser" />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-32">
            <Input type="number" min="0" value={settings.dailyRequestLimit ?? ''} onChange={(e) => updateSettings({ dailyRequestLimit: e.target.value ? parseInt(e.target.value, 10) : null })} placeholder="No limit" />
          </div>
          <span className="text-xs text-text3">requests per day (leave blank for unlimited)</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Organization Prompt Library" subtitle="Shared team templates — stored on this device until organization-wide sync is available" />
        <div className="flex flex-col gap-2 mb-3">
          {orgPrompts.length === 0 ? (
            <p className="text-xs text-text3">No team templates yet — add one below.</p>
          ) : orgPrompts.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface2 border border-border px-2.5 py-2">
              <Icon name={getAiAction(p.actionId).icon} size={12} className="text-accent shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-text truncate">{p.title}</div>
                <div className="text-[10px] text-text3">Added by {p.addedBy}</div>
              </div>
              <button type="button" onClick={() => { deleteOrgPrompt(orgId, p.id); refreshOrgPrompts() }} aria-label="Delete" className="text-text3 hover:text-red shrink-0">
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="w-full sm:w-44">
            <Select value={newPromptAction} onChange={setNewPromptAction} options={AI_ACTIONS.map(a => ({ value: a.id, label: a.label }))} />
          </div>
          <Input value={newPromptContent} onChange={e => setNewPromptContent(e.target.value)} placeholder="Prompt content to share with the team..." className="flex-1 min-w-[180px]" />
          <Button size="sm" variant="secondary" onClick={addOrgPrompt} disabled={!newPromptContent.trim()}>Add</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Team AI Usage" subtitle="Recommended templates and team activity" />
        <EmptyState icon="users" title="Team usage requires centralized tracking" description="This isn't available without backend persistence yet — usage is currently tracked per browser. The storage architecture (organization-scoped keys) is already shaped for it." />
      </Card>
    </div>
  )
}
