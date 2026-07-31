import { useEffect, useState, useMemo } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, Card, PageHeader, Tabs, EmptyState, SearchBar, Badge, Modal, Select, Input, FormField, useToast } from '../components/ui'
import { Icon } from '../components/ui/icons'

const ROLE_OPTIONS = ['recruiter', 'account_manager', 'recruitment_manager', 'operations_manager', 'manager', 'admin', 'employee']
  .map(role => ({ value: role, label: role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }))

const emptyForm = { full_name: '', email: '', phone: '', extension: '', role: 'recruiter', department: '', team: '' }

const AVATAR_PALETTE = ['#4f7cff', '#7c5cff', '#ff5c87', '#2ecc8f', '#ff8c42', '#f5c842']

function getMemberDepartment(member) {
  if (member.department?.trim()) return member.department.trim()
  if (['admin', 'superadmin'].includes(member.role)) return 'Management'
  return 'General'
}

function formatRole(member) {
  if (!member) return 'Recruiter'
  const role = member.role
  if (role === 'recruitment_manager') return 'Recruitment Manager'
  if (role === 'account_manager') return 'Account Manager'
  if (role === 'operations_manager') return 'Operations Manager'
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  if (role === 'recruiter') return 'Recruiter'
  if (role === 'manager') return (member.manager_id || (member.team && member.team.includes('AM'))) ? 'Account Manager' : 'Recruitment Manager'
  return role ? role.replace(/_/g, ' ') : 'Recruiter'
}

