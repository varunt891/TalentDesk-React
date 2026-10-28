import test from 'node:test'
import assert from 'node:assert/strict'
import { HIRING_USE_CASES, createHiringSession, hiringSelectionKey, hiringSessionReducer, buildHiringToolRequest, validateHiringSession, prepareHiringToolResult } from '../src/lib/ai/hiringTools.js'

const snapshot = {
  fetchedAt: '2026-10-28T10:00:00Z',
  candidates: [
    { id: 'alex', first_name: 'Alex', last_name: 'Rivera', job_id: 'REQ-REACT', skills: ['React'], resume_text: 'Built React applications.', internal_status: 'Submitted', external_status: 'Interview Done' },
    { id: 'sam', first_name: 'Sam', last_name: 'Chen', skills: ['SQL'], resume_text: 'Built data pipelines.' },
  ],
  jobs: [{ id: 'job', job_id: 'REQ-REACT', title: 'React Engineer', skills: ['React', 'SQL'], description: 'Build accessible interfaces.' }],
}

test('workflow instructions and results cannot leak into any of the eleven text actions', () => {
  let state = { activeKey: null, sessions: {} }
  const workflow = { kind: 'workflow', id: 'jd_generator', actionId: 'draft' }
  const key = hiringSelectionKey(workflow)
  state = hiringSessionReducer(state, { type: 'select', selection: workflow })
  state = hiringSessionReducer(state, { type: 'edit', key, patch: { content: 'My saved requisition', sourceMode: 'paste', instructions: 'Use numbered sections.' } })
  state = hiringSessionReducer(state, { type: 'start', key, runId: 'run-jd' })
  state = hiringSessionReducer(state, { type: 'success', key, runId: 'run-jd', result: { id: 'run-jd', text: 'JD result' } })
  for (const actionId of ['summarize', 'rewrite', 'improve', 'compare', 'explain', 'score', 'analyze', 'recommend', 'draft', 'translate', 'extract']) {
    state = hiringSessionReducer(state, { type: 'select', selection: { kind: 'action', id: actionId, actionId } })
    const current = state.sessions[state.activeKey]
    assert.equal(current.content, '')
    assert.equal(current.instructions, '')
    assert.equal(current.result, null)
    const request = buildHiringToolRequest({ ...current, content: 'Generic recruiting text', contentB: 'Another source' }, snapshot)
    assert.ok(!request.context.includes('Generate a complete, structured job description'))
    assert.ok(!request.context.includes('Use numbered sections.'))
  }
  state = hiringSessionReducer(state, { type: 'select', selection: workflow })
  assert.equal(state.sessions[key].content, 'My saved requisition')
  assert.equal(state.sessions[key].result.text, 'JD result')
})

test('all five real scenarios build isolated requests from accessible CRM records', () => {
  assert.equal(HIRING_USE_CASES.length, 5)
  for (const scenario of HIRING_USE_CASES) {
    const actionId = scenario.id === 'candidate_comparison' ? 'compare' : 'draft'
    const session = { ...createHiringSession({ kind: 'workflow', id: scenario.id, actionId }), candidateId: scenario.candidate ? 'alex' : '', jobId: 'job' }
    const request = buildHiringToolRequest(session, snapshot)
    assert.match(request.content, /REQ-REACT/)
    assert.match(request.context, /untrusted data/)
    if (scenario.candidate) assert.match(request.content, /Alex Rivera/)
    assert.throws(() => buildHiringToolRequest({ ...session, jobId: 'missing' }, snapshot), /no longer accessible/)
  }
})

test('comparison modes use separate sessions and never compare a candidate with themself', () => {
  const selection = { kind: 'action', id: 'compare', actionId: 'compare' }
  const first = createHiringSession(selection)
  const second = createHiringSession({ ...selection, comparisonMode: 'candidate_vs_candidate' })
  assert.notEqual(hiringSelectionKey(first.selection), hiringSelectionKey(second.selection))
  assert.match(validateHiringSession({ ...second, sourceMode: 'crm', candidateId: 'alex', candidateBId: 'alex' }, snapshot), /two different/)
  const request = buildHiringToolRequest({ ...second, sourceMode: 'crm', candidateId: 'alex', candidateBId: 'sam', jobId: 'job' }, snapshot)
  assert.match(request.content, /Alex Rivera/)
  assert.match(request.content, /Sam Chen/)
  assert.match(request.content, /"job":null/)
})

