import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCandidateImport } from '../src/lib/candidateImport.js'

test('Candidates imports stay active when a spreadsheet omits status', () => {
  for (const internal_status of [undefined, null, '', '  ', 'Sourced', ' sourced ']) {
    const row = prepareCandidateImport({ first_name: 'Avery', internal_status }, 'candidates')
    assert.equal(row.internal_status, 'Pending')
  }
})

test('Candidates imports preserve existing active stages and spreadsheet fields', () => {
  const input = { first_name: 'Avery', internal_status: 'Submitted', job_id: 'JOB-1', submission_date: '2026-10-28' }
  assert.deepEqual(prepareCandidateImport(input, 'candidates'), input)
})

test('Sourced imports stay in the sourced pool even with an active stage in the file', () => {
  for (const internal_status of [undefined, 'Pending', 'Submitted', 'Sourced']) {
    const input = { first_name: 'Avery', internal_status, submission_date: '2026-10-28' }
    const result = prepareCandidateImport(input, 'sourced')
    assert.equal(result.internal_status, 'Sourced')
    assert.equal(result.submission_date, null)
    assert.equal(input.submission_date, '2026-10-28')
  }
})
