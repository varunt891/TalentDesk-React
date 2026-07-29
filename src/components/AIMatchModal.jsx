import { useState, useEffect } from 'react'
import { apiRequest } from '../lib/api'
import MarkdownView from './MarkdownView'

export default function AIMatchModal({ isOpen, onClose, candidate, job, onOpenSubmissionPacket, onMatchEvaluated }) {
  const [loading, setLoading] = useState(false)
  const [matchResult, setMatchResult] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isOpen && candidate && job) {
      evaluateFit()
    } else {
      setMatchResult('')
      setError(null)
    }
  }, [isOpen, candidate?.id, job?.id])

  const evaluateFit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiRequest('/ai/match-evaluator', {
        method: 'POST',
        body: {
          candidate,
          job,
          resumeText: candidate.resume_text || ''
        }
      })
      if (res.text) {
        setMatchResult(res.text)
        // Extract score if present
        const match = res.text.match(/Fit Score:\s*\[?(\d+)/i) || res.text.match(/(\d+)\s*\/\s*100/) || res.text.match(/Score:\s*(\d+)/i)
        if (match && match[1] !== undefined) {
          const scoreNum = parseInt(match[1], 10)
          if (!isNaN(scoreNum) && onMatchEvaluated) {
            onMatchEvaluated(candidate.id, job.id || job.job_id, scoreNum)
          }
        }
      } else {
        throw new Error(res.error || 'Failed to evaluate fit.')
      }
    } catch (err) {
      setError(err.message || 'Error evaluating AI fit.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(matchResult)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--surface, #181920)',
        border: '1px solid var(--border, #2d303e)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border, #2d303e)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface2, #212330)',
          flexShrink: 0
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text, #fff)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎯 Deep AI Fit Radar & Screening Script</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3, #8f92a1)', marginTop: '2px' }}>
              Candidate: <strong style={{ color: 'var(--text, #fff)' }}>{candidate?.first_name} {candidate?.last_name}</strong> vs <strong style={{ color: 'var(--accent, #4f7cff)' }}>{job?.title} ({job?.job_id || 'Req'})</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3, #8f92a1)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border, #2d303e)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'var(--surface, #181920)',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '12.5px', color: 'var(--text2, #b0b4c0)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Evaluating semantic fit, technical gaps, & recruiter screening call questions</span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={evaluateFit}
              disabled={loading}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border, #2d303e)',
                background: 'var(--surface2, #212330)',
                color: 'var(--text, #fff)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🔄 Re-evaluate
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !matchResult}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border, #2d303e)',
                background: 'var(--surface2, #212330)',
                color: 'var(--text, #fff)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: (loading || !matchResult) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy Analysis'}
            </button>
            {onOpenSubmissionPacket && (
              <button
                onClick={() => {
                  onClose()
                  onOpenSubmissionPacket(candidate, job)
                }}
                disabled={loading}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--accent, #4f7cff), #7c5cff)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(79, 124, 255, 0.3)'
                }}
              >
                ⚡ Generate Client Submittal
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          fontFamily: "'Inter', sans-serif"
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.5s linear infinite' }}>🎯</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text, #fff)', marginBottom: '8px' }}>
                AI is analyzing candidate experience depth against job requisition...
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text3, #8f92a1)', maxWidth: '440px', margin: '0 auto' }}>
                Evaluating seniority alignment, tech stack gaps, visa/rate constraints, and generating screening call questions.
              </div>
            </div>
          ) : error ? (
            <div style={{
              background: 'rgba(255, 77, 77, 0.1)',
              border: '1px solid rgba(255, 77, 77, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              color: 'var(--red, #ff4d4d)'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '6px' }}>Evaluation Failed</div>
              <div style={{ fontSize: '13px' }}>{error}</div>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface2, #212330)',
              border: '1px solid var(--border, #2d303e)',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <MarkdownView content={matchResult} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
