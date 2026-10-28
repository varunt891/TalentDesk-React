// Compare-and-swap preserves another recruiter's notes if a save races ours.
// The caller supplies the same scoped predicate used by ordinary record edits.
export async function appendRecordNote(model, where, entry) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await model.findFirst({ where })
    if (!current) throw Object.assign(new Error('Record not found'), { status: 404 })
    const notes = [current.notes, entry].filter(Boolean).join('\n\n')
    const updated = await model.updateMany({ where: { ...where, notes: current.notes }, data: { notes } })
    if (updated.count === 1) return { ...current, notes }
  }
  throw Object.assign(new Error('This record changed while saving. Please try again.'), { status: 409 })
}