test('cancelled or out-of-order generations cannot overwrite another tool or a new result', () => {
  const selection = { kind: 'action', id: 'rewrite', actionId: 'rewrite' }, key = hiringSelectionKey(selection)
  let state = hiringSessionReducer({ sessions: {} }, { type: 'select', selection })
  state = hiringSessionReducer(state, { type: 'start', key, runId: 'old' })
  state = hiringSessionReducer(state, { type: 'cancel', key, runId: 'old' })
  state = hiringSessionReducer(state, { type: 'start', key, runId: 'new' })
  const expected = state
  state = hiringSessionReducer(state, { type: 'success', key, runId: 'old', result: { text: 'Stale response' } })
  assert.equal(state, expected)
  state = hiringSessionReducer(state, { type: 'success', key, runId: 'new', result: { id: 'new', text: 'Current response' } })
  assert.equal(state.sessions[key].result.text, 'Current response')
  state = hiringSessionReducer(state, { type: 'saved', key, resultId: 'new', mode: 'note' })
  assert.equal(state.sessions[key].result.saved.note, true)
  const destination = { table: 'jobs', recordId: 'job', label: 'Jobs → REQ-REACT — React Engineer → Remarks' }
  state = hiringSessionReducer(state, { type: 'saved', key, resultId: 'new', mode: 'note', destination })
  state = hiringSessionReducer(state, { type: 'select', selection: { kind: 'action', id: 'draft', actionId: 'draft' } })
  state = hiringSessionReducer(state, { type: 'select', selection })
  assert.deepEqual(state.sessions[key].result.saved.note, destination)
})

test('Boolean workflow honors additional LinkedIn deliverables without conflicting output restrictions', () => {
  const session = { ...createHiringSession({ kind: 'workflow', id: 'boolean_search', actionId: 'draft' }), sourceMode: 'paste', content: 'Senior React engineer with Node.js and PostgreSQL.', instructions: 'create linkedin search as well' }
  const request = buildHiringToolRequest(session, snapshot)
  assert.match(request.context, /Recruiter instructions: create linkedin search as well/)
  assert.match(request.context, /LinkedIn people keyword query/)
  assert.match(request.context, /site:linkedin.com\/in/)
  assert.match(request.context, /URL-encoded LinkedIn keyword query/)
  assert.match(request.context, /include requested platforms, variants, and search links/)
  assert.doesNotMatch(request.context, /Generate ONLY a Boolean|Return the search string plus a one-line/)
  const generic = buildHiringToolRequest({ ...session, selection: { kind: 'action', id: 'draft', actionId: 'draft' }, instructions: '' }, snapshot)
  assert.doesNotMatch(generic.context, /LinkedIn people keyword query|site:linkedin.com/)
})

test('search links encode the exact displayed query, preserving parentheses, symbols and titles', () => {
  const selection = { kind: 'workflow', id: 'boolean_search' }
  const keyword = '("C++ Engineer" OR "C# Engineer") AND (SQL OR "Node.js")'
  const xray = `site:linkedin.com/in ${keyword}`
  const result = `## LinkedIn People Keyword Query\n\n\`\`\`text\n${keyword}\n\`\`\`\n[LinkedIn search](https://www.linkedin.com/search/results/people/?keywords=wrong)\n\n## Google X-ray Search\n\`\`\`text\n${xray}\n\`\`\`\n`
  const formatted = prepareHiringToolResult(selection, result)
  const links = [...formatted.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(match => new URL(match[1]))
  assert.equal(links.length, 2)
  assert.equal(links[0].searchParams.get('keywords'), keyword)
  assert.equal(links[1].searchParams.get('q'), xray)
  assert.equal(prepareHiringToolResult(selection, formatted), formatted)
  assert.equal(prepareHiringToolResult({ kind: 'action', id: 'draft' }, result), result)
})

test('saved comparison prompts restore both documents and stay separate from the default tool', () => {
  const selection = { kind: 'workflow', id: 'candidate_comparison', actionId: 'compare', savedPromptId: 'template-1', presetContent: 'First resume', presetContentB: 'Role requirements', presetContext: 'Focus on SQL.' }
  const session = createHiringSession(selection)
  assert.equal(session.sourceMode, 'paste')
  assert.equal(session.contentB, 'Role requirements')
  assert.equal(session.instructions, 'Focus on SQL.')
  assert.notEqual(hiringSelectionKey(selection), hiringSelectionKey({ kind: 'workflow', id: 'candidate_comparison', actionId: 'compare' }))
})
