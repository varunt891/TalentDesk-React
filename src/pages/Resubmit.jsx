import { useState, useEffect } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/api'
import SubmissionPacketModal from '../components/SubmissionPacketModal'
import AIMatchModal from '../components/AIMatchModal'

export default function Resubmit() {
  const { candidates } = useCandidates()
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [modalState, setModalState] = useState({ isOpen: false, candidate: null, job: null })
  const [aiMatchModal, setAiMatchModal] = useState({ isOpen: false, candidate: null, job: null })

  const loadJobs = async () => {
    const { data } = await db.from('jobs').select('*').eq('status', 'Open')
    setJobs(data || [])
  }

  useEffect(() => { if (user) loadJobs() }, [user])

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
    }).sort((a, b) => b.score - a.score).filter(job => job.score >= 30).slice(0, 3)
  }

  const openPacketModal = (candidate, job) => {
    setModalState({ isOpen: true, candidate, job })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ minHeight: '58px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '12px 24px', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>
          Re-submit Finder <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>{eligible.length} eligible candidates</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {eligible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔁</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text2)', marginBottom: '8px' }}>No eligible candidates</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Candidates with Rejected, Withdrew, or On Hold status will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {eligible.map(c => {
              const matches = getMatches(c)
              return (
                <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                      {c.first_name?.[0]}{c.last_name?.[0]}
                    </div>
                    <div style={{ minWidth: '160px' }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{c.first_name} {c.last_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Previously: {c.job_title} · <span style={{ color: 'var(--red)' }}>{c.internal_status}</span></div>
                    </div>
                    {c.skills?.length > 0 && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '100%' }}>
                        {c.skills.slice(0,5).map(s => (
                          <span key={s} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', color: 'var(--text3)' }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {matches.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', padding: '10px 0' }}>No matching open jobs found</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>✨ Matching Open Jobs</div>
                      {matches.map(job => (
                        <div key={job.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '220px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', marginBottom: '2px' }}>{job.title} <span style={{ color: 'var(--accent)', fontFamily: "'Space Mono',monospace", fontSize: '11px' }}>{job.job_id}</span></div>
                            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{job.client} · {job.location}</div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                              {job.overlap.map(s => (
                                <span key={s} style={{ background: 'rgba(46,204,143,0.1)', color: 'var(--green)', border: '1px solid rgba(46,204,143,0.3)', borderRadius: '4px', padding: '2px 7px', fontSize: '11px' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center', marginRight: '4px' }}>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: job.score >= 60 ? '#7c5cff' : job.score >= 30 ? 'var(--yellow)' : 'var(--red)', fontFamily: "'Space Mono',monospace" }}>{job.score}%</div>
                              <div style={{ fontSize: '10px', color: '#7c5cff', fontWeight: '700' }}>AI fit</div>
                            </div>
                            <button
                              onClick={() => setAiMatchModal({ isOpen: true, candidate: c, job })}
                              style={{
                                background: 'var(--surface3, #212330)',
                                color: 'var(--accent, #4f7cff)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              🎯 Deep AI Fit
                            </button>
                            <button
                              onClick={() => openPacketModal(c, job)}
                              style={{
                                background: 'linear-gradient(135deg, var(--accent), var(--accent2, #3b82f6))',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 8px rgba(79, 124, 255, 0.25)',
                                transition: 'transform 0.15s'
                              }}
                            >
                              ⚡ 1-Click Packet
                            </button>
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

      <SubmissionPacketModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, candidate: null, job: null })}
        candidate={modalState.candidate}
        job={modalState.job}
      />

      <AIMatchModal
        isOpen={aiMatchModal.isOpen}
        onClose={() => setAiMatchModal({ isOpen: false, candidate: null, job: null })}
        candidate={aiMatchModal.candidate}
        job={aiMatchModal.job}
        onOpenSubmissionPacket={(cand, j) => openPacketModal(cand, j)}
      />
    </div>
  )
}
