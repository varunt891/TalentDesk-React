import { useRef, useState } from 'react'
import { Button, Input, Checkbox, Badge, Icon, Modal } from '../ui'
import { apiUpload } from '../../lib/api'

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.html', '.htm', '.xlsx']
const MAX_FILES = 20
const MAX_FILE_SIZE = 5 * 1024 * 1024

function extOf(fileName) {
  const match = /\.[a-z0-9]+$/i.exec(fileName || '')
  return match ? match[0].toLowerCase() : ''
}

function emptyProfile() {
  return { first_name: '', last_name: '', email: '', phone: '', job_title: '' }
}

export default function BulkResumeUploadModal({ isOpen, onClose, addCandidates, showToast }) {
  const [files, setFiles] = useState([])
  const [rejected, setRejected] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState(null)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef(null)

  const reset = () => {
    setFiles([])
    setRejected([])
    setResults(null)
    setUploading(false)
    setImporting(false)
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const addFiles = (incoming) => {
    const accepted = []
    const bad = []
    for (const file of incoming) {
      const ext = extOf(file.name)
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        bad.push(`${file.name} — unsupported file type`)
      } else if (file.size > MAX_FILE_SIZE) {
        bad.push(`${file.name} — over 5MB`)
      } else {
        accepted.push(file)
      }
    }
    setFiles(prev => {
      const combined = [...prev, ...accepted]
      if (combined.length > MAX_FILES) {
        bad.push(`Only the first ${MAX_FILES} files were kept (batch limit).`)
        return combined.slice(0, MAX_FILES)
      }
      return combined
    })
    if (bad.length) setRejected(bad)
  }

  const handleFileInput = (e) => {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    addFiles(Array.from(e.dataTransfer.files || []))
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleParse = async () => {
    if (!files.length) return
    setUploading(true)
    setRejected([])
    try {
      const xlsxFiles = files.filter(f => extOf(f.name) === '.xlsx')
      const docFiles = files.filter(f => extOf(f.name) !== '.xlsx')
      const combinedResults = []

      if (docFiles.length) {
        const formData = new FormData()
        docFiles.forEach(f => formData.append('files', f))
        const res = await apiUpload('/upload/resumes/bulk', formData)
        if (res?.success) combinedResults.push(...res.results)
        else throw new Error(res?.error || 'Bulk resume parsing failed.')
      }

      for (const xlsxFile of xlsxFiles) {
        const formData = new FormData()
        formData.append('file', xlsxFile)
        const res = await apiUpload('/upload/candidates/bulk-xlsx', formData)
        if (res?.success) combinedResults.push(...res.results)
        else throw new Error(res?.error || `Failed to read ${xlsxFile.name}.`)
      }

      setResults(combinedResults.map(r => ({
        ...r,
        profile: { ...emptyProfile(), ...r.profile },
        include: r.success,
      })))
      setFiles([])
    } catch (err) {
      showToast?.(err.message || 'Bulk upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const updateResultField = (index, field, value) => {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, profile: { ...r.profile, [field]: value } } : r))
  }

  const toggleInclude = (index, include) => {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, include } : r))
  }

  const includedCount = (results || []).filter(r => r.include).length

  const handleImport = async () => {
    const rows = (results || [])
      .filter(r => r.include)
      .map(r => ({
        ...r.profile,
        resume_text: r.extractedText || r.profile.resume_text || '',
        resume_file_key: r.resume_file_key || undefined,
        resume_file_name: r.resume_file_name || undefined,
        resume_file_size: r.resume_file_size || undefined,
      }))
      .filter(row => row.first_name)

    if (!rows.length) return showToast?.('Nothing selected to import.', 'error')

    setImporting(true)
    try {
      const { error } = await addCandidates(rows)
      if (error) throw new Error(error.message || 'Import failed.')
      showToast?.(`Imported ${rows.length} candidate${rows.length === 1 ? '' : 's'}!`)
      handleClose()
    } catch (err) {
      showToast?.(err.message || 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Bulk Upload Resumes"
      subtitle="Upload multiple resumes (.pdf, .docx, .doc, .txt, .html) or a structured roster (.xlsx) — review before importing."
      size="xl"
      footer={
        results ? (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" loading={importing} disabled={!includedCount} onClick={handleImport}>
              Import {includedCount} Candidate{includedCount === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" loading={uploading} disabled={!files.length} onClick={handleParse}>
              Parse {files.length || ''} File{files.length === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {!results && (
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-[var(--radius-md)] p-8 text-center cursor-pointer hover:border-accent hover:bg-surface2/50 transition-colors"
          >
            <Icon name="inbox" size={22} className="mx-auto text-text3 mb-2" />
            <p className="text-sm text-text2">Drag &amp; drop resumes here, or click to browse</p>
            <p className="text-xs text-text3 mt-1">.pdf, .doc, .docx, .txt, .html, .xlsx — up to {MAX_FILES} files, 5MB each</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {rejected.length > 0 && (
            <div className="text-xs text-red flex flex-col gap-1">
              {rejected.map((msg, i) => <span key={i}>{msg}</span>)}
            </div>
          )}

          {files.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-surface2 border border-border text-sm">
                  <span className="truncate text-text2">{file.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-text3 hover:text-red shrink-0" aria-label={`Remove ${file.name}`}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text3">{results.length} file{results.length === 1 ? '' : 's'} processed — review &amp; edit before importing.</p>
            <Button size="xs" variant="secondary" onClick={reset}>Start Over</Button>
          </div>
          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className={`rounded-[var(--radius-md)] border p-3 ${r.success ? 'border-border bg-surface2/60' : 'border-red/30 bg-red/5'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox checked={!!r.include} disabled={!r.success} onChange={e => toggleInclude(i, e.target.checked)} />
                    <span className="text-xs font-semibold text-text2 truncate">{r.fileName}</span>
                    {r.resume_file_name && <Badge tone="green" size="sm">File saved</Badge>}
                  </div>
                  {!r.success && <Badge tone="red" size="sm">Error</Badge>}
                </div>
                {r.success ? (
                  <div className="grid sm:grid-cols-2 gap-2">
                    <Input size="sm" placeholder="First name" value={r.profile.first_name} onChange={e => updateResultField(i, 'first_name', e.target.value)} />
                    <Input size="sm" placeholder="Last name" value={r.profile.last_name} onChange={e => updateResultField(i, 'last_name', e.target.value)} />
                    <Input size="sm" placeholder="Email" value={r.profile.email} onChange={e => updateResultField(i, 'email', e.target.value)} />
                    <Input size="sm" placeholder="Phone" value={r.profile.phone} onChange={e => updateResultField(i, 'phone', e.target.value)} />
                    <Input size="sm" placeholder="Job title" className="sm:col-span-2" value={r.profile.job_title} onChange={e => updateResultField(i, 'job_title', e.target.value)} />
                  </div>
                ) : (
                  <p className="text-xs text-red">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
