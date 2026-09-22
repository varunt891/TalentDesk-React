import { useState, useMemo } from 'react'
import { EntityDrawer } from '../workspace'
import { Button, Badge, StatusPill, Icon, Avatar, useToast, cn } from '../ui'
import MarkdownView from '../MarkdownView'
import { ensureArray } from '../../lib/candidateHealth'

/**
 * Parses raw candidate notes or resume text into executive summary + structured experience cards
 */
export function parseWorkTimeline(notesText) {
  if (!notesText || typeof notesText !== 'string') return { summary: '', items: [] }

  const cleanText = notesText.trim()
  
  // Look for timeline header
  const timelineMatch = cleanText.match(/(?:WORK EXPERIENCE TIMELINE:|WORK HISTORY:|EXPERIENCE TIMELINE:|WORK EXPERIENCE:)/i)
  
  let summary = cleanText
  let timelineContent = ''

  if (timelineMatch) {
    const splitIndex = timelineMatch.index
    summary = cleanText.substring(0, splitIndex).trim()
    timelineContent = cleanText.substring(splitIndex + timelineMatch[0].length).trim()
  }

  if (!timelineContent && cleanText.match(/\b\d+\.\s+[A-Z]/)) {
    timelineContent = cleanText
    summary = ''
  }

  if (!timelineContent) {
    return { summary: cleanText, items: [] }
  }

  // Split by numbered items (e.g. "1. IT Business Support...", "2. Systems Engineer...")
  const rawItems = timelineContent.split(/(?=\b\d+\.\s+)/g).map(s => s.trim()).filter(Boolean)

  const items = rawItems.map((raw, idx) => {
    const cleanRaw = raw.replace(/^\d+\.\s*/, '')
    const lines = cleanRaw.split('\n').map(l => l.trim()).filter(Boolean)

    let firstLine = lines[0] || `Position #${idx + 1}`
    let role = firstLine
    let company = ''

    if (firstLine.includes(' at ')) {
      const parts = firstLine.split(' at ')
      role = parts[0].trim()
      company = parts.slice(1).join(' at ').trim()
    } else if (firstLine.includes(' - ')) {
      const parts = firstLine.split(' - ')
      role = parts[0].trim()
      company = parts.slice(1).join(' - ').trim()
    } else if (firstLine.includes(' | ')) {
      const parts = firstLine.split(' | ')
      role = parts[0].trim()
      company = parts.slice(1).join(' | ').trim()
    }

    let dates = ''
    let location = ''
    const details = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/^Dates?\s*(&|\/)?\s*Duration:\s*/i)) {
        dates = line.replace(/^Dates?\s*(&|\/)?\s*Duration:\s*/i, '').trim()
      } else if (line.match(/^Location:\s*/i)) {
        location = line.replace(/^Location:\s*/i, '').trim()
      } else if (line.match(/^Details:\s*/i)) {
        const detailText = line.replace(/^Details:\s*/i, '').trim()
        if (detailText) details.push(detailText)
      } else {
        details.push(line)
      }
    }

    return {
      id: idx,
      role: role || 'Role Title',
      company: company || '',
      dates: dates || '',
      location: location || '',
      details: details
    }
  })

  return { summary, items }
}

