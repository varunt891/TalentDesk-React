import { useState, useEffect, useMemo } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, Card, CardHeader, KPICard, PageHeader, EmptyState, SearchBar, Badge, Select, Input, Textarea, FormField, Table, Modal, useToast } from '../components/ui'
import { Icon } from '../components/ui/icons'

const PORTALS = ['Indeed', 'Dice', 'LinkedIn', 'ZipRecruiter', 'Monster', 'CareerBuilder', 'Glassdoor', 'SimplyHired', 'Ladders', 'Recruit.net', 'JobsInTheUS', 'USAJobs', 'Handshake', 'AngelList', 'Stack Overflow']
const PORTAL_OPTIONS = [{ value: '', label: 'All Portals' }, ...PORTALS.map(p => ({ value: p, label: p }))]

const emptyForm = {
  portals: [], date: new Date().toISOString().slice(0, 10),
  job_id: '', job_title: '', location: '', manager: '', recruiter: '', link: '', notes: '',
}

const COLUMNS = [
  { key: 'portal', header: 'Portal', render: p => <Badge tone="accent" size="sm">{p.portal}</Badge> },
  { key: 'job_id', header: 'Job ID', render: p => <span className="font-[var(--mono)] text-xs text-accent">{p.job_id}</span> },
  {
    key: 'job_title', header: 'Job Title', render: p => (
      <div>
        <div className="font-semibold text-text">{p.job_title}</div>
        {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">View posting →</a>}
      </div>
    ),
  },
  { key: 'location', header: 'Location' },
  { key: 'manager', header: 'Manager' },
  { key: 'recruiter', header: 'Recruiter' },
]

export default function Postings() {
  const { user, profile } = useAuth()
  const { toast } = useToast()
  const [postings, setPostings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [portalFilter, setPortalFilter] = useState('')

  useEffect(() => { if (user) fetchPostings() }, [user])

  const fetchPostings = async () => {
    setLoading(true)
    const { data } = await db.from('postings').select('*').order('date', { ascending: false })
    setPostings(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => postings.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${p.portal} ${p.job_title} ${p.job_id} ${p.location}`.toLowerCase().includes(q)
    const matchPortal = !portalFilter || p.portal === portalFilter
    return matchSearch && matchPortal
  }), [postings, search, portalFilter])

  const postingStats = useMemo(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const thisWeek = postings.filter(p => p.date && new Date(p.date) >= weekAgo).length
    const portalCounts = postings.reduce((acc, p) => {
      if (p.portal) acc[p.portal] = (acc[p.portal] || 0) + 1
      return acc
    }, {})
    const distinctPortals = Object.keys(portalCounts).length
    const topPortal = Object.entries(portalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    return [
      { label: 'Total Postings', value: postings.length, helper: `${filtered.length} shown`, tone: 'accent', icon: 'postings' },
      { label: 'This Week', value: thisWeek, helper: 'last 7 days', tone: 'green', icon: 'calendar' },
      { label: 'Portals Used', value: distinctPortals, helper: 'distinct channels', tone: 'ai', icon: 'layers' },
      { label: 'Top Channel', value: topPortal, helper: 'most-used portal', tone: 'orange', icon: 'trendUp' },
    ]
  }, [postings, filtered])

  const grouped = useMemo(() => {
    const map = filtered.reduce((acc, p) => {
      const date = p.date || 'Unknown'
      if (!acc[date]) acc[date] = []
      acc[date].push(p)
      return acc
    }, {})
    return Object.keys(map).sort((a, b) => b.localeCompare(a)).map(date => ({ date, items: map[date] }))
  }, [filtered])

  const handleSave = async () => {
    if (!form.job_title || form.portals.length === 0) {
      toast({ tone: 'error', title: 'Job title and at least one portal are required' })
      return
    }
    setSaving(true)
    const rows = form.portals.map(portal => ({
      portal, date: form.date || null, job_id: form.job_id, job_title: form.job_title, location: form.location,
      manager: form.manager, recruiter: form.recruiter, link: form.link, notes: form.notes,
      user_id: user.id, org_id: profile?.org_id,
    }))
    const { error } = await db.from('postings').insert(rows)
    setSaving(false)
    if (error) {
      toast({ tone: 'error', title: 'Failed to save postings', description: error.message })
      return
    }
    toast({ tone: 'success', title: `Posted to ${form.portals.length} portal${form.portals.length === 1 ? '' : 's'}` })
    fetchPostings()
    setShowModal(false)
    setForm(emptyForm)
  }

  const deletePosting = async (id) => {
    if (!window.confirm('Delete this posting record?')) return
    await db.from('postings').delete().eq('id', id)
    fetchPostings()
    toast({ tone: 'success', title: 'Posting deleted' })
  }

  const togglePortal = (portal) => {
    setForm(f => ({ ...f, portals: f.portals.includes(portal) ? f.portals.filter(p => p !== portal) : [...f.portals, portal] }))
  }

  const exportCSV = () => {
    const headers = ['Date', 'Portal', 'Job ID', 'Job Title', 'Location', 'Manager', 'Recruiter', 'Link', 'Notes']
    const rows = filtered.map(p => [p.date, p.portal, p.job_id, p.job_title, p.location, p.manager, p.recruiter, p.link, p.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Postings')
    XLSX.writeFile(wb, `postings_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ tone: 'success', title: 'Excel exported' })
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Job Postings"
        title="Posting log"
        subtitle={`${postings.length} total · ${filtered.length} shown`}
        search={<SearchBar value={search} onChange={setSearch} placeholder="Search postings..." />}
        filters={<div className="w-40"><Select size="sm" value={portalFilter} onChange={setPortalFilter} options={PORTAL_OPTIONS} /></div>}
        actions={
          <>
            <Button size="sm" variant="secondary" leftIcon="download" onClick={exportCSV}>Export Excel</Button>
            <Button size="sm" leftIcon="plus" onClick={() => { setForm(emptyForm); setShowModal(true) }}>Log Posting</Button>
          </>
        }
      />

      {!loading && postings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
          {postingStats.map((stat) => (
            <KPICard key={stat.label} compact {...stat} />
          ))}
        </div>
      )}

      <div className="pt-6 flex flex-col gap-6">
        {loading ? (
          <div className="text-sm text-text3 py-16 text-center">Loading postings...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="postings" title="No postings yet" description="Log where a job was posted to start tracking distribution." actionLabel="Log Posting" onAction={() => setShowModal(true)} />
        ) : (
          grouped.map(({ date, items }) => (
            <Card key={date} padding="none" hoverable className="p-4">
              <CardHeader title={date} subtitle={`${items.length} posting${items.length === 1 ? '' : 's'}`} />
              <Table
                columns={COLUMNS}
                data={items}
                rowActions={p => (
                  <button type="button" onClick={() => deletePosting(p.id)} aria-label="Delete posting" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-red/10 hover:text-red">
                    <Icon name="trash" size={13} />
                  </button>
                )}
              />
            </Card>
          ))
        )}
      </div>

      <Modal
        open={showModal} onClose={() => setShowModal(false)} title="Log Job Posting" size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-text3">{form.portals.length} portal{form.portals.length === 1 ? '' : 's'} selected</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button loading={saving} onClick={handleSave}>Save Postings</Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-xs font-bold text-text3 uppercase tracking-wide mb-2.5">Select portals</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PORTALS.map(portal => {
                const active = form.portals.includes(portal)
                return (
                  <label key={portal} className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-semibold cursor-pointer transition-colors duration-[var(--duration-fast)] ${active ? 'bg-accent/10 border-accent text-accent' : 'bg-surface2 border-border text-text2 hover:bg-surface3'}`}>
                    <input type="checkbox" checked={active} onChange={() => togglePortal(portal)} className="accent-accent" />
                    {portal}
                  </label>
                )
              })}
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <button type="button" onClick={() => setForm(f => ({ ...f, portals: PORTALS }))} className="text-xs font-semibold text-accent hover:underline">Select all</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, portals: [] }))} className="text-xs font-semibold text-text3 hover:underline">Clear</button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-bold text-text3 uppercase tracking-wide mb-3">Job info</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Date" required><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></FormField>
              <FormField label="Job ID"><Input value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} placeholder="JOB-001" /></FormField>
              <FormField label="Job Title" required><Input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="Java Developer" /></FormField>
              <FormField label="Location"><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Austin, TX / Remote" /></FormField>
              <FormField label="Manager"><Input value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="Mike R." /></FormField>
              <FormField label="Recruiter"><Input value={form.recruiter} onChange={e => setForm(f => ({ ...f, recruiter: e.target.value }))} placeholder="Your name" /></FormField>
              <FormField label="Job Link" className="sm:col-span-2"><Input type="url" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://indeed.com/job/..." /></FormField>
              <FormField label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
            </div>
          </div>
        </div>
      </Modal>
    </PageContainer>
  )
}
