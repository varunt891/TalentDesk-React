export function normalizeEmail(email) {
  const trimmed = (email || '').trim().toLowerCase()
  return trimmed || null
}

export function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  return digits || null
}

// Mirrors server/src/services/collisionService.js's rule exactly, but runs
// against the already-loaded `candidates` array (no network call) so the
// Add/Edit drawer can show an instant warning as the recruiter types. The
// backend copy remains the source of truth that persists the audit record —
// this one is UX-only, same tradeoff already accepted elsewhere in this app
// between the candidate-limit checks in data.routes.js and upload.routes.js.
const RESUBMIT_TERMINAL_STATUSES = ['Rejected', 'Withdrew', 'On Hold']

export function findLocalCollisionMatches(candidates, form, excludeId) {
  const email = normalizeEmail(form.email)
  const phone = normalizePhone(form.phone)
  if (!email && !phone) return []

  const matches = []
  for (const c of candidates) {
    if (c.id === excludeId) continue
    const emailHit = Boolean(email && normalizeEmail(c.email) === email)
    const phoneHit = Boolean(phone && normalizePhone(c.phone) === phone)
    if (!emailHit && !phoneHit) continue

    const sameJob = Boolean(form.job_id && c.job_id && form.job_id === c.job_id)
    const sameClient = Boolean(
      form.client && c.client &&
      form.client.trim().toLowerCase() === c.client.trim().toLowerCase()
    )

    if (sameJob) {
      matches.push({ type: 'hard', candidate: c })
    } else if (sameClient && !RESUBMIT_TERMINAL_STATUSES.includes(c.internal_status)) {
      matches.push({ type: 'soft', candidate: c })
    }
  }
  return matches
}
