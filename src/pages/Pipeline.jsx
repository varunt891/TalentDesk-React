import { useState } from 'react'
import { useCandidates } from '../hooks/useCandidates'

const STAGES = [
  { id: 'Submitted', label: 'Submitted', color: '#acaeb5' },
  { id: 'Shortlisted', label: 'Shortlisted', color: '#ff8c42' },
  { id: 'Interview Scheduled', label: 'Interview Scheduled', color: '#4f7cff' },
  { id: 'Interview Done', label: 'Interview Done', color: '#7c5cff' },
  { id: 'Offer Extended', label: 'Offer Extended', color: '#f5c842' },
  { id: 'Hired', label: 'Hired', color: '#2ecc8f' },
  { id: 'Rejected', label: 'Rejected', color: '#ff4d6a' },
]

export default function Pipeline() {
  const { candidates, loading, updateCandidate } = useCandidates()
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage] = useState(null)

  const moveCandidate = async (candidateId, externalStatus) => {
    const candidate = candidates.find(item => item.id === candidateId)
    if (!candidate || candidate.external_status === externalStatus) return
    await updateCandidate(candidateId, { external_status: externalStatus })
  }

  const handleDragStart = (event, candidateId) => {
    setDraggingId(candidateId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', candidateId)
  }

  const handleDrop = async (event, stageId) => {
    event.preventDefault()
    const candidateId = event.dataTransfer.getData('text/plain') || draggingId
    setOverStage(null)
    setDraggingId(null)
    if (candidateId) await moveCandidate(candidateId, stageId)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={topbarStyle}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)' }}>
          Pipeline <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>Client / external status</span>
        </div>
      </div>

      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text3)', fontSize: '12px' }}>
        Drag a candidate between columns to update only their external status. Internal status stays unchanged.
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '24px' }}>
        {loading ? <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px' }}>Loading...</div> : (
          <div style={{ display: 'flex', gap: '16px', height: '100%', minWidth: 'max-content' }}>
            {STAGES.map(stage => {
              const cards = candidates.filter(c => c.external_status === stage.id)
              const isOver = overStage === stage.id
              return (
                <div
                  key={stage.id}
                  onDragOver={event => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setOverStage(stage.id)
                  }}
                  onDragLeave={() => setOverStage(null)}
                  onDrop={event => handleDrop(event, stage.id)}
                  style={{
                    width: '286px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isOver ? `${stage.color}12` : 'var(--surface)',
                    border: `1px solid ${isOver ? stage.color : 'var(--border)'}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>{stage.label}</div>
                    <div style={{ background: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}44`, borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '700', fontFamily: "'Space Mono',monospace" }}>{cards.length}</div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {cards.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text3)', fontSize: '12px', border: `1px dashed ${isOver ? stage.color : 'var(--border)'}`, borderRadius: '8px' }}>
                        Drop here
                      </div>
                    ) : cards.map(c => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={event => handleDragStart(event, c.id)}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setOverStage(null)
                        }}
                        style={{
                          background: draggingId === c.id ? 'var(--surface3)' : 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '12px',
                          marginBottom: '8px',
                          cursor: 'grab',
                          opacity: draggingId === c.id ? 0.62 : 1,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = stage.color
                          e.currentTarget.style.transform = 'translateY(-1px)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.transform = 'none'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>{c.job_title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{c.client}</div>
                        {c.fe_name && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{c.fe_name}</div>}
                        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: c.priority === 'High' ? 'var(--red)' : c.priority === 'Low' ? 'var(--text3)' : 'var(--yellow)', fontWeight: '700' }}>
                            {c.priority} priority
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: "'Space Mono',monospace" }}>{c.submission_date}</span>
                        </div>
                        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(44,49,72,0.65)', paddingTop: '7px', color: 'var(--text3)', fontSize: '10px' }}>
                          Internal: <span style={{ color: 'var(--text2)' }}>{c.internal_status || 'Pending'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const topbarStyle = {
  height: '58px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 24px',
  flexShrink: 0,
}
