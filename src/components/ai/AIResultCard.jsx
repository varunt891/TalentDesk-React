import { Icon, Menu, cn } from '../ui'
import MarkdownView from '../MarkdownView'

/**
 * The shared "AI output" surface — used by ActionsPanel and
 * SalaryAnalysisPanel so every generated result in AI Center reads as one
 * consistent, premium artifact instead of a plain bordered text block:
 * a thin accent→ai gradient top edge, a sparkle-marked label, and a
 * typing cursor while streaming. Renders nothing if there's no result yet
 * and nothing is streaming.
 *
 * `subject` (optional) is a short one-line description of what this
 * specific result is about — e.g. `"Michael Anderson" vs "Senior AI/ML
 * Engineer"` for a comparison, or `Draft — "Dentist, location: Norfolk...`
 * for a single-input action — so a result reads as self-explanatory on its
 * own instead of just "Result" with no indication of what was actually run.
 *
 * `onExportWord`/`onExportPdf` populate an "Export" dropdown (Menu) rather
 * than two separate buttons crowding the header row.
 */
export default function AIResultCard({ streaming, streamingText, result, subject, copied, onCopy, onExportWord, onExportPdf }) {
  if (!streaming && !result) return null
  const showThinking = streaming && !streamingText

  return (
    <div className="relative rounded-[var(--radius-lg)] border border-border bg-surface shadow-xs overflow-hidden">
      <div className="h-[2px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, var(--accent), var(--ai))' }} />
      <div className="p-4">
        <div className={cn('flex items-center justify-between gap-3', subject ? 'mb-1' : 'mb-3')}>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ai shrink-0">
            <Icon name="sparkles" size={11} />
            {streaming ? 'Generating…' : 'Result'}
          </span>
          {result && !streaming && (
            <div className="flex items-center gap-2.5 shrink-0">
              <Menu
                align="end"
                items={[
                  { label: 'Word (.docx)', icon: 'download', onClick: onExportWord },
                  { label: 'PDF (.pdf)', icon: 'download', onClick: onExportPdf },
                ]}
                trigger={({ toggle }) => (
                  <button type="button" onClick={toggle} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1 transition-colors duration-[var(--duration-fast)]">
                    <Icon name="download" size={10} /> Export <Icon name="chevronDown" size={9} />
                  </button>
                )}
              />
              <button type="button" onClick={onCopy} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1 transition-colors duration-[var(--duration-fast)]">
                <Icon name={copied ? 'check' : 'copy'} size={10} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
        {subject && <p className="text-[14.5px] font-semibold text-text mb-3 truncate" title={subject}>{subject}</p>}
        {showThinking ? (
          <div className="flex items-center gap-1.5 py-1">
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ai animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        ) : (
          <>
            <MarkdownView content={streaming ? streamingText : result} />
            {streaming && <span className="inline-block w-1.5 h-3.5 bg-ai align-middle animate-pulse ml-0.5" />}
          </>
        )}
      </div>
    </div>
  )
}
