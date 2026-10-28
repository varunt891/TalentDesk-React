import { useEffect, useReducer, useRef, useState } from 'react'
import { Badge, Button, Drawer, Icon } from '../ui'
import AIResultCard from './AIResultCard'
import SalaryAnalysisPanel from './SalaryAnalysisPanel'
import DraftRecordActions from './DraftRecordActions'
import { AI_CATEGORIES } from '../../lib/ai/categories'
import { AI_ACTIONS } from '../../lib/ai/prompts'
import { HIRING_USE_CASES, buildHiringToolRequest, createHiringSession, getHiringCategory, getHiringAction, hiringRunLabel, hiringSelectionKey, hiringSessionReducer, hiringSourceRequirements, prepareHiringToolResult, validateHiringSession } from '../../lib/ai/hiringTools'
import { candidateName, isSourcedCandidate } from '../../lib/ai/recruitingWorkbench'
import { streamAiAction, streamAiGenerate } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'
import { exportResultToDocx, exportResultToPdf } from '../../lib/ai/exportResult'
import { normalizeAiPlainText } from '../../lib/aiTextFormat'

const initialSelection = { kind: 'action', id: 'summarize', actionId: 'summarize' }
const initialKey = hiringSelectionKey(initialSelection)
const hiringActions = AI_ACTIONS.map(item => item.id === 'recommend'
  ? { id: 'boolean_search', label: 'Boolean', icon: 'search', workflow: true }
  : item)

