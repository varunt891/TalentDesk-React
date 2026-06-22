import { useState } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/api'

export default function Resubmit() {
  const { candidates } = useCandidates()
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])

  const loadJobs = async () => {
    const { data } = await db.from('jobs').select('*').eq('status', 'Open')
    setJobs(data || [])
  }

  useState(() => { if (user) loadJobs() })

  const eligible = candidates.filter(c => ['Rejected', 'Withdrew', 'On Hold'].includes(c.internal_status))

  const getMatches = (candidate) => {
    const cSkills = (candidate.skills || []).map(s => s.toLowerCase())
    return jobs.filter(job => {
      const jSkills = (job.skills || []).map(s => s.toLowerCase())
      const overlap = cSkills.filter(s => jSkills.includes(s))
      return overlap.length > 0 && job.job_id !== candidate.job_id
    }).map(job => {
      const cSkills2 = (candidate.skills || []).map(s => s.toLowerCase())
      const jSkills2 = (job.skills || []).map(s => s.toLowerCase())
      const overlap = cSkills2.filter(s => jSkills2.includes(s))
      return { ...job, overlap, score: Math.round((overlap.length / Math.max(jSkills2.length, 1)) * 100) }
    }).sort((a, b) => b.score - a.score).slice(0, 3)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: '58px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>
          Re-submit Finder <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>{eligible.length} eligible candidates</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {eligible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔁</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text2)', marginBottom: '8px' }}>No eligible candidates</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Candidates with Rejected, Withdrew, or On Hold status will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {eligible.map(c => {
              const matches = getMatches(c)
              return (
                <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff' }}>
                      {c.first_name?.[0]}{c.last_name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{c.first_name} {c.last_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Previously: {c.job_title} · <span style={{ color: 'var(--red)' }}>{c.internal_status}</span></div>
                    </div>
                    {c.skills?.length > 0 && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '300px' }}>
                        {c.skills.slice(0,5).map(s => (
                          <span key={s} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', color: 'var(--text3)' }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {matches.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', padding: '10px 0' }}>No matching open jobs found</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>✨ Matching Open Jobs</div>
                      {matches.map(job => (
                        <div key={job.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', marginBottom: '2px' }}>{job.title} <span style={{ color: 'var(--accent)', fontFamily: "'Space Mono',monospace", fontSize: '11px' }}>{job.job_id}</span></div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{job.client} · {job.location}</div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                              {job.overlap.map(s => (
                                <span key={s} style={{ background: 'rgba(46,204,143,0.1)', color: 'var(--green)', border: '1px solid rgba(46,204,143,0.3)', borderRadius: '4px', padding: '2px 7px', fontSize: '11px' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '22px', fontWeight: '700', color: job.score >= 60 ? 'var(--green)' : job.score >= 30 ? 'var(--yellow)' : 'var(--text3)', fontFamily: "'Space Mono',monospace" }}>{job.score}%</div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>match</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
