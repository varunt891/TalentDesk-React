import test from 'node:test'
import assert from 'node:assert/strict'
import { RECRUITING_WORKFLOWS, buildRecruitingRequest, compareRecordedSkills, recruitingSummary } from '../src/lib/ai/recruitingWorkbench.js'
import { appendRecordNote } from '../server/src/services/recordNotesService.js'

const snapshot = {
  fetchedAt: '2026-10-28T09:00:00Z', tasks: [], jobs: [{ id: 'job-1', job_id: 'REQ-101', title: 'React Engineer', status: 'Open', skills: ['React', 'Node.js', 'Java'], description: 'Build user interfaces.' }],
  candidates: [
    { id: 'active', first_name: 'Alex', last_name: 'Rivera', internal_status: 'Submitted', external_status: 'Shortlisted', skills: ['React.js', 'nodejs', 'JavaScript'], resume_text: 'Built React interfaces.', followup_date: '2026-10-27', email: 'private@example.test', work_auth: 'private detail' },
    { id: 'sourced', first_name: 'Sam', internal_status: 'Sourced', external_status: 'Submitted', followup_date: '2026-10-27' },
    { id: 'hired', internal_status: 'Submitted', external_status: 'Hired', followup_date: '2026-10-27' },
    { id: 'withdrawn', internal_status: 'Withdrew', external_status: 'Pending', followup_date: '2026-10-27' },
  ],
}

test('skill evidence recognizes aliases without conflating Java with JavaScript', () => {
  assert.deepEqual(compareRecordedSkills(snapshot.candidates[0], snapshot.jobs[0]), { matched: ['React', 'Node.js'], unverified: ['Java'], total: 3, percentage: 67 })
  assert.equal(compareRecordedSkills({}, {}).percentage, null)
})

test('pipeline counts keep sourced, placed, and withdrawn candidates out of active work', () => {
  const summary = recruitingSummary(snapshot, '2026-10-28')
  assert.deepEqual(summary.active.map(row => row.id), ['active'])
  assert.deepEqual(summary.overdue.map(row => row.id), ['active'])
  assert.deepEqual(summary.sourced.map(row => row.id), ['sourced'])
})

test('all recruiting workflows bind to explicit accessible records and require their inputs', () => {
  for (const workflow of RECRUITING_WORKFLOWS) {
    const args = { workflowId: workflow.id, snapshot, candidateId: 'active', jobId: 'job-1', today: '2026-10-28' }
    const request = buildRecruitingRequest(args)
    const data = JSON.parse(request.content.slice(request.content.indexOf('\n') + 1))
    assert.equal(data.candidate?.name || null, workflow.candidate ? 'Alex Rivera' : null)
    assert.equal(data.job?.requisition || null, workflow.job || workflow.id === 'brief' ? 'REQ-101' : null)
    assert.equal(data.candidate?.id, undefined, 'Internal database IDs do not belong in a recruiting draft')
    assert.equal(data.job?.id, undefined)
    assert.ok(request.context.includes('untrusted data'))
    assert.ok(!request.content.includes('private@example.test'))
    assert.ok(!request.content.includes('private detail'))
    if (workflow.candidate) assert.throws(() => buildRecruitingRequest({ ...args, candidateId: 'unknown' }), /accessible candidate/)
    if (workflow.job) assert.throws(() => buildRecruitingRequest({ ...args, jobId: 'unknown' }), /accessible job/)
  }
})

test('pipeline prompt keeps the sourced pool distinct and reports observed stage counts', () => {
  const request = buildRecruitingRequest({ workflowId: 'pipeline', snapshot, today: '2026-10-28' })
  const data = JSON.parse(request.content.slice(request.content.indexOf('\n') + 1))
  assert.equal(data.pipeline.active_candidates, 1)
  assert.equal(data.pipeline.sourced_candidates, 1)
  assert.deepEqual(data.pipeline.stage_counts, { Shortlisted: 1 })
})

test('note append retries a concurrent edit without dropping existing notes', async () => {
  let notes = 'Original notes'
  let attempts = 0
  const model = {
    findFirst: async () => ({ id: 'active', notes }),
    updateMany: async ({ where, data }) => {
      attempts += 1
      assert.equal(where.org_id, 'org-1')
      if (attempts === 1) { notes += '\nConcurrent recruiter note'; return { count: 0 } }
      assert.equal(where.notes, notes)
      notes = data.notes
      return { count: 1 }
    },
  }
  const result = await appendRecordNote(model, { id: 'active', org_id: 'org-1' }, 'Reviewed AI draft')
  assert.equal(attempts, 2)
  assert.equal(result.notes, 'Original notes\nConcurrent recruiter note\n\nReviewed AI draft')
})

test('inaccessible record notes fail without writing', async () => {
  let writes = 0
  await assert.rejects(appendRecordNote({ findFirst: async () => null, updateMany: async () => { writes++ } }, { id: 'inaccessible' }, 'Note'), { status: 404 })
  assert.equal(writes, 0)
})
