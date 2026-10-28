import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Badge, Button, Icon } from '../ui'
import MarkdownView from '../MarkdownView'
import { apiRequest, db } from '../../lib/api'
import { streamAiGenerate } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'
import { getTodayDateString } from '../../lib/timezone'
import { normalizeAiPlainText } from '../../lib/aiTextFormat'
import { useAiOutputScroll } from '../../lib/ai/useAiOutputScroll'
import {
  RECRUITING_WORKFLOWS, buildRecruitingRequest, candidateName,
  compareRecordedSkills, isSourcedCandidate, recruitingSummary, skillList,
} from '../../lib/ai/recruitingWorkbench'

export default function RecruitingWorkbench({ snapshot, loading, error, onRefresh, orgId, userId, userName, timezone, aiSettings, overLimit, onResult, onAskCopilot }) {
  const [workflowId, setWorkflowId] = useState('overview')
  const [candidateId, setCandidateId] = useState('')
  const [jobId, setJobId] = useState('')
  const [pool, setPool] = useState('active')
  const [candidateSearch, setCandidateSearch] = useState('')
  const [toolSearch, setToolSearch] = useState('')
  const [toolGroup, setToolGroup] = useState('All')
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [instructions, setInstructions] = useState('')
  const [running, setRunning] = useState(false)
  const outputRef = useAiOutputScroll(running)
  const [streamText, setStreamText] = useState('')
  const [result, setResult] = useState(null)
  const [runError, setRunError] = useState('')
  const [copied, setCopied] = useState(false)
  const [reviewMode, setReviewMode] = useState(null)
  const [reviewText, setReviewText] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState({})
  const abortRef = useRef(null)
  const runLock = useRef(false)
  const saveLock = useRef(false)
  useEffect(() => () => abortRef.current?.abort(), [])

  const today = getTodayDateString(timezone)
  const summary = useMemo(() => recruitingSummary(snapshot, today), [snapshot, today])
  const workflow = RECRUITING_WORKFLOWS.find(item => item.id === workflowId)
  const visibleWorkflows = RECRUITING_WORKFLOWS.filter(item => (toolGroup === 'All' || item.group === toolGroup) && `${item.label} ${item.description}`.toLowerCase().includes(toolSearch.toLowerCase()))
  const candidate = snapshot?.candidates.find(row => row.id === candidateId)
  const job = snapshot?.jobs.find(row => row.id === jobId)
  const candidates = (snapshot?.candidates || []).filter(row => isSourcedCandidate(row) === (pool === 'sourced'))
  const filteredCandidates = candidates.filter(row => `${candidateName(row)} ${row.job_title || ''} ${row.email || ''}`.toLowerCase().includes(candidateSearch.toLowerCase()))
  const coverage = candidate && job ? compareRecordedSkills(candidate, job) : null
  const missingCandidate = Boolean(workflow?.candidate && !candidate)
  const missingJob = Boolean(workflow?.job && !job)
  const canRun = workflow && snapshot && !loading && !error && !running && !overLimit && (!workflow.candidate || candidate) && (!workflow.job || job)
  const generationHelp = saving ? 'Saving your reviewed work…'
    : loading ? 'Refreshing your CRM records…'
      : error ? 'Refresh your data above before generating a draft.'
        : !snapshot ? 'Load your CRM records before generating a draft.'
          : overLimit ? 'Your daily AI request limit has been reached.'
            : missingCandidate && missingJob ? 'Select a candidate and a job requisition above to compare them.'
              : missingCandidate ? 'Select a candidate record above to generate this draft.'
                : missingJob ? workflow.candidate ? 'Select a job requisition above to compare against the candidate.' : 'Select a job requisition above to generate this draft.'
                  : 'Ready to generate using your selected records. Instructions are optional.'

  const resetOutput = () => { setResult(null); setRunError(''); setReviewMode(null); setSaveError(''); setSaved({}); setCopied(false) }
  const chooseWorkflow = id => { if (running || saving) return; setWorkflowId(id); setInstructions(''); resetOutput() }
  const chooseCandidate = value => {
    setCandidateId(value)
    // Use the recorded association when available; preserve an explicitly
    // selected requisition so recruiters can compare against another role.
    const selected = snapshot?.candidates.find(row => row.id === value)
    const linkedJobs = selected?.job_id ? snapshot.jobs.filter(row => row.job_id === selected.job_id) : []
    if (!jobId && linkedJobs.length === 1) setJobId(linkedJobs[0].id)
    resetOutput()
  }
  const chooseJob = value => { setJobId(value); resetOutput() }
  const focusSource = id => {
    const field = document.getElementById(id)
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    field?.focus({ preventScroll: true })
  }
  const openForCandidate = row => {
    setCandidateId(row.id)
    setPool(isSourcedCandidate(row) ? 'sourced' : 'active')
    const linkedJob = snapshot.jobs.find(item => item.job_id === row.job_id)
    setJobId(linkedJob?.id || '')
    chooseWorkflow(linkedJob ? 'outreach' : 'brief')
  }

  const run = async () => {
    if (!canRun || runLock.current) return
    runLock.current = true
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true); setStreamText(''); resetOutput()
    const startedAt = new Date().getTime()
    try {
      // Fetch current, permission-scoped rows again before each generation.
      const fresh = await onRefresh()
      if (controller.signal.aborted) return
      if (!fresh) throw new Error('Could not refresh your records. Retry before generating.')
      const request = buildRecruitingRequest({ workflowId, snapshot: fresh, candidateId, jobId, instructions, today })
      const response = await streamAiGenerate({
        toolId: 'recruiting_workbench',
        prompt: `${request.context}\n\n${request.content}`,
        signal: controller.signal,
        onDelta: aiSettings.streamingEnabled ? (_delta, full) => setStreamText(full) : undefined,
      })
      if (!response.text?.trim()) throw new Error('The AI returned an empty response. Please retry.')
      const selectedCandidate = workflow.candidate ? fresh.candidates.find(row => row.id === candidateId) : null
      const selectedJob = workflow.job || workflowId === 'brief' ? fresh.jobs.find(row => row.id === jobId) : null
      setResult({ text: response.text, workflowId, label: workflow.label, candidate: selectedCandidate, job: selectedJob, fetchedAt: fresh.fetchedAt, provider: response.provider })
      logUsageEvent(orgId, userId, { type: 'action', action: workflow.id, source: 'recruiting_workbench', success: true, provider: response.provider, model: response.model, durationMs: new Date().getTime() - startedAt, preview: response.text.slice(0, 140) })
      onResult?.()
    } catch (err) {
      if (err.name !== 'AbortError') {
        setRunError(err.message || 'Generation failed. Your records have not changed.')
        logUsageEvent(orgId, userId, { type: 'action', action: workflow.id, source: 'recruiting_workbench', success: false, error: err.message, durationMs: new Date().getTime() - startedAt })
        onResult?.()
      }
    } finally {
      setRunning(false); setStreamText(''); abortRef.current = null; runLock.current = false
    }
  }

  const beginReview = mode => {
    setReviewMode(mode); setReviewText(result.text); setSaveError('')
    setTaskTitle(`Review ${result.label.toLowerCase()}${result.candidate ? ` — ${candidateName(result.candidate)}` : result.job ? ` — ${result.job.title}` : ''}`)
    setTaskDue(today)
  }

  const saveReviewed = async () => {
    if (saveLock.current || !reviewText.trim() || (reviewMode === 'task' && (!taskTitle.trim() || !taskDue))) return
    saveLock.current = true; setSaving(true); setSaveError('')
    try {
      if (reviewMode === 'note') {
        const target = result.candidate || result.job
        if (!target) throw new Error('Select a candidate or job before saving a record note.')
        const table = result.candidate ? 'candidates' : 'jobs'
        await apiRequest(`/data/${table}/${encodeURIComponent(target.id)}/notes`, { method: 'POST', body: { title: `AI draft: ${result.label}`, content: reviewText.trim() } })
      } else {
        const response = await db.from('tasks').insert({
          title: taskTitle.trim(), description: reviewText.trim(), category: 'Custom', status: 'Pending', priority: 'Medium',
          due_date: taskDue, assigned_to: userId, assigned_by: userId, assigned_to_name: userName, assigned_by_name: userName,
          req_id: result.job?.job_id || null,
        }).select()
        if (response.error) throw response.error
      }
      setSaved(previous => ({ ...previous, [reviewMode]: true })); setReviewMode(null)
      await onRefresh()
    } catch (err) { setSaveError(err.message || 'Could not save. Please retry.') }
    finally { saveLock.current = false; setSaving(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(normalizeAiPlainText(result.text)); setCopied(true) }
    catch { setSaveError('Clipboard access is unavailable. Select the draft text to copy it.') }
  }

  return (
    <div className="recruiting-workbench" data-view={workflowId === 'overview' ? 'overview' : 'workflow'}>
      {workflow && <aside className="recruiting-workflow-rail" aria-label="Recruiting workflows">
        <button type="button" disabled={running || saving} onClick={() => chooseWorkflow('overview')}><Icon name="chevronLeft" size={14} /> Workbench</button>
        {['Evaluate', 'Engage', 'Source', 'Plan'].map(group => (
          <div className="recruiting-rail-group" key={group}>
            <span>{group}</span>
            {RECRUITING_WORKFLOWS.filter(item => item.group === group).map(item => (
              <button key={item.id} type="button" disabled={running || saving} aria-current={workflowId === item.id ? 'page' : undefined} onClick={() => chooseWorkflow(item.id)}><Icon name={item.icon} size={15} /> {item.shortLabel}</button>
            ))}
          </div>
        ))}
      </aside>}

      <div className="recruiting-workbench-main">
        <div className="recruiting-connection" role="status">
          <span><i data-connected={Boolean(snapshot && !error)} />{loading ? 'Refreshing records…' : error ? 'Records need refreshing' : snapshot ? `Records refreshed ${new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to your workspace…'}</span>
          <Button variant="ghost" size="sm" leftIcon="refresh" loading={loading} disabled={running || saving} onClick={onRefresh}>Refresh data</Button>
        </div>
        {error && <div className="recruiting-error" role="alert"><Icon name="alertCircle" size={16} /><span>{error} {snapshot ? 'Showing the last loaded records. Refresh before generating.' : 'Your workspace data could not be loaded.'}</span></div>}
        {overLimit && <div className="recruiting-error" role="status">Your daily AI request limit has been reached. Existing drafts and database records remain available.</div>}

        {workflowId === 'overview' ? (
          <>
            <div className="recruiting-intro">
              <div><span className="recruiting-eyebrow">YOUR PEOPLE. YOUR PIPELINE. YOUR NEXT MOVE.</span><h1>Move your next hire forward.</h1><p>Find the right context. Turn it into a useful draft. Keep every next step connected to your CRM.</p>
            <div className="recruiting-metrics">
              {[['jobs', 'Open requisitions', summary.openJobs.length], ['users', 'Active candidates', summary.active.length], ['download', 'Sourced pool', summary.sourced.length], ['clock', 'Follow-ups due', summary.overdue.length]].map(([icon, label, value]) => <div key={label}><span><Icon name={icon} size={15} />{label}</span><strong>{snapshot ? value : '—'}</strong></div>)}
            </div>
              </div>
              <form className="recruiting-copilot-prompt" onSubmit={event => { event.preventDefault(); if (copilotPrompt.trim() && aiSettings.features.chat !== false) onAskCopilot(copilotPrompt.trim()) }}>
                <span><Icon name="sparkles" size={16} /> Ask about your recruiting workspace</span>
                <label className="sr-only" htmlFor="recruiting-copilot-question">Ask Copilot</label>
                <textarea id="recruiting-copilot-question" value={copilotPrompt} disabled={aiSettings.features.chat === false} onChange={event => setCopilotPrompt(event.target.value)} rows={2} maxLength={2000} placeholder="What would you like to move forward today?" />
                <div><span>{aiSettings.features.chat === false ? 'Copilot is disabled in Preferences' : 'Uses your workspace context'}</span><Button size="sm" variant="primary" leftIcon="send" type="submit" disabled={!copilotPrompt.trim() || aiSettings.features.chat === false}>Ask Copilot</Button></div>
                <div className="recruiting-prompt-shortcuts"><button type="button" disabled={aiSettings.features.chat === false} onClick={() => onAskCopilot('Help me prioritize my recruiting work today using my current workspace records.')}>Plan my day <Icon name="chevronRight" size={11} /></button><button type="button" onClick={() => chooseWorkflow('pipeline')}>Find pipeline blockers <Icon name="chevronRight" size={11} /></button></div>
              </form>
            </div>
            <div className="recruiting-overview-grid">
              <section className="recruiting-library" aria-label="Workflow library">
            <div className="recruiting-section-heading"><div><h2>Built for the work you do.</h2><p>Choose a workflow, select your records, and make it yours.</p></div><span>8 workflows / One connected workspace</span></div>
            <div className="recruiting-library-toolbar"><div aria-label="Filter workflows">{['All', 'Evaluate', 'Engage', 'Source', 'Plan'].map(group => <button type="button" key={group} aria-pressed={toolGroup === group} onClick={() => setToolGroup(group)}>{group}</button>)}</div><label><Icon name="search" size={13} /><input aria-label="Search workflows" placeholder="Find a workflow" type="search" value={toolSearch} onChange={event => setToolSearch(event.target.value)} /></label></div>
            <div className="recruiting-workflow-grid">
              {visibleWorkflows.map(item => (
                <button type="button" className="recruiting-workflow-card" key={item.id} onClick={() => chooseWorkflow(item.id)}>
                  <span className="recruiting-tool-icon"><Icon name={item.icon} size={19} /></span>
                  <div><span className="recruiting-card-category">{item.group}</span><h3>{item.label}</h3><p>{item.description}</p></div><Icon name="chevronRight" size={15} />
                </button>
              ))}
            </div>
            {!visibleWorkflows.length && <p className="recruiting-empty-note">No workflows match your search. Try another term or choose All.</p>}
            <div className="recruiting-library-footnote"><Icon name="layers" size={14} /><span>Real records in. Reviewed work back to your CRM.</span><span>Nothing sends or saves automatically.</span></div>
              </section>
            <div className="recruiting-live-grid">
              <section className="recruiting-live-panel"><div className="recruiting-section-heading"><div><span className="recruiting-eyebrow">YOUR NEXT MOVES</span><h2>Keep things moving</h2></div><span className="recruiting-queue-count">{snapshot ? summary.overdue.length : '—'}</span></div>
                <p className="recruiting-queue-label">FOLLOW-UPS DUE</p>
                {summary.overdue.slice(0, 3).map(row => <button type="button" className="recruiting-record-row" key={row.id} onClick={() => openForCandidate(row)}><Avatar name={candidateName(row)} size="sm" /><span><strong>{candidateName(row)}</strong><small>{row.external_status || row.internal_status} · {row.followup_date.slice(0, 10)}</small></span><Icon name="chevronRight" size={14} /></button>)}
                {!summary.overdue.length && <p className="recruiting-empty-note">{loading ? 'Checking follow-ups…' : 'No due follow-ups recorded for active candidates.'}</p>}
                <p className="recruiting-queue-label">OPEN REQUISITIONS</p>
                {summary.openJobs.slice(0, 3).map(row => <button type="button" className="recruiting-record-row" key={row.id} onClick={() => { chooseJob(row.id); chooseWorkflow('match') }}><span className="recruiting-record-icon"><Icon name="jobs" size={15} /></span><span><strong>{row.title || 'Untitled requisition'}</strong><small>{[row.job_id, row.client].filter(Boolean).join(' · ') || 'No client recorded'}</small></span><Icon name="chevronRight" size={14} /></button>)}
                {!summary.openJobs.length && <p className="recruiting-empty-note">{loading ? 'Loading requisitions…' : 'No open requisitions in your accessible records.'}</p>}
                <button type="button" className="recruiting-queue-action" onClick={() => chooseWorkflow('pipeline')}>Review pipeline priorities <Icon name="chevronRight" size={13} /></button>
              </section>
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="recruiting-workflow-heading"><span className="recruiting-tool-icon"><Icon name={workflow.icon} size={22} /></span><div><span className="recruiting-eyebrow">{workflow.group} / RECRUITING WORKFLOW</span><h1>{workflow.label}</h1><p>{workflow.description}</p></div><div className="recruiting-workflow-steps"><span data-complete={Boolean(canRun || result)}><i>1</i> Select records</span><Icon name="chevronRight" size={13} /><span data-complete={Boolean(result)}><i>2</i> Generate</span><Icon name="chevronRight" size={13} /><span><i>3</i> Review &amp; save</span></div></div>
            <div className="recruiting-work-area">
              <section className="recruiting-sources">
                <div className="recruiting-panel-heading"><span className="recruiting-step">1</span><div><h2>Select your source records</h2><p>Fetched from your accessible CRM data.</p></div></div>
                {workflow.candidate && (
                  <div className="recruiting-field-group">
                    <div className="recruiting-pool-toggle" aria-label="Candidate pool">{[['active', 'Candidates'], ['sourced', 'Sourced pool']].map(([id, label]) => <button key={id} type="button" aria-pressed={pool === id} disabled={running || saving} onClick={() => { setPool(id); setCandidateSearch(''); chooseCandidate('') }}>{label}</button>)}</div>
                    <label htmlFor="recruiting-candidate-search">Find a candidate</label>
                    <input id="recruiting-candidate-search" type="search" placeholder="Search name, role, or email" value={candidateSearch} disabled={running || saving} onChange={event => setCandidateSearch(event.target.value)} />
                    <label htmlFor="recruiting-candidate">Candidate record <span>(required)</span></label>
                    <select id="recruiting-candidate" required value={candidateId} disabled={running || saving || loading} onChange={event => chooseCandidate(event.target.value)}><option value="">Select a candidate</option>{candidate && !filteredCandidates.some(row => row.id === candidateId) && <option value={candidate.id}>{candidateName(candidate)} (selected)</option>}{filteredCandidates.map(row => <option key={row.id} value={row.id}>{candidateName(row)}{row.job_title ? ` — ${row.job_title}` : ''}</option>)}</select>
                    {!filteredCandidates.length && <p className="recruiting-field-hint">No {pool === 'sourced' ? 'sourced candidates' : 'candidates'} match this search.</p>}
                  </div>
                )}
                {(workflow.job || workflowId === 'brief') && <div className="recruiting-field-group"><label htmlFor="recruiting-job">Job requisition <span>({workflow.job ? 'required' : 'optional'})</span></label><select id="recruiting-job" required={Boolean(workflow.job)} value={jobId} disabled={running || saving || loading} onChange={event => chooseJob(event.target.value)}><option value="">Select a job requisition</option>{(snapshot?.jobs || []).map(row => <option key={row.id} value={row.id}>{row.job_id ? `${row.job_id} · ` : ''}{row.title || 'Untitled'} · {row.status || 'Open'}</option>)}</select></div>}
                {workflowId === 'pipeline' && <div className="recruiting-evidence"><h3>Current pipeline context</h3><p>{summary.active.length} active candidates · {summary.sourced.length} in the sourced pool</p><p>{summary.overdue.length} follow-ups and {summary.tasksDue.length} tasks due.</p><p>Analysis uses recorded stages and dates.</p></div>}
                <details className="recruiting-instructions"><summary><Icon name="edit" size={13} /><span>Add instructions</span><small>Optional</small><Icon name="chevronDown" size={13} /></summary><div className="recruiting-field-group"><label className="sr-only" htmlFor="recruiting-instructions">Instructions (optional)</label><textarea id="recruiting-instructions" rows={3} maxLength={4000} value={instructions} disabled={running || saving} onChange={event => setInstructions(event.target.value)} placeholder="E.g. Keep it concise, focus on backend experience…" /></div></details>
                {running ? <Button variant="secondary" leftIcon="square" onClick={() => abortRef.current?.abort()}>Stop generating</Button> : <Button variant="primary" leftIcon="sparkles" aria-describedby="recruiting-generation-help" title={!canRun || saving ? generationHelp : undefined} disabled={!canRun || saving} onClick={run}>Generate {workflow.shortLabel.toLowerCase()}</Button>}
                {!running && <div id="recruiting-generation-help" className="recruiting-generation-help" role="status"><p>{generationHelp}</p>{snapshot && !loading && !error && !overLimit && !saving && <div>{missingCandidate && <button type="button" onClick={() => focusSource('recruiting-candidate')}>Select candidate <Icon name="chevronRight" size={11} /></button>}{missingJob && <button type="button" onClick={() => focusSource('recruiting-job')}>Select job requisition <Icon name="chevronRight" size={11} /></button>}</div>}</div>}
                {candidate && workflow.candidate && <details className="recruiting-source-details"><summary><Icon name="layers" size={13} /><span>Source details &amp; skill evidence</span>{coverage && workflowId === 'match' && <b>{coverage.matched.length}/{coverage.total} skills</b>}<Icon name="chevronDown" size={13} /></summary><div>
                {candidate && workflow.candidate && <div className="recruiting-evidence"><div className="recruiting-evidence-person"><Avatar name={candidateName(candidate)} size="sm" /><div><h3>{candidateName(candidate)}</h3><p>{candidate.job_title || 'Role not recorded'}</p></div></div><Badge tone="neutral">{candidate.external_status || candidate.internal_status || 'Sourced'}</Badge><div className="recruiting-skill-list">{skillList(candidate.skills).slice(0, 8).map(skill => <span key={skill}>{skill}</span>)}</div><p>{candidate.resume_text ? 'Resume text and recorded recruiter notes included.' : 'No resume text stored. Analysis will use recorded profile fields.'}</p></div>}
                {coverage && workflowId === 'match' && <div className="recruiting-evidence recruiting-skill-coverage"><h3>Recorded skill overlap <strong>{coverage.total ? `${coverage.matched.length}/${coverage.total}` : '—'}</strong></h3><p>Exact skill matches from profile fields. Resume evidence is reviewed in the AI draft.</p><div className="recruiting-skill-list">{coverage.matched.map(skill => <span data-matched="true" key={skill}><Icon name="check" size={10} />{skill}</span>)}{coverage.unverified.map(skill => <span key={skill}>{skill} · unverified</span>)}</div>{!coverage.total && <p>Add skills to the job record to see overlap.</p>}</div>}
                </div></details>}
              </section>

              <section ref={outputRef} className="recruiting-output" aria-label="Recruiting draft">
                <div className="recruiting-panel-heading"><span className="recruiting-step">2</span><div><h2>Your recruiting draft</h2><p>{result ? 'Ready for your review.' : 'Evidence first. Ready for a human handoff.'}</p></div>{result && <Badge tone="accent">Draft</Badge>}</div>
                {runError && <div className="recruiting-error" role="alert"><Icon name="alertCircle" size={16} /><span>{runError}</span></div>}
                {running && <div role="status" className="recruiting-generating"><Icon name="loader" size={15} className="animate-spin" />{streamText ? 'Writing your draft…' : 'Reviewing the selected recruiting records…'}</div>}
                {(result || streamText) ? <>
                  {result && <div className="recruiting-output-sources"><Icon name="layers" size={12} /><span>{[result.candidate && candidateName(result.candidate), result.job && `${result.job.job_id || ''} ${result.job.title}`.trim(), !result.candidate && !result.job && 'Accessible workspace records'].filter(Boolean).join(' / ')}</span></div>}
                  <div className="recruiting-result-body"><MarkdownView content={result?.text || streamText} /></div>
                </> : !running && !runError && <div className="recruiting-output-empty"><div className="recruiting-output-illustration"><span><Icon name={workflow.icon} size={28} /></span><i /><i /><i /></div><h3>A clear next step, built from your data.</h3><p>{workflow.output}. Select your source records, add any instructions, and generate a draft.</p><div><span><Icon name="layers" size={13} /> Real CRM records</span><span><Icon name="edit" size={13} /> Review before saving</span></div></div>}
                {result && <div className="recruiting-result-actions"><Button variant="secondary" size="sm" leftIcon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy draft'}</Button>{(result.candidate || result.job) && <Button variant="primary" size="sm" leftIcon={saved.note ? 'check' : 'edit'} disabled={saved.note || saving} onClick={() => beginReview('note')}>{saved.note ? 'Saved to record' : `Save to ${result.candidate ? 'candidate' : 'job'} notes`}</Button>}<Button variant="secondary" size="sm" leftIcon={saved.task ? 'check' : 'tasks'} disabled={saved.task || saving} onClick={() => beginReview('task')}>{saved.task ? 'Task created' : 'Create task'}</Button></div>}
                {reviewMode && <div className="recruiting-save-review"><h3>{reviewMode === 'note' ? `Review note for ${result.candidate ? candidateName(result.candidate) : result.job.title}` : 'Review your follow-up task'}</h3><p>{reviewMode === 'note' ? 'This appends to the existing notes on this record.' : 'This creates a task assigned to you in Tasks & Targets.'}</p>{reviewMode === 'task' && <div className="recruiting-task-fields"><label>Task title<input maxLength={250} value={taskTitle} disabled={saving} onChange={event => setTaskTitle(event.target.value)} /></label><label>Due date<input type="date" value={taskDue} required disabled={saving} onChange={event => setTaskDue(event.target.value)} /></label></div>}<label htmlFor="recruiting-reviewed-draft">{reviewMode === 'note' ? 'Note content' : 'Task description'}</label><textarea id="recruiting-reviewed-draft" rows={9} maxLength={40000} value={reviewText} disabled={saving} onChange={event => setReviewText(event.target.value)} /><div><Button size="sm" variant="primary" loading={saving} disabled={!reviewText.trim() || (reviewMode === 'task' && (!taskTitle.trim() || !taskDue))} onClick={saveReviewed}>{reviewMode === 'note' ? 'Confirm & save note' : 'Confirm & create task'}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => { setReviewMode(null); setSaveError('') }}>Cancel</Button></div></div>}
                {saveError && <div className="recruiting-error" role="alert">{saveError}</div>}
                {(saved.note || saved.task) && <p className="recruiting-save-success" role="status"><Icon name="checkCircle" size={14} />{saved.note && saved.task ? 'Note saved and follow-up task created in your CRM.' : saved.note ? 'Reviewed draft saved to the selected record.' : 'Follow-up task created in your CRM.'}</p>}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
