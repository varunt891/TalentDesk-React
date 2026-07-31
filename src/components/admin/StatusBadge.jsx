import Badge from '../ui/Badge'

const TONE = { active: 'green', inactive: 'neutral', pending: 'yellow', away: 'yellow', suspended: 'red', revoked: 'red' }

export default function StatusBadge({ status, size = 'sm' }) {
  const key = (status || '').toLowerCase()
  return <Badge tone={TONE[key] || 'neutral'} size={size}>{status || 'Unknown'}</Badge>
}
