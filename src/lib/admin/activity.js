// Phase 6 — real Audit & Activity data helpers. `ActivityLog` (read-only
// via the generic proxy, written automatically by data.routes.js on every
// create/update/delete) and `AdminAuditLog` (admin-authored actions like
// invites) both already exist and are already being written server-side —
// this phase is the first time anything reads them back.
import { db } from '../api'

export async function fetchActivityLog(limit = 100) {
  const { data, error } = await db.from('activity_logs').select('*').order('created_at', { ascending: false })
  return error ? [] : (data || []).slice(0, limit)
}

export async function fetchAuditLog(limit = 100) {
  const { data, error } = await db.from('admin_audit_log').select('*').order('created_at', { ascending: false })
  return error ? [] : (data || []).slice(0, limit)
}
