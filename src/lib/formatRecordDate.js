// Date-only CRM values retain their calendar day in every browser timezone.
export function formatRecordDate(value, format = 'MM/DD/YYYY') {
  if (!value) return null
  const text = String(value)
  const date = new Date(text.length === 10 ? `${text}T12:00:00` : text)
  if (Number.isNaN(date.getTime())) return text
  const parts = { DD: String(date.getDate()).padStart(2, '0'), MM: String(date.getMonth() + 1).padStart(2, '0'), YYYY: String(date.getFullYear()) }
  return ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(format) ? format.replace(/YYYY|MM|DD/g, token => parts[token]) : date.toLocaleDateString()
}
