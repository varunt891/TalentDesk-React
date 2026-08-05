import {
  Button, Input, FormField, Label, Select, Combobox, Badge,
  UserMultiSelect, MarkdownEditor,
} from '../ui'
import { Drawer } from '../ui/Modal'

function FormSectionTitle({ children }) {
  return <h3 className="text-xs font-bold text-accent uppercase tracking-wide pb-2 mb-3.5 border-b border-border">{children}</h3>
}

// The Add/Edit Job drawer, shared by Jobs.jsx and JobDetail.jsx (via
// useJobForm) so editing a job never has to navigate away from wherever
// you're looking at it — pass the object returned by useJobForm() in as
// `jobForm`, plus a `showToast(msg, type)` for user feedback.
export default function JobFormDrawer({ jobForm, showToast, onSaved }) {
  const {
    showModal, setShowModal, editingId, form, setForm, skillInput, setSkillInput,
    saving, generatingDescription, extractingJobSkills, profiles, canManageAssignment,
    titleOptions, locationOptions, aiEnabled,
    handleSave, addSkill, handleGenerateDescriptionAI, handleExtractJobSkillsAI, inp,
  } = jobForm

  const onSave = async () => {
    const wasUpdate = Boolean(editingId)
    const { error } = await handleSave()
    if (error) showToast(error.message, 'error')
    else {
      showToast(wasUpdate ? 'Job updated!' : 'Job added!')
      if (wasUpdate) onSaved?.(form.title)
    }
  }

  const onGenerateDescription = async () => {
    const { error } = await handleGenerateDescriptionAI()
    if (error) showToast(error.message, 'error')
    else showToast('Job description generated!')
  }

  const onExtractSkills = async () => {
    const { error, count, fallback } = await handleExtractJobSkillsAI()
    if (error) showToast(error.message, 'error')
    else showToast(fallback ? `Extracted ${count} skills (local engine)` : `AI extracted ${count} skills!`)
  }

  return (
    <Drawer
      open={showModal}
      onClose={() => setShowModal(false)}
      title={editingId ? 'Edit Job' : 'Add Job'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={onSave}>{editingId ? 'Update Job' : 'Save Job'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <FormSectionTitle>Basic Information</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Job Title" required><Combobox value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} options={titleOptions} placeholder="Senior Developer" /></FormField>
            <FormField label="Reference ID"><Input {...inp('job_id')} placeholder="JOB-001" /></FormField>
            <FormField label="Optional Ref #"><Input {...inp('optional_ref')} placeholder="38979-1" /></FormField>
            <FormField label="Client"><Input {...inp('client')} placeholder="Acme Corp" /></FormField>
            <FormField label="Client Contact"><Input {...inp('contact_name')} placeholder="Roberta Moraes" /></FormField>
            <FormField label="Status"><Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={['Open', 'Filled', 'On Hold', 'Closed'].map(o => ({ value: o, label: o }))} /></FormField>
            <FormField label="Priority"><Select value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))} /></FormField>
            <FormField label="Employment Type"><Select value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={['Contract', 'Full-time', 'Contract-to-Hire', 'Part-time'].map(o => ({ value: o, label: o }))} /></FormField>
            <FormField label="Experience Level"><Select value={form.experience_level} onChange={v => setForm(f => ({ ...f, experience_level: v }))} options={['', 'Entry', 'Mid', 'Senior'].map(o => ({ value: o, label: o || 'Not set' }))} /></FormField>
            <FormField label="Assigned To" hint={canManageAssignment ? undefined : 'Only account managers and above can change assignment.'}>
              <UserMultiSelect
                users={profiles}
                selected={form.assigned_to || []}
                onChange={ids => setForm(f => ({ ...f, assigned_to: ids }))}
                readOnly={!canManageAssignment}
                placeholder="Assign recruiters..."
              />
            </FormField>
          </div>
        </div>

        <div>
          <FormSectionTitle>Location</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Location"><Combobox value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} options={locationOptions} placeholder="New York, NY / Remote" /></FormField>
            <FormField label="Work Mode"><Select value={form.work_mode} onChange={v => setForm(f => ({ ...f, work_mode: v }))} options={['Onsite', 'Remote', 'Hybrid'].map(o => ({ value: o, label: o }))} /></FormField>
          </div>
        </div>

        <div>
          <FormSectionTitle>Compensation</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Rate"><Input {...inp('rate')} placeholder="$80-100/hr" /></FormField>
            <FormField label="Bill Rate"><Input {...inp('bill_rate')} placeholder="26.89/hr" /></FormField>
            <FormField label="Pay Rate"><Input {...inp('pay_rate')} placeholder="19.20/hr" /></FormField>
            <FormField label="Workers Comp Code"><Input {...inp('workers_comp_code')} placeholder="Optional" /></FormField>
          </div>
        </div>

        <div>
          <FormSectionTitle>Timeline</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Open Date"><Input {...inp('open_date')} type="date" /></FormField>
            <FormField label="End Date"><Input {...inp('end_date')} type="date" /></FormField>
            <FormField label="Submittal Due"><Input {...inp('submittal_due')} type="date" /></FormField>
          </div>
        </div>

        <div>
          <FormSectionTitle>Requisition Slots</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Openings"><Input {...inp('openings')} type="number" min="0" placeholder="8" /></FormField>
            <FormField label="Max Allowed Submittals"><Input {...inp('max_submittals')} type="number" min="0" placeholder="Optional" /></FormField>
          </div>
        </div>

        <div>
          <FormSectionTitle>Description &amp; Skills</FormSectionTitle>
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Label>Description</Label>
                {aiEnabled && (
                  <Button type="button" size="sm" variant="ai" leftIcon="sparkles" loading={generatingDescription} onClick={onGenerateDescription} disabled={!form.title?.trim()}>
                    Generate Description
                  </Button>
                )}
              </div>
              <MarkdownEditor {...inp('description')} rows={5} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Label>Required Skills (press Enter to add)</Label>
                {aiEnabled && (
                  <Button type="button" size="sm" variant="secondary" leftIcon="sparkles" loading={extractingJobSkills} onClick={onExtractSkills} disabled={!form.description?.trim()}>
                    Extract Skills from Description
                  </Button>
                )}
              </div>
              <div className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2 flex flex-wrap gap-1.5 min-h-[42px]">
                {form.skills.map(s => (
                  <Badge key={s} tone="accent">
                    {s} <button type="button" onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))} className="ml-1 opacity-70 hover:opacity-100">×</button>
                  </Badge>
                ))}
                <input value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill} placeholder="React, Python..." className="bg-transparent border-none outline-none text-text text-sm min-w-[120px] flex-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