export default function CandidateDetailDrawer({
  candidate,
  isOpen,
  onClose,
  onPromote,
  onEdit,
  onDelete,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [skillSearch, setSkillSearch] = useState('')
  const [copiedField, setCopiedField] = useState(null)
  const { toast } = useToast()

  if (!candidate) return null

  const fullName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || candidate.name || 'Candidate Details'
  const skillsList = ensureArray(candidate.skills)
  const isSourced = !candidate.internal_status || candidate.internal_status === 'Sourced'
  const notesText = candidate.notes || candidate.resume_text || ''

  // Parse work timeline from notes
  const parsedTimeline = useMemo(() => parseWorkTimeline(notesText), [notesText])

  const copyToClipboard = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedField(label)
    toast({ title: `Copied ${label} to clipboard!` })
    setTimeout(() => setCopiedField(null), 2000)
  }

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skillsList
    return skillsList.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase().trim()))
  }, [skillsList, skillSearch])

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'experience', label: 'Work History', count: parsedTimeline.items.length },
    { id: 'skills', label: 'Skills & Keywords', count: skillsList.length },
    { id: 'resume', label: 'Full Resume & Notes' },
  ]

  return (
    <EntityDrawer
      open={Boolean(isOpen)}
      isOpen={Boolean(isOpen)}
      onClose={onClose}
      avatarName={fullName}
      title={fullName}
      subtitle={`${candidate.job_title || candidate.role || 'Sourced Candidate'} ${candidate.location ? `· ${candidate.location}` : ''}`}
      status={<StatusPill status={candidate.internal_status || 'Sourced'} />}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      size="2xl"
      actions={
        <div className="flex items-center justify-between w-full flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                onClick={() => onDelete(candidate)}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Delete
              </Button>
            )}
            {onEdit && (
              <Button variant="secondary" size="sm" icon="edit" onClick={() => onEdit(candidate)}>
                Edit Profile
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSourced && onPromote && (
              <Button
                variant="primary"
                size="sm"
                icon="arrowRight"
                onClick={() => onPromote(candidate)}
              >
                Promote to Active Candidate
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top Header Banner for Sourced Candidates */}
        {isSourced && (
          <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Sourced Candidate Record</span>
                <Badge tone="teal" size="sm">Status: {candidate.internal_status || 'Sourced'}</Badge>
              </div>
              <p className="text-[11px] text-text3 mt-0.5 leading-tight">
                Profile extracted via TalentDesk Sourcing Engine. Click Promote to assign to active hiring requisitions.
              </p>
            </div>

            {onPromote && (
              <Button
                variant="primary"
                size="sm"
                icon="arrowRight"
                onClick={() => onPromote(candidate)}
                className="shrink-0 w-full sm:w-auto"
              >
                Promote to Active Candidate
              </Button>
            )}
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Contact & Essential Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Email */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1">
                    <Icon name="mail" size={12} className="text-accent" /> Email Address
                  </span>
                  {candidate.email && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(candidate.email, 'Email')}
                      className="text-text3 hover:text-accent p-0.5 rounded transition-colors"
                      title="Copy Email"
                    >
                      <Icon name={copiedField === 'Email' ? 'check' : 'copy'} size={12} />
                    </button>
                  )}
                </div>
                {candidate.email ? (
                  <a
                    href={`mailto:${candidate.email}`}
                    className="text-xs font-semibold text-text hover:text-accent truncate select-all block"
                  >
                    {candidate.email}
                  </a>
                ) : (
                  <span className="text-xs text-text3 italic">Not provided</span>
                )}
              </div>

              {/* Phone */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1">
                    <Icon name="phone" size={12} className="text-accent" /> Phone Number
                  </span>
                  {candidate.phone && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(candidate.phone, 'Phone')}
                      className="text-text3 hover:text-accent p-0.5 rounded transition-colors"
                      title="Copy Phone"
                    >
                      <Icon name={copiedField === 'Phone' ? 'check' : 'copy'} size={12} />
                    </button>
                  )}
                </div>
                {candidate.phone ? (
                  <a
                    href={`tel:${candidate.phone}`}
                    className="text-xs font-semibold text-text hover:text-accent truncate select-all block"
                  >
                    {candidate.phone}
                  </a>
                ) : (
                  <span className="text-xs text-text3 italic">Not provided</span>
                )}
              </div>

              {/* Location */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="pin" size={12} className="text-accent" /> Location
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.location || 'Not Specified'}
                </span>
              </div>

              {/* Current Designation / Role */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="briefcase" size={12} className="text-accent" /> Current Role / Designation
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.job_title || candidate.current_role || candidate.role || 'Not Specified'}
                </span>
              </div>

              {/* Current Company */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="building" size={12} className="text-accent" /> Current / Last Company
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.client || candidate.company || 'Not Specified'}
                </span>
              </div>

              {/* Target Job Requisition */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="briefcase" size={12} className="text-accent" /> Target Requisition
                </span>
                {candidate.job_id ? (
                  <div className="text-xs font-semibold text-text truncate">
                    <span className="font-mono text-accent">{candidate.job_id}</span>
                    {candidate.job_title ? ` · ${candidate.job_title}` : ''}
                  </div>
                ) : (
                  <span className="text-xs text-amber-400 font-medium italic">Unassigned Requisition</span>
                )}
              </div>

              {/* Work Authorization */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="shield" size={12} className="text-accent" /> Work Authorization
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.work_authorization || candidate.visa_status || candidate.authorization || 'Not Specified'}
                </span>
              </div>

              {/* Total Experience */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="clock" size={12} className="text-accent" /> Total Experience
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.experience || candidate.experience_years || candidate.total_experience || 'Not Specified'}
                </span>
              </div>

              {/* Pay / Bill Rate */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="sparkles" size={12} className="text-accent" /> Expected / Pay Rate
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.pay_rate || candidate.bill_rate || candidate.salary || candidate.rate || 'Not Specified'}
                </span>
              </div>

              {/* Assigned Recruiter */}
              <div className="p-3 rounded-xl bg-surface2/70 border border-border/70 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Icon name="user" size={12} className="text-accent" /> Recruiter
                </span>
                <span className="text-xs font-semibold text-text truncate">
                  {candidate.recruiter_name || candidate.assigned_to || 'TalentDesk Recruiter'}
                </span>
              </div>
            </div>

            {/* Source Link & Created Date */}
            <div className="p-3.5 rounded-xl bg-surface2/70 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-text3 text-[11px] font-bold uppercase tracking-wider shrink-0">Source Link:</span>
                {candidate.linkedin || candidate.source_url ? (
                  <a
                    href={candidate.linkedin || candidate.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline flex items-center gap-1 font-mono text-xs truncate"
                  >
                    {candidate.linkedin || candidate.source_url}
                    <Icon name="externalLink" size={12} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-text3 italic">Web Imported Profile</span>
                )}
              </div>

              {candidate.created_at && (
                <div className="text-text3 text-[11px] shrink-0">
                  Imported on: <span className="font-semibold text-text">{new Date(candidate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            {/* Executive Summary Card */}
            {parsedTimeline.summary && (
              <div className="p-4 rounded-xl bg-surface2/50 border border-border/80">
                <h4 className="text-xs font-bold text-text uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Icon name="summarize" size={14} className="text-accent" /> Candidate Executive Summary
                </h4>
                <p className="text-xs text-text2 leading-relaxed whitespace-pre-wrap font-sans">
                  {parsedTimeline.summary}
                </p>
              </div>
            )}

            {/* Top Skills Preview */}
            {skillsList.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="code" size={14} className="text-accent" /> Key Skills & Competencies ({skillsList.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('skills')}
                    className="text-[11px] font-semibold text-accent hover:underline"
                  >
                    View All Skills →
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {skillsList.slice(0, 10).map((sk, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-surface2 text-xs font-semibold text-text border border-border/60 hover:border-accent/40 transition-colors"
                    >
                      {sk}
                    </span>
                  ))}
                  {skillsList.length > 10 && (
                    <span className="px-2 py-1 rounded-lg bg-accent/10 text-accent text-xs font-bold">
                      +{skillsList.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WORK HISTORY */}
        {activeTab === 'experience' && (
          <div className="space-y-4">
            {parsedTimeline.items.length === 0 ? (
              <div className="p-6 rounded-xl bg-surface2/50 border border-border text-center space-y-2">
                <Icon name="briefcase" size={24} className="mx-auto text-text3" />
                <p className="text-xs font-semibold text-text">No Structured Timeline Parsed</p>
                <p className="text-xs text-text3">
                  Full experience details are available under the <b>Full Resume & Notes</b> tab.
                </p>
                <Button size="xs" variant="secondary" onClick={() => setActiveTab('resume')} className="mt-2">
                  Go to Full Resume →
                </Button>
              </div>
            ) : (
              <div className="relative pl-4 space-y-6 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {parsedTimeline.items.map((item, idx) => (
                  <div key={idx} className="relative group">
                    {/* Timeline Node Dot */}
                    <span className="absolute -left-4 top-1.5 w-3 h-3 rounded-full bg-accent border-2 border-surface shadow-xs group-hover:scale-125 transition-transform" />

                    <div className="p-4 rounded-xl bg-surface2/70 border border-border/80 shadow-xs space-y-2.5">
                      {/* Role & Company Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div>
                          <h3 className="text-sm font-bold text-text tracking-tight">{item.role}</h3>
                          {item.company && (
                            <div className="text-xs font-semibold text-accent flex items-center gap-1 mt-0.5">
                              <Icon name="building" size={12} /> {item.company}
                            </div>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.dates && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface3 text-[11px] font-medium text-text2">
                              <Icon name="calendar" size={11} className="text-accent" /> {item.dates}
                            </span>
                          )}
                          {item.location && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface3 text-[11px] font-medium text-text2">
                              <Icon name="pin" size={11} className="text-accent" /> {item.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details & Accomplishments */}
                      {item.details && item.details.length > 0 && (
                        <div className="pt-2 border-t border-border/60 text-xs text-text2 leading-relaxed space-y-1">
                          {item.details.map((bullet, bIdx) => (
                            <div key={bIdx} className="flex items-start gap-2">
                              <span className="text-accent mt-1 text-[10px]">•</span>
                              <span className="flex-1">{bullet}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SKILLS & KEYWORDS */}
        {activeTab === 'skills' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Filter candidate skills..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface text-text text-xs focus:outline-none focus:border-accent"
                />
                <Icon name="search" size={14} className="absolute left-3 top-2.5 text-text3" />
              </div>

              {skillsList.length > 0 && (
                <Button
                  size="xs"
                  variant="secondary"
                  icon="copy"
                  onClick={() => copyToClipboard(skillsList.join(', '), 'Skills')}
                >
                  Copy All Skills
                </Button>
              )}
            </div>

            {filteredSkills.length === 0 ? (
              <div className="p-8 text-center text-xs text-text3 italic bg-surface2/50 rounded-xl border border-border">
                {skillSearch ? `No skills match "${skillSearch}".` : 'No technical skills recorded for this candidate.'}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {filteredSkills.map((sk, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 border border-border/80 text-xs font-semibold text-text flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Icon name="check" size={11} className="text-accent" />
                    {sk}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FULL RESUME & NOTES */}
        {activeTab === 'resume' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="postings" size={14} className="text-accent" /> Parsed Resume Text & Notes
              </span>
              {notesText && (
                <Button
                  size="xs"
                  variant="secondary"
                  icon="copy"
                  onClick={() => copyToClipboard(notesText, 'Resume Text')}
                >
                  Copy Full Resume
                </Button>
              )}
            </div>

            <div className="p-4 rounded-xl bg-surface2 border border-border text-xs text-text max-h-[520px] overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed shadow-inner">
              {notesText ? (
                <MarkdownView content={notesText} />
              ) : (
                <span className="text-text3 italic">No detailed resume notes recorded for this profile.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </EntityDrawer>
  )
}
