import { useState } from 'react'
import {
  Button, Input, Textarea, Checkbox, Switch, FormField, Select, SearchableSelect,
  Badge, StatusPill, Card, CardHeader, KPICard, PageHeader, SearchBar, FilterChip,
  FilterBar, MultiSelect, Table, Modal, Drawer, Tabs, EmptyState, Skeleton,
  SkeletonText, Spinner, Avatar, Tooltip, Menu, MenuTrigger, ToastProvider, useToast, Icon,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'

const CATEGORY_TABS = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'inputs', label: 'Inputs & Actions' },
  { id: 'data', label: 'Data Display' },
  { id: 'workspace', label: 'Recruiting Workspace' },
  { id: 'feedback', label: 'Feedback & Overlays' },
]

const SAMPLE_ROWS = [
  { id: 1, name: 'Priya Sharma', role: 'Senior Backend Engineer', status: 'Interview', applied: '2026-07-12' },
  { id: 2, name: 'Daniel Okafor', role: 'Product Designer', status: 'Offer', applied: '2026-07-18' },
  { id: 3, name: 'Mei Lin', role: 'Data Analyst', status: 'Screening', applied: '2026-07-21' },
  { id: 4, name: 'Carlos Vega', role: 'DevOps Engineer', status: 'Rejected', applied: '2026-07-09' },
  { id: 5, name: 'Amara Okoye', role: 'Frontend Engineer', status: 'Hired', applied: '2026-06-30' },
]

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="flex flex-col gap-3 py-8 border-b border-border last:border-0">
      <div>
        <h2 className="text-lg font-bold text-text">{title}</h2>
        {description && <p className="text-xs text-text3 mt-1 max-w-2xl">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Swatch({ name, varName }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-[var(--radius-sm)] border border-border shrink-0" style={{ background: `var(${varName})` }} />
      <div className="min-w-0">
        <div className="text-xs font-bold text-text">{name}</div>
        <div className="text-[11px] text-text3 font-mono truncate">{varName}</div>
      </div>
    </div>
  )
}

