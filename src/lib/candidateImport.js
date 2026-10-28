// The upload destination determines the pool, even when a parsed file omits
// status or contains a status belonging to the other pool.
export function prepareCandidateImport(row, destination = 'candidates') {
  if (destination === 'sourced') {
    return { ...row, internal_status: 'Sourced', submission_date: null }
  }

  const status = (row.internal_status || '').trim()
  return {
    ...row,
    internal_status: !status || status.toLowerCase() === 'sourced' ? 'Pending' : status,
  }
}
