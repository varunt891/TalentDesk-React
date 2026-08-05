import { Icon } from '../ui/icons'

export default function CollisionWarning({ matches }) {
  if (!matches || !matches.length) return null

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-red/30 bg-red/8 px-4 py-3 text-xs leading-relaxed">
      <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5 text-red" />
      <div className="text-text2 min-w-0">
        <strong className="text-red">Possible duplicate submission.</strong>
        {matches.map((m, i) => (
          <div key={m.candidate.id || i} className="mt-1">
            {m.candidate.first_name} {m.candidate.last_name} was already submitted
            {m.type === 'hard' ? ' to this exact job' : ` to ${m.candidate.client || 'this client'}`}
            {m.candidate.recruiter_name ? ` by ${m.candidate.recruiter_name}` : ''}.
          </div>
        ))}
      </div>
    </div>
  )
}
