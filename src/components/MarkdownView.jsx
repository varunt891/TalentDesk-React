/**
 * Lightweight line-based markdown renderer for AI output (headings, bold/
 * italic/code, links, bullet lists, tables, code blocks, horizontal rules).
 * Not a full CommonMark parser — matches exactly what the AI Action
 * Framework's prompts actually produce, styled with the shared design
 * tokens so AI output reads like a native part of the product rather than
 * a generic markdown dump.
 */
export default function MarkdownView({ content }) {
  if (!content) return null
  // A plain local counter (not state/a ref) — scoped to this single render
  // pass and rebuilt fresh from `content` every time, so it stays a pure
  // function of the input instead of persisting anything across renders.
  let keySeq = 0
  const nextKey = (prefix) => `${prefix}-${keySeq++}`

  // Escaped first so raw user-typed/pasted HTML (e.g. `<script>`) can never
  // reach dangerouslySetInnerHTML below — markdown syntax chars (*, `, [, ])
  // aren't HTML-special, so escaping first doesn't interfere with the
  // substitutions that follow.
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const formatInline = (str) => {
    return escapeHtml(str)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-accent font-semibold hover:underline underline-offset-2">$1 ↗</a>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-text">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="font-mono text-[0.92em] bg-surface3 text-accent rounded px-1.5 py-0.5">$1</code>')
  }

  const lines = content.split('\n')
  const elements = []
  let codeBlockLines = null
  let codeBlockLang = ''
  let listItems = []
  let listType = null // 'ul' | 'ol'
  let tableRows = []

  const flushList = () => {
    if (listItems.length > 0) {
      const Tag = listType === 'ol' ? 'ol' : 'ul'
      elements.push(
        <Tag key={nextKey(Tag)} className={Tag === 'ol' ? 'list-decimal pl-5 my-2.5 space-y-1.5 marker:text-text3' : 'list-disc pl-5 my-2.5 space-y-1.5 marker:text-text3'}>
          {listItems.map((li, idx) => (
            <li key={idx} className="text-[13.5px] leading-relaxed text-text2" dangerouslySetInnerHTML={{ __html: formatInline(li) }} />
          ))}
        </Tag>
      )
      listItems = []
      listType = null
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      const cleanRows = tableRows.filter(row => !row.every(cell => /^[\s:-]+$/.test(cell)))
      if (cleanRows.length > 0) {
        const header = cleanRows[0]
        const body = cleanRows.slice(1)
        elements.push(
          <div key={nextKey('table')} className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-border shadow-xs">
            <table className="w-full border-collapse text-[13px] text-text">
              <thead>
                <tr className="bg-surface3">
                  {header.map((cell, idx) => (
                    <th key={idx} className="px-3.5 py-2.5 text-left font-bold text-accent whitespace-nowrap" dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-surface2/50' : undefined}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3.5 py-2.5 border-t border-border align-top" dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
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

  lines.forEach((line) => {
    const trimmed = line.trim()

    // Table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList()
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim())
      tableRows.push(cells)
      return
    } else {
      flushTable()
    }

    // Code block
    if (trimmed.startsWith('```')) {
      if (codeBlockLines !== null) {
        const codeText = codeBlockLines.join('\n')
        elements.push(
          <div key={nextKey('code')} className="my-3.5 rounded-[var(--radius-md)] overflow-hidden border border-border bg-surface shadow-xs">
            <div className="flex items-center justify-between px-3.5 py-2 bg-surface3 border-b border-border">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider font-mono">{codeBlockLang || 'Output'}</span>
              <CopyButton text={codeText} />
            </div>
            <pre className="p-3.5 m-0 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-text">
              <code>{codeText}</code>
            </pre>
          </div>
        )
        codeBlockLines = null
        codeBlockLang = ''
      } else {
        flushList()
        codeBlockLines = []
        codeBlockLang = trimmed.slice(3).trim()
      }
      return
    }

    if (codeBlockLines !== null) {
      codeBlockLines.push(line)
      return
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***') {
      flushList()
      elements.push(<hr key={nextKey('hr')} className="border-0 border-t border-border my-5" />)
      return
    }

    // Headings — order matters: check longest marker first so "## " isn't
    // ever mistaken for "# " (a plain startsWith('# ') check would never
    // match "## " anyway since index 1 is '#' not a space, but keeping the
    // most-specific-first order makes that invariant obvious here).
    if (trimmed.startsWith('#### ')) {
      flushList()
      elements.push(<h4 key={nextKey('h4')} className="text-[13.5px] font-bold text-text mt-4 mb-2" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(5)) }} />)
      return
    }
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(<h3 key={nextKey('h3')} className="text-[15px] font-bold text-text mt-5 mb-2.5 flex items-center gap-2" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(4)) }} />)
      return
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h2 key={nextKey('h2')} className="text-[17px] font-extrabold text-text tracking-tight mt-6 mb-3 pb-2 border-b border-border" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(3)) }} />
      )
      return
    }
    if (trimmed.startsWith('# ')) {
      flushList()
      elements.push(
        <h1 key={nextKey('h1')} className="text-[19px] font-extrabold text-text tracking-tight mt-1 mb-3.5 pb-2.5 border-b border-border" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }} />
      )
      return
    }

    // Bullets
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(trimmed.replace(/^[•*-]\s*/, ''))
      return
    }

    // Numbered lists (e.g. "1. ", "2. ")
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''))
      return
    }

    // Paragraph
    if (trimmed.length > 0) {
      flushList()
      elements.push(
        <p key={nextKey('p')} className="my-2 text-[13.5px] leading-relaxed text-text2" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
      )
    } else {
      flushList()
    }
  })

  flushList()
  flushTable()

  return <div className="markdown-rendered-view break-words">{elements}</div>
}

function CopyButton({ text }) {
  const copy = () => navigator.clipboard.writeText(text)
  return (
    <button type="button" onClick={copy} className="text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors duration-[var(--duration-fast)]">
      Copy
    </button>
  )
}
