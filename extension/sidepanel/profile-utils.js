/* Shared by the side panel and capture regression tests. */
globalThis.TalentDeskProfile = (() => {
  const text = value => typeof value === 'string' ? value.trim() : '';
  function cleanSkills(value) {
    const items = Array.isArray(value) ? value : text(value).split(/[,;\n]/);
    const uiLabel = /^(?:live(?: now| video)?|skills?|endorsements?|endorsed|show all(?: .*)?|see all(?: .*)?|show more|see more|view all(?: .*)?|follow|following|connect|message|more|like|comment|repost|share|send|save|verified|top voice|passed|linkedin)$/i;
    const metric = /\b(?:comments?|reactions?|likes?|reposts?|shares?|views?|impressions?|followers?|connections?|endorsements?|subscribers?|viewers?|notifications?)\b/i;
    const metadata = /^(?:endorsed by\b|passed\b.*\b(?:assessment|test)\b|\d+\s+(?:experiences?|companies?|educational experiences?)\b)/i;
    const skills = items.map(item => text(item).replace(/\s+/g, ' ')).filter(skill =>
      skill && skill.length <= 100 && /\p{L}/u.test(skill) &&
      !uiLabel.test(skill) && !metadata.test(skill) &&
      !(metric.test(skill) && (/\d/.test(skill) || /^(?:comments?|reactions?|likes?|reposts?|shares?|views?|impressions?|followers?|connections?|subscribers?|viewers?|notifications?)$/i.test(skill)))
    );
    return [...new Map(skills.map(skill => [skill.toLowerCase(), skill])).values()];
  }
  function mergeSkills(aiSkills, domSkills, { isLinkedIn = false, evidenceText = '' } = {}) {
    const dom = cleanSkills(domSkills);
    if (isLinkedIn && dom.length) return dom;
    let ai = cleanSkills(aiSkills);
    if (isLinkedIn) {
      const evidence = text(evidenceText).replace(/\s+/g, ' ');
      ai = ai.filter(skill => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(evidence);
      });
    }
    return cleanSkills([...ai, ...dom]);
  }
  function supportedInferredSkills(items, experience, evidenceText, explicitSkills = []) {
    const compact = value => text(value).replace(/\s+/g, ' ').trim().toLowerCase();
    const evidence = compact(evidenceText);
    const descriptions = (Array.isArray(experience) ? experience : []).map(e => compact(e?.description)).filter(Boolean);
    const roles = (Array.isArray(experience) ? experience : []).map(e => compact(e?.role)).filter(Boolean);
    const roleWords = value => compact(value)
      .replace(/\bcto\b/g, 'chief technology officer')
      .replace(/\bpmo\b/g, 'project program management office')
      .replace(/\bit\b/g, 'information technology')
      .replace(/\b(manager|managing|officer)\b/g, 'management')
      .replace(/\bchief\b/g, 'leadership')
      .replace(/\bstrategic\b/g, 'strategy')
      .split(/[^\p{L}\p{N}]+/u).filter(word => word && !['and', 'of', 'the', 'in', 'for'].includes(word));
    const seen = new Set(cleanSkills(explicitSkills).map(skill => skill.toLowerCase()));
    const supported = [];
    for (const item of Array.isArray(items) ? items : []) {
      const skill = cleanSkills([item?.skill])[0];
      const quote = compact(item?.evidence);
      const basis = item?.basis === 'role' ? 'role' : 'responsibilities';
      if (!skill || seen.has(skill.toLowerCase()) || quote.length > 600 || !quote || !evidence.includes(quote)) continue;
      if (basis === 'role') {
        // Role-based suggestions are restricted to the role's actual domain.
        // A CTO title must not justify an unrelated tool such as Python or AWS.
        const words = roleWords(skill);
        if (!roles.includes(quote) || !words.length || !words.every(word => roleWords(quote).includes(word))) continue;
      } else if (quote.length < 20 || !descriptions.some(description => description.includes(quote))) continue;
      seen.add(skill.toLowerCase());
      supported.push({ skill, evidence: text(item.evidence).replace(/\s+/g, ' '), basis });
      if (supported.length === 10) break;
    }
    return supported;
  }
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  function normalize(input = {}) {
    const p = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const list = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : [];
    return {
      ...p,
      name: text(p.name) || text(p.full_name) || [text(p.first_name), text(p.last_name)].filter(Boolean).join(' '),
      title: text(p.title) || text(p.candidate_title) || text(p.job_title),
      company: text(p.company) || text(p.current_company),
      email: text(p.email), phone: text(p.phone), location: text(p.location),
      summary: text(p.summary), resume_text: text(p.resume_text), rawPageText: text(p.rawPageText),
      sourceUrl: safeUrl(p.sourceUrl || p.linkedin), avatarUrl: safeUrl(p.avatarUrl),
      skills: cleanSkills(p.skills),
      inferred_skills: list(p.inferred_skills).map(item => ({ skill: text(item.skill), evidence: text(item.evidence), basis: item.basis === 'role' ? 'role' : 'responsibilities' })),
      experience: list(Array.isArray(p.experience) ? p.experience : p.experience_history).map(e => ({ role: text(e.role) || text(e.title), company: text(e.company), dates: text(e.dates), location: text(e.location), description: text(e.description) })),
      education: list(p.education).map(e => ({ school: text(e.school), degree: text(e.degree), dates: text(e.dates) })),
    };
  }
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { normalize, safeUrl, escapeHtml, cleanSkills, mergeSkills, supportedInferredSkills };
})();
