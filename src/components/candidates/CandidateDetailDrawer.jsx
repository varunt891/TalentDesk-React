import { useState, useMemo } from 'react'
import { EntityDrawer } from '../workspace'
import { Button, Badge, StatusPill, Icon, useToast } from '../ui'
import MarkdownView from '../MarkdownView'
import { ensureArray } from '../../lib/candidateHealth'

/**
 * Parses raw candidate notes or resume text into executive summary + structured experience cards
 */
export function parseWorkTimeline(notesText) {
  if (!notesText || typeof notesText !== 'string') return { summary: '', items: [] }

  const cleanText = notesText.replace(/\r\n?/g, '\n').trim()
  const timelineMatch = /^(?:WORK EXPERIENCE TIMELINE|WORK HISTORY|EXPERIENCE TIMELINE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT HISTORY)\s*:?\s*$/im.exec(cleanText)
  if (!timelineMatch) {
    const summary = /(?:CANDIDATE:|HEADLINE:|SOURCE URL?:|={4,}|FULL DOCUMENT)/i.test(cleanText) ? '' : cleanText
    return { summary, items: [] }
  }

  const contentStart = timelineMatch.index + timelineMatch[0].length
  const remainingText = cleanText.slice(contentStart)
  const nextSection = /^(?:EDUCATION(?: & QUALIFICATIONS)?|SKILLS|FULL DOCUMENT(?: TEXT)?|ABOUT BIO|SUMMARY)\s*:?\s*$/im.exec(remainingText)
  const timelineContent = (nextSection ? remainingText.slice(0, nextSection.index) : remainingText).trim()
  const rawItems = timelineContent.split(/(?=^\d+\.\s+)/m).map(s => s.trim()).filter(s => /^\d+\.\s+/.test(s))
  const summary = cleanText.slice(0, timelineMatch.index).replace(/^[=\s]+|[=\s]+$/g, '').trim()

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

  const fullName = `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim() || candidate?.name || 'Candidate Details'
  const skillsList = ensureArray(candidate?.skills)
  const isSourced = !candidate?.internal_status || candidate.internal_status === 'Sourced'
  const notesText = candidate?.notes || candidate?.resume_text || ''

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

  if (!candidate) return null

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'experience', label: 'Work History', count: parsedTimeline.items.length },
    { id: 'skills', label: 'Skills & Keywords', count: skillsList.length },
    { id: 'resume', label: 'Full Resume & Notes' },
  ]

  const profileFacts = [
    { label: 'Current / last company', value: candidate.client || candidate.company, icon: 'building' },
    { label: 'Target requisition', value: candidate.job_id ? `${candidate.job_id}${candidate.job_title ? ` · ${candidate.job_title}` : ''}` : 'Unassigned', icon: 'briefcase' },
    { label: 'Work authorization', value: candidate.work_authorization || candidate.work_auth || candidate.visa_status || candidate.authorization, icon: 'shield' },
    { label: 'Total experience', value: candidate.experience || candidate.experience_years || candidate.total_experience, icon: 'clock' },
    { label: 'Expected rate', value: candidate.pay_rate || candidate.bill_rate || candidate.salary || candidate.rate, icon: 'sparkles' },
    { label: 'Recruiter', value: candidate.recruiter_name || candidate.assigned_to, icon: 'user' },
  ].filter(fact => Boolean(fact.value))

  const sourceUrl = candidate.linkedin || candidate.source_url
  const overviewSummary = candidate.executive_summary || candidate.summary || (
    parsedTimeline.summary && !/(?:CANDIDATE:|HEADLINE:|SOURCE:|={4,}|PARSED RESUME)/i.test(parsedTimeline.summary)
      ? parsedTimeline.summary
      : ''
  )

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
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {isSourced && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                <Badge tone="teal" size="sm">Sourced</Badge>
                {candidate.created_at && <span className="text-text3">Added {new Date(candidate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              </div>
            )}

            <section aria-label="Contact information">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2">Contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {candidate.email && (
                  <div className="flex items-center justify-between gap-3 py-3 border-t border-border/70 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-text3 mb-1">Email</div>
                      <a href={`mailto:${candidate.email}`} className="text-sm font-medium text-text hover:text-accent truncate block">{candidate.email}</a>
                    </div>
                    <button type="button" onClick={() => copyToClipboard(candidate.email, 'Email')} className="text-text3 hover:text-accent p-1" title="Copy email" aria-label="Copy email">
                      <Icon name={copiedField === 'Email' ? 'check' : 'copy'} size={14} />
                    </button>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center justify-between gap-3 py-3 border-t border-border/70 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-text3 mb-1">Phone</div>
                      <a href={`tel:${candidate.phone}`} className="text-sm font-medium text-text hover:text-accent truncate block">{candidate.phone}</a>
                    </div>
                    <button type="button" onClick={() => copyToClipboard(candidate.phone, 'Phone')} className="text-text3 hover:text-accent p-1" title="Copy phone" aria-label="Copy phone">
                      <Icon name={copiedField === 'Phone' ? 'check' : 'copy'} size={14} />
                    </button>
                  </div>
                )}
                {candidate.location && (
                  <div className="py-3 border-t border-border/70 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-text3 mb-1">Location</div>
                    <div className="text-sm font-medium text-text">{candidate.location}</div>
                  </div>
                )}
              </div>
            </section>

            {profileFacts.length > 0 && (
              <section aria-label="Candidate details">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2">Candidate details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
                  {profileFacts.map(fact => (
                    <div key={fact.label} className="py-3 border-t border-border/70 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text3 mb-1">
                        <Icon name={fact.icon} size={12} className="text-accent" /> {fact.label}
                      </div>
                      <div className={`text-sm font-medium truncate ${fact.label === 'Target requisition' && !candidate.job_id ? 'text-text3' : 'text-text'}`}>{fact.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sourceUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-y border-border/70">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text3">Source profile</span>
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline flex items-center gap-1 min-w-0">
                  <span className="truncate">{sourceUrl}</span><Icon name="externalLink" size={12} className="shrink-0" />
                </a>
              </div>
            )}

            {overviewSummary && (
              <section aria-label="Candidate summary">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2">Professional summary</h3>
                <p className="text-sm text-text2 leading-relaxed whitespace-pre-wrap">{overviewSummary}</p>
              </section>
            )}

            {/* Top Skills Preview */}
            {skillsList.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="code" size={14} className="text-accent" /> Skills ({skillsList.length})
                  </h3>
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
                      className="px-2 py-1 rounded-md bg-surface2 text-xs font-medium text-text border border-border/60"
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
