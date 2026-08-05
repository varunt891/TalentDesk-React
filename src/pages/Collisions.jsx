import { useState, useEffect, useMemo } from 'react'
import { db, apiRequest } from '../lib/api'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, Card, KPICard, PageHeader, Tabs, Table, EmptyState, useToast,
} from '../components/ui'

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'dismissed', label: 'Dismissed' },
]

export default function Collisions() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [resolvingId, setResolvingId] = useState(null)
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    const { data, error } = await db.from('submission_collisions').select('*').order('created_at', { ascending: false })
    if (error) toast({ tone: 'error', title: 'Failed to load collisions', description: error.message })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    open: rows.filter(r => r.status === 'open').length,
    confirmed: rows.filter(r => r.status === 'confirmed').length,
    dismissed: rows.filter(r => r.status === 'dismissed').length,
  }), [rows])

  const filtered = useMemo(() => rows.filter(r => r.status === tab), [rows, tab])

  const resolve = async (id, status) => {
    setResolvingId(id)
    try {
      await apiRequest(`/data/submission_collisions/${id}/resolve`, { method: 'PATCH', body: { status } })
      toast({ tone: 'success', title: status === 'dismissed' ? 'Marked not a duplicate' : 'Confirmed duplicate' })
      await load()
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update', description: err.message })
    } finally {
      setResolvingId(null)
    }
  }

  const columns = [
    { key: 'candidate_name', header: 'Candidate', render: (r) => r.candidate_name || 'Unnamed' },
    { key: 'job', header: 'Job / Client', render: (r) => `${r.job_title || 'No title'} · ${r.client || 'No client'}` },
    {
      key: 'type', header: 'Match', render: (r) => (
        <Badge size="sm" tone={r.type === 'hard' ? 'red' : 'yellow'}>{r.type === 'hard' ? 'Same job' : 'Same client'}</Badge>
      ),
    },
    { key: 'recruiters', header: 'Recruiters', render: (r) => `${r.submitting_recruiter_name || '—'} & ${r.matched_recruiter_name || '—'}` },
    { key: 'created_at', header: 'Detected', render: (r) => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
  ]

  const rowActions = (r) => tab === 'open' ? (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="ghost" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'dismissed')}>Not a duplicate</Button>
      <Button size="sm" variant="danger" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'confirmed')}>Confirm duplicate</Button>
    </div>
  ) : null

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Submission Integrity"
        title="Collisions"
        subtitle="Same person, submitted more than once to the same job or the same client."
      />
      <div className="grid sm:grid-cols-3 gap-3 mt-6 mb-6">
        <KPICard label="Open" value={counts.open} tone="red" />
        <KPICard label="Confirmed" value={counts.confirmed} tone="orange" />
        <KPICard label="Dismissed" value={counts.dismissed} tone="neutral" />
      </div>
      <Card padding="none" className="p-3">
        <Tabs items={TABS} value={tab} onChange={setTab} className="mb-3" />
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          rowActions={rowActions}
          emptyState={<EmptyState icon="alertCircle" title="Nothing here" description="No collisions in this view." />}
        />
      </Card>
    </PageContainer>
  )
}
