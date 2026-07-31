// Phase 6 — real notification data helpers. The `Notification` Prisma
// model already exists and is fully readable/writable via the generic
// /api/data/notifications proxy (org-scoped automatically); until this
// phase it was write-only (TasksPage.jsx inserts rows) with nothing to
// ever read them back. This file is the read/mark-read/delete half.
// fetchNotifications requires a userId — the proxy only scopes by org, not
// by recipient, so the user_id filter has to be applied here or every
// recruiter would see every other recruiter's notifications.
import { db } from '../api'

export async function fetchNotifications(userId) {
  if (!userId) return []
  const { data, error } = await db.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  return error ? [] : (data || [])
}

export async function markNotificationRead(id) {
  return db.from('notifications').update({ read: true }).eq('id', id)
}

export async function markNotificationsRead(ids) {
  return Promise.all(ids.map(id => markNotificationRead(id)))
}

export async function deleteNotification(id) {
  return db.from('notifications').delete().eq('id', id)
}
