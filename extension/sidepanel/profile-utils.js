/* Shared by the side panel and capture regression tests. */
globalThis.TalentDeskProfile = (() => {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  function normalize(input = {}) {
    const p = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const list = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : [];
    const skills = Array.isArray(p.skills) ? p.skills : text(p.skills).split(/[,;\n]/);
    return {
      ...p,
      name: text(p.name) || text(p.full_name) || [text(p.first_name), text(p.last_name)].filter(Boolean).join(' '),
      title: text(p.title) || text(p.candidate_title) || text(p.job_title),
      company: text(p.company) || text(p.current_company),
      email: text(p.email), phone: text(p.phone), location: text(p.location),
      summary: text(p.summary), resume_text: text(p.resume_text), rawPageText: text(p.rawPageText),
      sourceUrl: safeUrl(p.sourceUrl || p.linkedin), avatarUrl: safeUrl(p.avatarUrl),
      skills: [...new Map(skills.map(text).filter(Boolean).map(s => [s.toLowerCase(), s])).values()],
      experience: list(Array.isArray(p.experience) ? p.experience : p.experience_history).map(e => ({ role: text(e.role) || text(e.title), company: text(e.company), dates: text(e.dates), location: text(e.location), description: text(e.description) })),
      education: list(p.education).map(e => ({ school: text(e.school), degree: text(e.degree), dates: text(e.dates) })),
    };
  }
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { normalize, safeUrl, escapeHtml };
})();