export default function HiringTools({ launch, orgId, userId, userName, timezone, workspace, aiSettings, overLimit, onResult, onSavePrompt, onLaunchChat, onNavigate, favorites, onToggleFavorite, active = true }) {
  const [state, dispatch] = useReducer(hiringSessionReducer, { activeKey: initialKey, sessions: { [initialKey]: createHiringSession(initialSelection) } })
  const [browserOpen, setBrowserOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [copied, setCopied] = useState(false)
  const requestRef = useRef(null)
  const session = state.sessions[state.activeKey]
  const { selection } = session
  const category = selection.kind === 'workflow' ? getHiringCategory(selection.id) : null
  const action = getHiringAction(selection.actionId)
  const label = category?.label || action?.label || 'Hiring tool'
  const running = session.phase === 'running'
  const requirements = hiringSourceRequirements(selection)
  const comparing = selection.actionId === 'compare'
  const candidateComparison = selection.comparisonMode === 'candidate_vs_candidate'
  const candidateRows = (workspace.snapshot?.candidates || []).filter(row => isSourcedCandidate(row) === (session.pool === 'sourced'))
  const validation = validateHiringSession(session, workspace.snapshot)
  const browserRows = AI_CATEGORIES.filter(item => (!onlyFavorites || favorites.includes(item.id)) && `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase()))

  const cancel = () => {
    if (requestRef.current) {
      const request = requestRef.current
      request.controller.abort()
      dispatch({ type: 'cancel', key: request.key, runId: request.runId })
      requestRef.current = null
    }
  }
  const select = (next, reset = false) => { cancel(); dispatch({ type: 'select', selection: next, reset }); setCopied(false) }
  const edit = patch => { dispatch({ type: 'edit', key: state.activeKey, patch }); setCopied(false) }
  const refreshRecords = async () => {
    const key = state.activeKey
    const snapshot = await workspace.refresh()
    if (snapshot) dispatch({ type: 'notice', key, error: '' })
  }
  const chooseWorkflow = item => {
    setBrowserOpen(false)
    if (item.mode === 'chat') { onLaunchChat(item); return }
    select({ kind: 'workflow', id: item.id, actionId: item.actionId || 'salary' })
  }
  useEffect(() => {
    if (!launch) return
    const category = getHiringCategory(launch.id)
    if (category?.mode === 'chat') return
    const base = category && category.mode !== 'chat'
      ? { kind: 'workflow', id: category.id, actionId: category.actionId || 'salary' }
      : { kind: 'action', id: launch.id, actionId: launch.actionId || 'summarize' }
    const next = { ...base, presetContent: launch.presetContent, presetContentB: launch.presetContentB, presetContext: launch.presetContext, comparisonMode: launch.comparisonMode, savedPromptId: launch.savedPromptId }
    if (requestRef.current) {
      requestRef.current.controller.abort()
      dispatch({ type: 'cancel', key: requestRef.current.key, runId: requestRef.current.runId })
    }
    requestRef.current = null
    dispatch({ type: 'select', selection: next, reset: Boolean(launch.presetContent || launch.presetContext) })
  }, [launch])
  useEffect(() => {
    if (!active && requestRef.current) {
      const request = requestRef.current
      request.controller.abort()
      dispatch({ type: 'cancel', key: request.key, runId: request.runId })
      requestRef.current = null
    }
  }, [active])
  useEffect(() => () => requestRef.current?.controller.abort(), [])

  const run = async () => {
    if (running || overLimit || validation || requestRef.current) return
    const key = state.activeKey, runId = crypto.randomUUID(), controller = new AbortController()
    requestRef.current = { key, runId, controller }
    dispatch({ type: 'start', key, runId })
    setCopied(false)
    const start = new Date().getTime()
    try {
      const snapshot = session.sourceMode === 'crm' ? await workspace.refresh() : workspace.snapshot
      if (controller.signal.aborted) return
      if (session.sourceMode === 'crm' && !snapshot) throw new Error('Could not refresh CRM records. Refresh and retry before generating.')
      const request = buildHiringToolRequest(session, snapshot)
      const options = { signal: controller.signal, onDelta: aiSettings.streamingEnabled ? (_delta, text) => dispatch({ type: 'delta', key, runId, text }) : undefined }
      const response = selection.kind === 'workflow'
        ? await streamAiGenerate({ toolId: 'recruiting_workbench', prompt: `${request.context}\n\n${request.content}`, ...options })
        : await streamAiAction({ action: request.action, content: request.content, context: request.context, ...options })
      if (!response.text?.trim()) throw new Error('The AI returned an empty response. Please retry.')
      if (controller.signal.aborted) return
      const resultText = prepareHiringToolResult(selection, response.text)
      dispatch({ type: 'success', key, runId, result: { id: runId, text: resultText, label: request.label, subject: request.subject, sourceRecords: request.sourceRecords } })
      logUsageEvent(orgId, userId, { type: 'action', action: selection.actionId, workflowId: selection.kind === 'workflow' ? selection.id : null, source: 'hiring_tools', success: true, provider: response.provider, model: response.model, durationMs: new Date().getTime() - start, preview: resultText.slice(0, 140) })
      onResult?.()
    } catch (error) {
      if (error.name !== 'AbortError') {
        dispatch({ type: 'error', key, runId, error: error.message || 'Generation failed. Your CRM records have not changed.' })
        logUsageEvent(orgId, userId, { type: 'action', action: selection.actionId, workflowId: selection.kind === 'workflow' ? selection.id : null, source: 'hiring_tools', success: false, error: error.message })
        onResult?.()
      }
    } finally { if (requestRef.current?.runId === runId) requestRef.current = null }
  }

  const chooseCandidate = candidateId => {
    const candidate = workspace.snapshot?.candidates.find(row => row.id === candidateId)
    const linked = candidate?.job_id ? workspace.snapshot.jobs.filter(row => row.job_id === candidate.job_id) : []
    edit({ candidateId, ...(!candidateComparison && !session.jobId && linked.length === 1 ? { jobId: linked[0].id } : {}) })
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(normalizeAiPlainText(session.result.text)); setCopied(true) }
    catch { dispatch({ type: 'notice', key: state.activeKey, error: 'Clipboard access is unavailable. Select the result text to copy it.' }) }
  }

  return (
    <div className="hiring-tools">
      <header className="hiring-tools-header"><div><span className="recruiting-eyebrow">RECRUITING / HIRING TOOLS</span><h1>One task. The right tool.</h1><p>Use a focused hiring workflow or work directly with your text. Each tool keeps its own draft.</p></div><Button variant="secondary" leftIcon="layers" onClick={() => setBrowserOpen(true)}>Browse workflows</Button></header>
      <nav className="hiring-tool-actions" aria-label="Hiring actions">{hiringActions.map(item => <button type="button" key={item.id} aria-pressed={item.workflow ? selection.kind === 'workflow' && selection.id === item.id : selection.kind === 'action' && selection.actionId === item.id} onClick={() => item.workflow ? chooseWorkflow(getHiringCategory(item.id)) : select({ kind: 'action', id: item.id, actionId: item.id })}><Icon name={item.icon} size={14} />{item.label}</button>)}</nav>
      {overLimit && <p className="hiring-error" role="status">Your daily AI request limit has been reached. You can still review and save existing results.</p>}
      <section className="hiring-tool-panel" data-tool-kind={selection.kind} data-tool-id={selection.id}>
        <div className="hiring-tool-heading"><span className="recruiting-tool-icon"><Icon name={category?.icon || action?.icon || 'sparkles'} size={21} /></span><div><div><h2>{label}</h2><Badge tone="neutral">{selection.kind === 'workflow' ? 'Hiring workflow' : 'Text action'}</Badge></div><p>{category?.description || action?.placeholder || 'Work with recruiting content.'}</p></div>{category && <Button size="sm" variant="ghost" leftIcon="x" onClick={() => select(initialSelection)}>Leave workflow</Button>}</div>
        {category?.mode === 'salary' ? active && <SalaryAnalysisPanel key={selection.id} orgId={orgId} userId={userId} source="hiring_tools" streamingEnabled={aiSettings.streamingEnabled} disabled={overLimit || !active} onResult={onResult} /> : <>
          {comparing && <div className="hiring-comparison-modes" aria-label="Comparison mode">{[['resume_vs_jd', 'Resume vs Job Description'], ['candidate_vs_candidate', 'Candidate vs Candidate']].map(([mode, name]) => <button type="button" aria-pressed={(selection.comparisonMode || 'resume_vs_jd') === mode} key={mode} onClick={() => select({ ...selection, comparisonMode: mode })}>{name}</button>)}</div>}
          <div className="hiring-input-layout">
            <div className="hiring-input-main">
              <div className="hiring-input-tabs" aria-label="Source type">{[['paste', 'Paste text'], ['crm', 'CRM records']].map(([value, name]) => <button type="button" key={value} aria-pressed={session.sourceMode === value} disabled={running} onClick={() => edit({ sourceMode: value })}><Icon name={value === 'crm' ? 'layers' : 'edit'} size={13} />{name}</button>)}</div>
              {session.sourceMode === 'crm' ? <div className="hiring-crm-inputs">
                <div className="hiring-crm-status"><span>{workspace.loading ? 'Refreshing records…' : workspace.error ? 'CRM needs refreshing' : 'Your accessible CRM records'}</span><Button variant="ghost" size="sm" leftIcon="refresh" loading={workspace.loading} disabled={running} onClick={refreshRecords}>Refresh records</Button></div>
                {workspace.error && <p className="hiring-error" role="alert">{workspace.error}</p>}
                <div className="hiring-input-tabs" aria-label="Candidate pool">{[['active', 'Candidates'], ['sourced', 'Sourced pool']].map(([value, name]) => <button type="button" key={value} disabled={running} aria-pressed={session.pool === value} onClick={() => edit({ pool: value, candidateId: '', candidateBId: '' })}>{name}</button>)}</div>
                <div className="hiring-record-fields"><label>Candidate {requirements.candidate ? '(required)' : '(optional)'}<select aria-label={`Candidate (${requirements.candidate ? 'required' : 'optional'})`} value={session.candidateId} disabled={running || workspace.loading} onChange={event => chooseCandidate(event.target.value)}><option value="">Choose a candidate</option>{candidateRows.map(row => <option value={row.id} key={row.id}>{candidateName(row)}{row.job_title ? ` — ${row.job_title}` : ''}</option>)}</select></label>
                  {candidateComparison ? <label>Second candidate (required)<select aria-label="Second candidate (required)" value={session.candidateBId} disabled={running || workspace.loading} onChange={event => edit({ candidateBId: event.target.value })}><option value="">Choose a second candidate</option>{candidateRows.map(row => <option value={row.id} key={row.id} disabled={row.id === session.candidateId}>{candidateName(row)}</option>)}</select></label> : <label>Job requisition {requirements.job ? '(required)' : '(optional)'}<select aria-label={`Job requisition (${requirements.job ? 'required' : 'optional'})`} value={session.jobId} disabled={running || workspace.loading} onChange={event => edit({ jobId: event.target.value })}><option value="">Choose a requisition</option>{(workspace.snapshot?.jobs || []).map(row => <option value={row.id} key={row.id}>{row.job_id} · {row.title}</option>)}</select></label>}
                </div><p className="hiring-input-hint">Recorded profile fields, resume text and job requirements are refreshed when you run this tool.</p>
              </div> : <div className={comparing ? 'hiring-paste-fields is-comparison' : 'hiring-paste-fields'}><label>{comparing ? candidateComparison ? 'Candidate A' : 'Resume' : 'Source text'}<textarea aria-label={comparing ? candidateComparison ? 'Candidate A' : 'Resume' : 'Source text'} rows={8} maxLength={30000} disabled={running} value={session.content} onChange={event => edit({ content: event.target.value })} placeholder={comparing ? 'Paste the first resume or profile…' : category?.placeholder || action?.placeholder} /></label>{comparing && <label>{candidateComparison ? 'Candidate B' : 'Job description'}<textarea aria-label={candidateComparison ? 'Candidate B' : 'Job description'} rows={8} maxLength={30000} disabled={running} value={session.contentB} onChange={event => edit({ contentB: event.target.value })} placeholder={candidateComparison ? 'Paste the second profile…' : 'Paste the role requirements…'} /></label>}</div>}
            </div>
            <aside className="hiring-instructions"><span className="recruiting-eyebrow">{category ? 'WORKFLOW OUTPUT' : 'YOUR INSTRUCTIONS'}</span><h3>{category ? HIRING_USE_CASES.find(item => item.id === category.id)?.title || category.label : `Make ${label.toLowerCase()} work for you`}</h3>{category && <p>{HIRING_USE_CASES.find(item => item.id === category.id)?.outcome || category.description}</p>}<label>Additional instructions (optional)<textarea aria-label="Additional instructions (optional)" rows={5} maxLength={4000} value={session.instructions} disabled={running} onChange={event => edit({ instructions: event.target.value })} placeholder={selection.actionId === 'translate' ? 'E.g. Translate into Hindi; keep technical terms in English.' : 'Audience, tone, focus, or a detail to verify…'} /></label><p className="hiring-input-hint">{category ? 'Workflow instructions apply only to this workflow.' : 'No hiring workflow is active in this text action.'}</p></aside>
          </div>
          <div className="hiring-run-bar"><div>{running ? <Button variant="secondary" leftIcon="square" onClick={cancel}>Stop generating</Button> : <Button leftIcon={category?.icon || action?.icon || 'sparkles'} disabled={Boolean(validation) || overLimit || (session.sourceMode === 'crm' && (workspace.loading || Boolean(workspace.error)))} onClick={run}>{hiringRunLabel(selection)}</Button>}{onSavePrompt && <Button variant="ghost" leftIcon="pin" disabled={running || session.sourceMode === 'crm' || Boolean(validation)} onClick={() => onSavePrompt({ actionId: selection.actionId, content: session.content, contentB: session.contentB, comparisonMode: selection.comparisonMode, context: session.instructions, workflowId: selection.kind === 'workflow' ? selection.id : null })}>Save prompt</Button>}</div><p role="status">{running ? 'Working on this tool’s selected inputs…' : validation || 'Ready. Nothing is sent or saved automatically.'}</p></div>
          {session.error && <p className="hiring-error" role="alert">{session.error}</p>}
          <div className="hiring-result"><AIResultCard streaming={running} streamingText={session.streamText} result={session.result?.text} subject={session.result?.subject || (running ? label : '')} copied={copied} onCopy={copy} onExportWord={() => exportResultToDocx(session.result.text, label)} onExportPdf={() => exportResultToPdf(session.result.text, label)} />{session.result && <DraftRecordActions key={session.result.id} result={session.result} snapshot={workspace.snapshot} userId={userId} userName={userName} timezone={timezone} onRefresh={workspace.refresh} onNavigate={onNavigate} onSaved={(mode, destination) => dispatch({ type: 'saved', key: state.activeKey, resultId: session.result.id, mode, destination })} />}</div>
        </>}
      </section>

      <Drawer open={browserOpen} onClose={() => setBrowserOpen(false)} title="Hiring workflows" subtitle="Focused workflows with their own inputs and instructions" size="2xl">
        <div className="hiring-workflow-browser"><label className="hiring-browser-search"><Icon name="search" size={14} /><input type="search" aria-label="Search hiring workflows" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a workflow or recruiting task…" /></label><div className="hiring-browser-filter"><button type="button" aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>All workflows</button><button type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}>Favorites</button></div>
          {!search && !onlyFavorites && <div className="hiring-use-cases"><h3>Five real recruiting scenarios</h3>{HIRING_USE_CASES.map(item => <button type="button" key={item.id} onClick={() => chooseWorkflow(getHiringCategory(item.id))}><span>{item.number}</span><div><strong>{item.title}</strong><p>{item.scenario}</p></div><Icon name="chevronRight" size={14} /></button>)}</div>}
          <h3>Workflow library</h3>{browserRows.map(item => <div key={item.id} className="hiring-browser-row"><button type="button" aria-label={`Use ${item.label}`} aria-current={selection.kind === 'workflow' && selection.id === item.id ? 'true' : undefined} onClick={() => chooseWorkflow(item)}><Icon name={item.icon} size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevronRight" size={13} /></button><button type="button" aria-label={`${favorites.includes(item.id) ? 'Unfavorite' : 'Favorite'} ${item.label}`} aria-pressed={favorites.includes(item.id)} onClick={() => onToggleFavorite(item.id)}><Icon name="pin" size={13} /></button></div>)}{!browserRows.length && <p className="hiring-input-hint">No workflows match this view.</p>}
        </div>
      </Drawer>
    </div>
  )
}