export default function Directory() {
  const { user, profile } = useAuth()
  const { toast } = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeDepartment, setActiveDepartment] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const isAdmin = ['admin', 'superadmin', 'owner', 'ADMIN', 'SUPERADMIN', 'OWNER'].includes(profile?.role)

  useEffect(() => { if (user) fetchMembers() }, [user])

  const fetchMembers = async () => {
    setLoading(true)
    const { data } = await db.from('profiles').select('*').eq('is_active', true).param('full_org', 'true').order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  const dynamicDepartments = useMemo(() => {
    const set = new Set()
    members.forEach(m => { const d = (m.department || '').trim(); if (d) set.add(d) })
    return Array.from(set).sort()
  }, [members])

  const searchFiltered = useMemo(() => members.filter(member => {
    const q = search.toLowerCase()
    if (!q) return true
    const department = getMemberDepartment(member)
    const text = `${member.full_name || ''} ${member.email || ''} ${member.phone || ''} ${member.extension || ''} ${member.team || ''} ${department}`.toLowerCase()
    return text.includes(q)
  }), [members, search])

  const visibleStaff = useMemo(() => searchFiltered.filter(member => (
    activeDepartment === 'All' || getMemberDepartment(member) === activeDepartment
  )), [searchFiltered, activeDepartment])

  const departmentTabs = useMemo(() => {
    const tabs = [{ id: 'All', label: 'All', count: members.length }]
    dynamicDepartments.forEach(dept => tabs.push({ id: dept, label: dept, count: members.filter(m => getMemberDepartment(m) === dept).length }))
    return tabs
  }, [dynamicDepartments, members])

  const openAdd = () => {
    const defaultDept = activeDepartment === 'All' ? (dynamicDepartments[0] || 'General') : activeDepartment
    setForm({ ...emptyForm, department: defaultDept })
    setEditingId(null)
    setShowModal(true)
  }

  const openEdit = (member) => {
    let resolvedRole = member.role || 'recruiter'
    if (resolvedRole === 'manager') {
      resolvedRole = (member.manager_id || (member.team && member.team.includes('AM'))) ? 'account_manager' : 'recruitment_manager'
    }
    setForm({
      full_name: member.full_name || '', email: member.email || '', phone: member.phone || '',
      extension: member.extension || '', role: resolvedRole, department: getMemberDepartment(member), team: member.team || '',
    })
    setEditingId(member.id)
    setShowModal(true)
  }

  const deleteMember = async (member) => {
    if (!isAdmin) return
    if (!window.confirm(`Remove "${member.full_name || member.email}" from the directory?`)) return
    const { error } = await db.from('profiles').delete().eq('id', member.id)
    if (error) {
      toast({ tone: 'error', title: 'Failed to delete member', description: error.message })
      return
    }
    toast({ tone: 'success', title: `${member.full_name || 'Member'} removed from directory` })
    fetchMembers()
  }

  const copyEmail = async (member) => {
    if (!member.email) return
    await navigator.clipboard?.writeText(member.email)
    toast({ tone: 'success', title: 'Email copied to clipboard' })
  }

  const saveMember = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast({ tone: 'error', title: 'Name and email are required' })
      return
    }
    setSaving(true)
    const payload = {
      org_id: profile?.org_id,
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      extension: form.extension.trim() || null,
      role: form.role,
      department: form.department.trim() || 'General',
      team: form.team.trim() || null,
      is_active: true,
    }
    const { error } = editingId ? await db.from('profiles').update(payload).eq('id', editingId) : await db.from('profiles').insert(payload)
    setSaving(false)
    if (error) {
      toast({ tone: 'error', title: 'Failed to save member', description: error.message })
      return
    }
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
    toast({ tone: 'success', title: editingId ? 'Directory member updated' : 'Directory member added' })
    fetchMembers()
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Team Directory"
        title="Company contacts"
        subtitle={`${searchFiltered.length} member${searchFiltered.length === 1 ? '' : 's'} across ${dynamicDepartments.length} department${dynamicDepartments.length === 1 ? '' : 's'}`}
        search={<SearchBar value={search} onChange={setSearch} placeholder="Search name, email, extension..." />}
        actions={isAdmin && <Button size="sm" leftIcon="plus" onClick={openAdd}>Add member</Button>}
      />

      <div className="mt-5">
        <Tabs items={departmentTabs} value={activeDepartment} onChange={setActiveDepartment} />
      </div>

      <div className="pt-6">
        {loading ? (
          <div className="text-sm text-text3 py-16 text-center">Loading directory...</div>
        ) : visibleStaff.length === 0 ? (
          <EmptyState
            icon="users" title="No contacts in this view"
            description={search ? `No results for "${search}".` : 'Add a member to this department to get started.'}
            actionLabel={isAdmin ? 'Add member' : undefined} onAction={isAdmin ? openAdd : undefined}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleStaff.map((member, index) => (
              <MemberCard key={member.id} member={member} color={AVATAR_PALETTE[index % AVATAR_PALETTE.length]} canEdit={isAdmin} onEdit={openEdit} onDelete={deleteMember} onCopy={copyEmail} />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit directory member' : 'Add directory member'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button loading={saving} onClick={saveMember}>{editingId ? 'Update member' : 'Save member'}</Button></>}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Full name" required><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Smith" /></FormField>
          <FormField label="Email" required><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.com" /></FormField>
          <FormField label="Phone number"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" /></FormField>
          <FormField label="Extension"><Input value={form.extension} onChange={e => setForm(f => ({ ...f, extension: e.target.value }))} placeholder="1001" /></FormField>
          <FormField label="Department" hint={dynamicDepartments.length ? `Existing: ${dynamicDepartments.join(', ')}` : undefined}>
            <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Type department..." />
          </FormField>
          <FormField label="Role"><Select value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={ROLE_OPTIONS} /></FormField>
          <FormField label="Team" className="sm:col-span-2"><Input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} placeholder="e.g. Frontend Team" /></FormField>
        </div>
      </Modal>
    </PageContainer>
  )
}

function MemberCard({ member, color, canEdit, onEdit, onDelete, onCopy }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0" style={{ background: color }}>
            {(member.full_name || member.email || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-text truncate">{member.full_name || 'Unnamed contact'}</div>
            <Badge tone="accent" size="sm" className="mt-1">{formatRole(member)}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => onCopy(member)} title="Copy email" aria-label="Copy email" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
            <Icon name="copy" size={13} />
          </button>
          {canEdit && (
            <>
              <button type="button" onClick={() => onEdit(member)} title="Edit contact" aria-label="Edit contact" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
                <Icon name="edit" size={13} />
              </button>
              <button type="button" onClick={() => onDelete(member)} title="Remove contact" aria-label="Remove contact" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-red/10 hover:text-red">
                <Icon name="trash" size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        {member.email && (
          <a href={`mailto:${member.email}`} className="flex items-center gap-2 text-text2 hover:text-accent truncate">
            <Icon name="mail" size={12} className="text-text3 shrink-0" /> <span className="truncate">{member.email}</span>
          </a>
        )}
        {member.phone && (
          <div className="flex items-center gap-2 text-text2">
            <Icon name="callbacks" size={12} className="text-text3 shrink-0" />
            <span>{member.phone}{member.extension ? ` · Ext ${member.extension}` : ''}</span>
          </div>
        )}
        {member.team && (
          <div className="flex items-center gap-2 text-text2">
            <Icon name="users" size={12} className="text-text3 shrink-0" /> <span>{member.team}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