function FoundationsTab() {
  return (
    <>
      <Section id="colors" title="Colors" description="Bound to CSS variables that already power dark/light theming across the app — new components read the same tokens.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Swatch name="Background" varName="--bg" />
          <Swatch name="Surface" varName="--surface" />
          <Swatch name="Surface 2" varName="--surface2" />
          <Swatch name="Surface 3" varName="--surface3" />
          <Swatch name="Border" varName="--border" />
          <Swatch name="Accent" varName="--accent" />
          <Swatch name="Accent 2" varName="--accent2" />
          <Swatch name="AI" varName="--ai" />
          <Swatch name="Green" varName="--green" />
          <Swatch name="Yellow" varName="--yellow" />
          <Swatch name="Orange" varName="--orange" />
          <Swatch name="Red" varName="--red" />
        </div>
      </Section>

      <Section id="typography" title="Typography" description="Enterprise-dense type scale — smaller than Tailwind's marketing-site defaults, tuned for information density.">
        <div className="flex flex-col gap-2.5">
          <p className="text-3xl font-extrabold text-text">Page Title — text-3xl / extrabold</p>
          <p className="text-2xl font-bold text-text">Section Title — text-2xl / bold</p>
          <p className="text-lg font-semibold text-text">Card Title — text-lg / semibold</p>
          <p className="text-md text-text">Body — text-md</p>
          <p className="text-sm text-text2">Secondary body — text-sm</p>
          <p className="text-xs font-semibold text-text3 uppercase tracking-wide">Label / Caption — text-xs</p>
          <p className="text-sm font-mono text-text">Table data / mono — font-mono</p>
        </div>
      </Section>

      <Section id="spacing" title="Spacing & radius" description="4px-based spacing scale (Tailwind's default numeric scale already matches --space-N). Radius tokens: sm 8px, md 12px, lg 16px, xl 20px.">
        <div className="flex items-end gap-3 flex-wrap">
          {['sm', 'md', 'lg', 'xl'].map(r => (
            <div key={r} className="flex flex-col items-center gap-1.5">
              <div className={`w-14 h-14 bg-surface2 border border-border rounded-[var(--radius-${r})]`} />
              <span className="text-[11px] text-text3 font-mono">radius-{r}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function InputsTab() {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState(true)
  const [switchOn, setSwitchOn] = useState(true)
  const [selectVal, setSelectVal] = useState('open')
  const [personVal, setPersonVal] = useState('all')
  const [chips, setChips] = useState({ a: true, b: false })
  const [multi, setMulti] = useState(['screening'])

  return (
    <>
      <Section id="buttons" title="Buttons" description="Variants × sizes. One button system replaces 25+ ad hoc *-btn class families.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ai" leftIcon="sparkles">AI Action</Button>
            <Button variant="primary" loading>Saving</Button>
            <Button variant="secondary" iconOnly aria-label="More options"><Icon name="moreHorizontal" size={14} /></Button>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button size="sm" variant="primary">Small</Button>
            <Button size="md" variant="primary">Medium</Button>
            <Button size="lg" variant="primary">Large</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section id="form-controls" title="Form controls" description="Consistent inputs, selects, checkboxes and switches sharing one focus/error language.">
        <div className="grid sm:grid-cols-2 gap-5 max-w-2xl">
          <FormField label="Candidate name" required>
            <Input value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Priya Sharma" leftIcon="search" />
          </FormField>
          <FormField label="Job status" error={selectVal === 'closed' ? 'This role is closed to new applicants' : undefined}>
            <Select value={selectVal} onChange={setSelectVal} options={[{ value: 'open', label: 'Open' }, { value: 'on-hold', label: 'On hold' }, { value: 'closed', label: 'Closed' }]} />
          </FormField>
          <FormField label="Assigned recruiter" hint="Type to search the team">
            <SearchableSelect value={personVal} onChange={setPersonVal} allLabel="All recruiters" options={['Priya Sharma', 'Daniel Okafor', 'Mei Lin']} />
          </FormField>
          <FormField label="Notes">
            <Textarea placeholder="Internal notes about this candidate..." rows={3} />
          </FormField>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Checkbox id="cb1" label="Notify me when this candidate replies" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <Switch checked={switchOn} onChange={setSwitchOn} label="Auto-schedule follow-ups" />
          </div>
        </div>
      </Section>

      <Section id="search-filter" title="Search & filters" description="One search bar shape and one filter-chip language for every page.">
        <div className="flex flex-col gap-3 max-w-2xl">
          <SearchBar value={search} onChange={setSearch} placeholder="Search candidates, jobs, or companies..." />
          <FilterBar onClearAll={() => setChips({ a: false, b: false })}>
            <FilterChip label="Active" active={chips.a} onClick={() => setChips(c => ({ ...c, a: !c.a }))} onClear={() => setChips(c => ({ ...c, a: false }))} />
            <FilterChip label="This week" active={chips.b} onClick={() => setChips(c => ({ ...c, b: !c.b }))} onClear={() => setChips(c => ({ ...c, b: false }))} />
            <MultiSelect label="Status" selected={multi} onChange={setMulti} options={[{ value: 'screening', label: 'Screening' }, { value: 'interview', label: 'Interview' }, { value: 'offer', label: 'Offer' }]} />
          </FilterBar>
        </div>
      </Section>
    </>
  )
}

function DataTab() {
  const [selected, setSelected] = useState([])
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const columns = [
    { key: 'name', header: 'Candidate', sortable: true, render: (r) => (
      <span className="flex items-center gap-2"><Avatar name={r.name} size="xs" />{r.name}</span>
    ) },
    { key: 'role', header: 'Role', sortable: true },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
    { key: 'applied', header: 'Applied', sortable: true, align: 'right' },
  ]

  return (
    <>
      <Section id="badges" title="Badges & status pills" description="One semantic status → color mapping, replacing per-page STATUS_COLORS maps.">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="neutral">Draft</Badge>
          <Badge tone="accent">In progress</Badge>
          <Badge tone="green">Active</Badge>
          <Badge tone="yellow">Pending</Badge>
          <Badge tone="orange">On hold</Badge>
          <Badge tone="red">Overdue</Badge>
          <Badge tone="ai">AI Matched</Badge>
          {['Interview', 'Offer', 'Hired', 'Rejected', 'Screening'].map(s => <StatusPill key={s} status={s} />)}
        </div>
      </Section>

      <Section id="cards" title="Cards & KPIs" description="One KPI card shape replaces four duplicated implementations across Dashboard, Jobs, Tasks and Reports.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard label="Open Roles" value="24" icon="inbox" tone="accent" trend="up" trendValue="+3 this week" />
          <KPICard label="Active Candidates" value="312" icon="users" tone="ai" trend="up" trendValue="+18" />
          <KPICard label="Avg. Time to Hire" value="14d" icon="clock" tone="green" trend="down" trendValue="-2d" helper="vs. last quarter" />
          <KPICard label="Overdue Follow-ups" value="6" icon="alertCircle" tone="red" trend="flat" trendValue="No change" />
        </div>
        <Card className="max-w-md">
          <CardHeader title="Card title" subtitle="Optional subtitle text" action={<Button size="sm" variant="ghost">Action</Button>} />
          <p className="text-sm text-text2">Generic content card for grouping related information with consistent padding and radius.</p>
        </Card>
      </Section>

      <Section id="table" title="Data table" description="Sticky header, sortable columns, row selection, bulk actions. Falls back to stacked cards below the md breakpoint — resize the window to see it.">
        <Table
          columns={columns}
          data={SAMPLE_ROWS}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(key) => { setSortDir(prev => (sortKey === key && prev === 'asc' ? 'desc' : 'asc')); setSortKey(key) }}
          bulkActions={<><Button size="sm" variant="secondary">Export</Button><Button size="sm" variant="danger">Remove</Button></>}
          rowActions={() => (
            <Menu trigger={(p) => <MenuTrigger {...p} />} items={[{ label: 'View profile', icon: 'eye', onClick: () => {} }, { label: 'Edit', icon: 'edit', onClick: () => {} }, 'divider', { label: 'Remove', icon: 'trash', danger: true, onClick: () => {} }]} />
          )}
        />
      </Section>

      <Section id="empty-loading" title="Empty & loading states" description="One EmptyState and Skeleton pattern for every page instead of bespoke per-page copy.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Card padding="none"><EmptyState icon="inbox" title="No candidates yet" description="Candidates you add will show up here." actionLabel="Add candidate" /></Card>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5"><Skeleton className="w-9 h-9 rounded-full" /><div className="flex-1"><SkeletonText lines={2} /></div></div>
            <div className="flex items-center gap-2 text-text3"><Spinner size="sm" /><span className="text-xs font-semibold">Loading...</span></div>
          </Card>
        </div>
      </Section>
    </>
  )
}

const WORKSPACE_ROWS = [
  { id: 1, name: 'Priya Sharma', role: 'Senior Backend Engineer', status: 'Interview', stage: 'Interview Scheduled', recruiter: 'Daniel Okafor', priority: 'High', applied: '2026-07-12' },
  { id: 2, name: 'Daniel Okafor', role: 'Product Designer', status: 'Offer', stage: 'Offer Extended', recruiter: 'Mei Lin', priority: 'Medium', applied: '2026-07-18' },
  { id: 3, name: 'Mei Lin', role: 'Data Analyst', status: 'Screening', stage: 'Screening', recruiter: 'Daniel Okafor', priority: 'Low', applied: '2026-07-21' },
  { id: 4, name: 'Carlos Vega', role: 'DevOps Engineer', status: 'Rejected', stage: 'Rejected', recruiter: 'Mei Lin', priority: 'Medium', applied: '2026-07-09' },
  { id: 5, name: 'Amara Okoye', role: 'Frontend Engineer', status: 'Hired', stage: 'Hired', recruiter: 'Daniel Okafor', priority: 'High', applied: '2026-06-30' },
]

const WORKSPACE_FILTERS = [
  { key: 'stage', label: 'Stage', type: 'select', options: ['Screening', 'Interview Scheduled', 'Offer Extended', 'Hired', 'Rejected'] },
  { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: ['Daniel Okafor', 'Mei Lin'] },
  { key: 'applied', label: 'Applied after', type: 'date' },
]

function WorkspaceTab() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [selected, setSelected] = useState([])
  const [rows, setRows] = useState(WORKSPACE_ROWS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState('overview')

  const columns = [
    { key: 'name', header: 'Candidate', sortable: true, hideable: true, render: (r) => (
      <span className="flex items-center gap-2"><Avatar name={r.name} size="xs" />{r.name}</span>
    ) },
    { key: 'role', header: 'Role', sortable: true, hideable: true },
    { key: 'recruiter', header: 'Recruiter', hideable: true },
    { key: 'priority', header: 'Priority', hideable: true, editable: true, editType: 'select', options: ['Low', 'Medium', 'High'] },
    { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
    { key: 'applied', header: 'Applied', sortable: true, align: 'right', hideable: true },
  ]

  return (
    <>
      <Section id="workspace-search" title="Universal search" description="Debounced, with recent + saved searches and a focus shortcut ('/'). Try typing and pressing Enter, then clear it to see recents.">
        <WorkspaceSearch value={search} onChange={setSearch} storageKey="td_styleguide_demo" placeholder="Search candidates, jobs, emails, skills... ( / )" className="max-w-md" />
      </Section>

      <Section id="workspace-filters" title="Filter workspace" description="One filter bar for every page: quick presets, saved views (persisted per page), and select/multiselect/date filter types. Resize the window below md to see the mobile drawer.">
        <FilterWorkspace
          filters={WORKSPACE_FILTERS}
          values={filters}
          onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
          onReset={() => setFilters({})}
          presets={[{ label: 'My candidates', values: { recruiter: ['Daniel Okafor'] } }, { label: 'Needs decision', values: { stage: 'Offer Extended' } }]}
          storageKey="demo"
        />
      </Section>

      <Section id="workspace-table" title="Enterprise table" description="Resizable + hideable columns, keyboard navigation (click the table then use arrow keys / Enter), inline editing (double-click Priority), and right-click for a context menu.">
        <Table
          columns={columns}
          data={rows}
          resizable
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowClick={() => setDrawerOpen(true)}
          onCellEdit={(row, key, value) => setRows(prev => prev.map(r => r.id === row.id ? { ...r, [key]: value } : r))}
          bulkActions={<><Button size="sm" variant="secondary">Export</Button><Button size="sm" variant="danger">Remove</Button></>}
          rowActions={() => (
            <Menu trigger={(p) => <MenuTrigger {...p} />} items={[{ label: 'View profile', icon: 'eye', onClick: () => {} }, { label: 'Edit', icon: 'edit', onClick: () => {} }, 'divider', { label: 'Remove', icon: 'trash', danger: true, onClick: () => {} }]} />
          )}
          contextMenuItems={() => [{ label: 'Open profile', icon: 'eye', onClick: () => setDrawerOpen(true) }, { label: 'Move stage', icon: 'arrowUpRight', onClick: () => {} }, 'divider', { label: 'Delete', icon: 'trash', danger: true, onClick: () => {} }]}
        />
      </Section>

      <Section id="workspace-drawer" title="Entity drawer" description="The shared side-drawer shape for candidate/job/task previews — avatar/title/status header, tabs, scrollable body, sticky footer — replacing full-page navigation and one-off modals.">
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open candidate preview</Button>
        <EntityDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          avatarName="Priya Sharma"
          eyebrow="Candidate"
          title="Priya Sharma"
          subtitle="Senior Backend Engineer · Acme Corp"
          status={<StatusPill status="Interview Scheduled" />}
          tabs={[{ id: 'overview', label: 'Overview' }, { id: 'timeline', label: 'Timeline', count: 3 }, { id: 'notes', label: 'Notes' }]}
          activeTab={drawerTab}
          onTabChange={setDrawerTab}
          actions={<><Button variant="ghost" onClick={() => setDrawerOpen(false)}>Close</Button><Button variant="primary">Move to next stage</Button></>}
        >
          {drawerTab === 'overview' && <p className="text-sm text-text2">Overview content — contact details, resume status, skills, ownership.</p>}
          {drawerTab === 'timeline' && <p className="text-sm text-text2">Timeline content — submission, interview, and communication history.</p>}
          {drawerTab === 'notes' && <p className="text-sm text-text2">Recruiter notes content.</p>}
        </EntityDrawer>
      </Section>
    </>
  )
}

function FeedbackTab() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState('one')
  const { toast } = useToast()

  return (
    <>
      <Section id="tabs" title="Tabs">
        <Tabs items={[{ id: 'one', label: 'Overview' }, { id: 'two', label: 'Activity', count: 4 }, { id: 'three', label: 'Documents' }]} value={tab} onChange={setTab} />
      </Section>

      <Section id="overlays" title="Modal, drawer & menu" description="One overlay/animation recipe for every dialog, replacing the bespoke overlay each modal used to build.">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Tooltip label="Helpful hover context"><Button variant="ghost">Hover for tooltip</Button></Tooltip>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule callback" subtitle="Candidate: Priya Sharma" footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setModalOpen(false)}>Confirm</Button></>}>
          <p className="text-sm text-text2">Modal body content goes here — forms, confirmations, or detail views.</p>
        </Modal>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Candidate profile" subtitle="Full detail view" footer={<Button variant="primary" onClick={() => setDrawerOpen(false)}>Done</Button>}>
          <p className="text-sm text-text2">Drawers are for detail panels that benefit from more vertical space than a modal.</p>
        </Drawer>
      </Section>

      <Section id="toast" title="Toast" description="Global toast queue via useToast() — no page currently has one.">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" onClick={() => toast({ tone: 'success', title: 'Candidate saved', description: 'Priya Sharma was added to the pipeline.' })}>Success toast</Button>
          <Button variant="secondary" onClick={() => toast({ tone: 'error', title: 'Something went wrong', description: 'Could not reach the server.' })}>Error toast</Button>
          <Button variant="secondary" onClick={() => toast({ tone: 'info', title: 'Reminder', description: 'Follow-up call in 30 minutes.' })}>Info toast</Button>
        </div>
      </Section>
    </>
  )
}

function StyleGuideContent() {
  const [category, setCategory] = useState('foundations')

  return (
    <div className="mx-auto w-full px-6 py-6" style={{ maxWidth: 'var(--container-max)' }}>
      <PageHeader
        eyebrow="Design System"
        title="Style Guide"
        subtitle="Every reusable component in one place — the foundation every TalentDesk page will be rebuilt on."
      />
      <div className="pt-5">
        <Tabs items={CATEGORY_TABS} value={category} onChange={setCategory} />
      </div>
      {category === 'foundations' && <FoundationsTab />}
      {category === 'inputs' && <InputsTab />}
      {category === 'data' && <DataTab />}
      {category === 'workspace' && <WorkspaceTab />}
      {category === 'feedback' && <FeedbackTab />}
    </div>
  )
}

export default function StyleGuide() {
  return (
    <ToastProvider>
      <StyleGuideContent />
    </ToastProvider>
  )
}
