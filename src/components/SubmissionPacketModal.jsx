import { useState, useEffect } from 'react'
import { apiRequest } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import MarkdownView from './MarkdownView'

export default function SubmissionPacketModal({ isOpen, onClose, candidate, job }) {
  const { organization } = useAuth()
  const isEnterprise = (organization?.subscription_plan || 'Growth') === 'Enterprise'
  const brandHeader = isEnterprise ? (organization?.name || 'CONFIDENTIAL').toUpperCase() : 'TALENTDESK'

  const [loading, setLoading] = useState(false)
  const [packetText, setPacketText] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('packet')

  useEffect(() => {
    if (isOpen && candidate && job) {
      generatePacket()
    } else {
      setPacketText('')
      setError(null)
    }
  }, [isOpen, candidate?.id, job?.id])

  const generatePacket = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiRequest('/ai/submission-packet', {
        method: 'POST',
        body: {
          candidate,
          job,
          resumeText: candidate.resume_text || ''
        }
      })
      if (res.text) {
        setPacketText(res.text)
      } else {
        throw new Error(res.error || 'Failed to generate submission packet.')
      }
    } catch (err) {
      setError(err.message || 'Error generating submission package.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(packetText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderMarkdownToHtml = (markdown) => {
    if (!markdown) return ''

    const formatInline = (str) => {
      return str
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:#0f172a;">$1</code>')
    }

    const lines = markdown.split('\n')
    let html = ''
    let inList = false
    let inTable = false

    const closeList = () => {
      if (inList) {
        html += '</ul>'
        inList = false
      }
    }

    const closeTable = () => {
      if (inTable) {
        html += '</tbody></table>'
        inTable = false
      }
    }

    lines.forEach((line) => {
      const trimmed = line.trim()

      // Table row
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        closeList()
        const cells = trimmed.slice(1, -1).split('|').map(c => c.trim())
        if (cells.every(c => /^[\s:-]+$/.test(c))) return // skip header-body divider row

        if (!inTable) {
          html += '<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;border:1px solid #cbd5e1;"><thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;">'
          cells.forEach(c => {
            html += `<th style="padding:10px 12px;text-align:left;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;">${formatInline(c)}</th>`
          })
          html += '</tr></thead><tbody>'
          inTable = true
        } else {
          html += '<tr style="border-bottom:1px solid #e2e8f0;">'
          cells.forEach(c => {
            html += `<td style="padding:8px 12px;border:1px solid #cbd5e1;color:#334155;">${formatInline(c)}</td>`
          })
          html += '</tr>'
        }
        return
      } else {
        closeTable()
      }

      // Horizontal Rule
      if (trimmed === '---' || trimmed === '***') {
        closeList()
        html += '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>'
        return
      }

      // Headers
      if (trimmed.startsWith('### ')) {
        closeList()
        html += `<h3 style="color:#0d9488;font-size:16px;font-weight:700;margin-top:24px;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${formatInline(trimmed.replace('### ', ''))}</h3>`
        return
      }
      if (trimmed.startsWith('#### ')) {
        closeList()
        html += `<h4 style="color:#0f172a;font-size:14px;font-weight:700;margin-top:16px;margin-bottom:8px;">${formatInline(trimmed.replace('#### ', ''))}</h4>`
        return
      }
      if (trimmed.startsWith('## ')) {
        closeList()
        html += `<h2 style="color:#0f172a;font-size:18px;font-weight:800;margin-top:28px;margin-bottom:12px;border-bottom:2px solid #0d9488;padding-bottom:6px;">${formatInline(trimmed.replace('## ', ''))}</h2>`
        return
      }

      // Lists
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const text = trimmed.replace(/^[•*-]\s*/, '')
        if (!inList) {
          html += '<ul style="padding-left:20px;margin:10px 0;list-style-type:disc;">'
          inList = true
        }
        html += `<li style="margin-bottom:6px;color:#334155;line-height:1.6;font-size:13.5px;">${formatInline(text)}</li>`
        return
      }

      // Paragraph
      if (trimmed.length > 0) {
        closeList()
        html += `<p style="margin:8px 0;color:#334155;line-height:1.65;font-size:13.5px;">${formatInline(trimmed)}</p>`
      } else {
        closeList()
      }
    })

    closeList()
    closeTable()

    return html
  }

  const handlePrint = () => {
    const formattedBodyHtml = renderMarkdownToHtml(packetText)
    const printWin = window.open('', '_blank')
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Client Submission Packet - ${candidate?.first_name || ''} ${candidate?.last_name || ''}</title>
          <style>
            @media print {
              body { padding: 20px; }
              @page { margin: 1.5cm; }
            }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              line-height: 1.6;
              color: #1e293b;
              padding: 40px;
              max-width: 900px;
              margin: 0 auto;
            }
            h1, h2, h3, h4 { color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: 700; }
            ul { padding-left: 20px; }
            strong { color: #0f172a; }
          </style>
        </head>
        <body>
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
              <div style="font-size: 20px; font-weight: 800; color: #0d9488;">${brandHeader} SUBMISSION PACKET</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Confidential Client Submission Profile</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #64748b;">
              Date: ${new Date().toLocaleDateString()}
            </div>
          </div>
          ${formattedBodyHtml}
        </body>
      </html>
    `)
    printWin.document.close()
    setTimeout(() => {
      printWin.print()
    }, 250)
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
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
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
              <span>⚡ 1-Click Client Submission Package</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3, #8f92a1)', marginTop: '2px' }}>
              Candidate: <strong style={{ color: 'var(--text, #fff)' }}>{candidate?.first_name} {candidate?.last_name}</strong> → Target Job: <strong style={{ color: 'var(--accent, #0d9488)' }}>{job?.title} ({job?.job_id || 'Req'})</strong>
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

        {/* Action Toolbar */}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('packet')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: activeTab === 'packet' ? 'var(--accent, #0d9488)' : 'transparent',
                background: activeTab === 'packet' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: activeTab === 'packet' ? 'var(--accent, #0d9488)' : 'var(--text2, #b0b4c0)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              📄 Submission Packet
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: activeTab === 'raw' ? 'var(--accent, #0d9488)' : 'transparent',
                background: activeTab === 'raw' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: activeTab === 'raw' ? 'var(--accent, #0d9488)' : 'var(--text2, #b0b4c0)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              📋 Raw Text
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={generatePacket}
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
              🔄 Regenerate
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !packetText}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                background: copied ? 'var(--green, #2ecc8f)' : 'var(--accent, #0d9488)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                cursor: (loading || !packetText) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.2s'
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy Packet'}
            </button>
            <button
              onClick={handlePrint}
              disabled={loading || !packetText}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border, #2d303e)',
                background: 'var(--surface2, #212330)',
                color: 'var(--text, #fff)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: (loading || !packetText) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🖨️ Export PDF
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          fontFamily: "'Inter', sans-serif"
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px', animation: 'spin 1.5s linear infinite' }}>⚡</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text, #fff)', marginBottom: '8px' }}>
                AI is compiling Client Submission Packet...
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text3, #8f92a1)', maxWidth: '400px', margin: '0 auto' }}>
                Extracting skill matrix, executive pitch, candidate background, and drafting candidate RTR agreement.
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
              <div style={{ fontWeight: '700', marginBottom: '6px' }}>Generation Failed</div>
              <div style={{ fontSize: '13px' }}>{error}</div>
            </div>
          ) : activeTab === 'raw' ? (
            <textarea
              readOnly
              value={packetText}
              style={{
                width: '100%',
                height: '400px',
                background: 'var(--surface2, #212330)',
                border: '1px solid var(--border, #2d303e)',
                borderRadius: '8px',
                color: 'var(--text, #fff)',
                padding: '16px',
                fontFamily: "'Space Mono', monospace",
                fontSize: '13px',
                resize: 'none'
              }}
            />
          ) : (
            <div style={{
              background: 'var(--surface2, #212330)',
              border: '1px solid var(--border, #2d303e)',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <MarkdownView content={packetText} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
