import React from 'react'

export default function MarkdownView({ content }) {
  if (!content) return null

  const formatInline = (str) => {
    return str
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1 ↗</a>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
  }

  const lines = content.split('\n')
  const elements = []
  let codeBlockLines = null
  let listItems = []
  let tableRows = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}-${Math.random()}`} className="md-list" style={{ paddingLeft: '20px', margin: '10px 0', listStyleType: 'disc' }}>
          {listItems.map((li, idx) => (
            <li key={idx} style={{ marginBottom: '6px', color: 'var(--text, #fff)', fontSize: '13.5px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: formatInline(li) }} />
          ))}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      const cleanRows = tableRows.filter(row => !row.every(cell => /^[\s:-]+$/.test(cell)))
      if (cleanRows.length > 0) {
        const header = cleanRows[0]
        const body = cleanRows.slice(1)
        elements.push(
          <div key={`table-${elements.length}-${Math.random()}`} style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid var(--border, #2d303e)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: 'var(--text, #fff)' }}>
              <thead>
                <tr style={{ background: 'var(--surface, #181920)', borderBottom: '1px solid var(--border, #2d303e)' }}>
                  {header.map((cell, idx) => (
                    <th key={idx} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--accent, #4f7cff)' }} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: rIdx === body.length - 1 ? 'none' : '1px solid var(--border, #2d303e)', background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '10px 14px' }} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      tableRows = []
    }
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()

    // Table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList()
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim())
      tableRows.push(cells)
      return
    } else {
      flushTable()
    }

    // Code Block
    if (trimmed.startsWith('```')) {
      if (codeBlockLines !== null) {
        const codeText = codeBlockLines.join('\n')
        elements.push(
          <div key={`code-${idx}`} style={{ margin: '14px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border, #2d303e)', background: 'var(--surface, #181920)' }}>
            <div style={{ padding: '6px 14px', background: 'var(--surface2, #212330)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #2d303e)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3, #8f92a1)', textTransform: 'uppercase', fontFamily: "'Space Mono', monospace" }}>Output</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(codeText)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent, #4f7cff)', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
              >
                📋 Copy
              </button>
            </div>
            <pre style={{ padding: '14px', margin: 0, overflowX: 'auto', fontFamily: "'Space Mono', monospace", fontSize: '12.5px', color: 'var(--text, #fff)' }}>
              <code>{codeText}</code>
            </pre>
          </div>
        )
        codeBlockLines = null
      } else {
        flushList()
        codeBlockLines = []
      }
      return
    }

    if (codeBlockLines !== null) {
      codeBlockLines.push(line)
      return
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      flushList()
      elements.push(<hr key={`hr-${idx}`} style={{ border: 'none', borderTop: '1px solid var(--border, #2d303e)', margin: '20px 0' }} />)
      return
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(
        <h3 key={`h3-${idx}`} style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent, #4f7cff)', marginTop: '20px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {trimmed.replace('### ', '')}
        </h3>
      )
      return
    }

    if (trimmed.startsWith('#### ')) {
      flushList()
      elements.push(
        <h4 key={`h4-${idx}`} style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text, #fff)', marginTop: '16px', marginBottom: '8px' }}>
          {trimmed.replace('#### ', '')}
        </h4>
      )
      return
    }

    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h2 key={`h2-${idx}`} style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text, #fff)', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid var(--border, #2d303e)', paddingBottom: '6px' }}>
          {trimmed.replace('## ', '')}
        </h2>
      )
      return
    }

    // Bullets
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const cleanLine = trimmed.replace(/^[•*-]\s*/, '')
      listItems.push(cleanLine)
      return
    }

    // Paragraph
    if (trimmed.length > 0) {
      flushList()
      elements.push(
        <p
          key={`p-${idx}`}
          style={{ margin: '8px 0', fontSize: '13.5px', lineHeight: '1.65', color: 'var(--text2, #b0b4c0)' }}
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }}
        />
      )
    } else {
      flushList()
    }
  })

  flushList()
  flushTable()

  return <div className="markdown-rendered-view" style={{ wordBreak: 'break-word' }}>{elements}</div>
}
