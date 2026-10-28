import { useRef, useState } from 'react'
import { Button, Icon } from '../ui'
import { apiRequest, db } from '../../lib/api'
import { candidateName } from '../../lib/ai/recruitingWorkbench'
import { getTodayDateString } from '../../lib/timezone'

export default function DraftRecordActions({ result, snapshot, userId, userName, timezone, onRefresh, onSaved, onNavigate }) {
  const [mode, setMode] = useState(null)
  const [content, setContent] = useState(result.text)
  const [table, setTable] = useState(result.sourceRecords.candidate ? 'candidates' : 'jobs')
  const [recordId, setRecordId] = useState(result.sourceRecords.candidate?.id || result.sourceRecords.job?.id || '')
  const [title, setTitle] = useState(`Review ${result.label.toLowerCase()}`)
  const [due, setDue] = useState(getTodayDateString(timezone))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(result.saved || {})
  const lock = useRef(false)
  const rows = snapshot?.[table] || []
  const selectedRecord = rows.find(row => row.id === recordId)
  const recordLabel = selectedRecord ? table === 'candidates' ? candidateName(selectedRecord) : [selectedRecord.job_id, selectedRecord.title].filter(Boolean).join(' — ') : ''
  const destinationLabel = selectedRecord ? `${table === 'candidates' ? 'Candidates' : 'Jobs'} → ${recordLabel} → ${table === 'candidates' ? 'Recruiter Notes' : 'Remarks'}` : ''
  const start = next => { setMode(next); setContent(result.text); setError('') }
  const save = async () => {
    if (lock.current || !content.trim() || (mode === 'note' && !selectedRecord) || (mode === 'task' && (!title.trim() || !due))) return
    lock.current = true; setBusy(true); setError('')
    try {
      let destination
      if (mode === 'note') {
        await apiRequest(`/data/${table}/${encodeURIComponent(recordId)}/notes`, { method: 'POST', body: { title: `AI draft: ${result.label}`, content: content.trim() } })
        destination = { table, recordId, label: destinationLabel }
      } else {
        const response = await db.from('tasks').insert({
          title: title.trim(), description: content.trim(), category: 'Custom', status: 'Pending', priority: 'Medium', due_date: due,
          assigned_to: userId, assigned_by: userId, assigned_to_name: userName, assigned_by_name: userName,
          req_id: result.sourceRecords.job?.job_id || null,
        }).select()
        if (response.error) throw response.error
        destination = { table: 'tasks', recordId: response.data?.[0]?.id, label: `Tasks & Targets → ${title.trim()}` }
        window.dispatchEvent(new Event('td:tasks-changed'))
      }
      setSaved(previous => ({ ...previous, [mode]: destination })); setMode(null)
      onSaved?.(mode, destination)
      await onRefresh()
    } catch (err) { setError(err.message || 'Could not save the reviewed draft.') }
    finally { lock.current = false; setBusy(false) }
  }
  return (
    <div className="hiring-draft-record-actions">
      <div className="hiring-result-buttons"><Button variant="primary" size="sm" leftIcon={saved.note ? 'check' : 'edit'} disabled={busy || saved.note} onClick={() => start('note')}>{saved.note ? 'Saved to CRM' : 'Save to CRM'}</Button><Button variant="secondary" size="sm" leftIcon={saved.task ? 'check' : 'tasks'} disabled={busy || saved.task} onClick={() => start('task')}>{saved.task ? 'Task created' : 'Create follow-up task'}</Button></div>
      {mode && <section className="hiring-save-review" aria-label="Review before saving">
        <h3>{mode === 'note' ? 'Review & save to record notes' : 'Review your follow-up task'}</h3>
        <p>{mode === 'note' ? 'This appends to existing notes. The record’s stages and other fields stay as they are.' : 'This creates a task assigned to you in Tasks & Targets.'}</p>
        {mode === 'note' ? <div className="hiring-save-target"><label>Record type<select aria-label="Record type" value={table} disabled={busy} onChange={event => { setTable(event.target.value); setRecordId('') }}><option value="candidates">Candidate</option><option value="jobs">Job requisition</option></select></label><label>Save to record<select aria-label="Save to record" value={recordId} disabled={busy} onChange={event => setRecordId(event.target.value)}><option value="">Choose a record</option>{rows.map(row => <option value={row.id} key={row.id}>{table === 'candidates' ? candidateName(row) : `${row.job_id || ''} ${row.title || 'Untitled job'}`.trim()}</option>)}</select></label></div>
          : <div className="hiring-save-target"><label>Task title<input value={title} maxLength={250} disabled={busy} onChange={event => setTitle(event.target.value)} /></label><label>Due date<input type="date" value={due} disabled={busy} onChange={event => setDue(event.target.value)} /></label></div>}
        {mode === 'note' && destinationLabel && <p>Destination: {destinationLabel}</p>}
        <label>Reviewed draft<textarea aria-label="Reviewed draft" rows={8} maxLength={40000} value={content} disabled={busy} onChange={event => setContent(event.target.value)} /></label>
        <div className="hiring-result-buttons"><Button size="sm" loading={busy} disabled={!content.trim() || (mode === 'note' ? !selectedRecord : !title.trim() || !due)} onClick={save}>{mode === 'note' ? 'Confirm & save note' : 'Confirm & create task'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setMode(null); setError('') }}>Cancel</Button></div>
      </section>}
      {error && <p className="hiring-error" role="alert">{error}</p>}
      {saved.note && <div className="hiring-save-location"><p className="hiring-save-success" role="status"><Icon name="checkCircle" size={13} />{saved.note.label ? `Saved to ${saved.note.label}.` : 'Reviewed draft appended to record notes.'}</p>{saved.note.recordId && onNavigate && <Button variant="ghost" size="sm" leftIcon="arrowUpRight" onClick={() => onNavigate(saved.note.table === 'jobs' ? 'job_detail' : 'candidate_detail', saved.note.table === 'jobs' ? { jobId: saved.note.recordId } : { candidateId: saved.note.recordId })}>Open saved record</Button>}</div>}
      {saved.task && <p className="hiring-save-success" role="status"><Icon name="checkCircle" size={13} />{saved.task.label ? `Created in ${saved.task.label}.` : 'Follow-up task created in Tasks & Targets.'}</p>}
    </div>
  )
}
