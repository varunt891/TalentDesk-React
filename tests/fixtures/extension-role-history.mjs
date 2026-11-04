// Reproduces the reported capture: seven roles, dates, and locations, but no
// responsibility descriptions. Location-only Details are not skill evidence.
export const roleHistory = [
  { role: 'Chief Technology Officer', company: 'Unoah', dates: 'Jun 2026 - Present · 6 mos', location: 'United Arab Emirates · On-site', description: '' },
  { role: 'Senior Project Manager - Digital Transformation', company: 'DIFC', dates: 'Nov 2025 - Sep 2026 · 11 mos', location: 'Dubai, United Arab Emirates · On-site', description: '' },
  { role: 'Program and Delivery Manager', company: 'Tech Mahindra', dates: 'Nov 2023 - Nov 2025 · 2 yrs 1 mo', description: 'United Arab Emirates' },
  { role: 'Program and Project Management Office', company: 'DP World', dates: 'Oct 2021 - Oct 2023 · 2 yrs 1 mo', description: 'Dubai, United Arab Emirates' },
  { role: 'Manager - Commercial Strategic Projects', company: 'Etihad Airways', dates: 'Dec 2005 - Sep 2021 · 15 yrs 10 mos', location: 'On-site', description: '' },
  { role: 'Manager - PMO & Strategy Planning', company: 'Etihad Airways', dates: 'Jan 2010 - Dec 2013 · 4 yrs', description: '' },
  { role: 'Information Technology Manager', company: 'Etihad Airways', dates: 'Dec 2005 - Dec 2009 · 4 yrs 1 mo', description: '' },
];
export const roleHistoryText = roleHistory.map(e => `${e.role} at ${e.company}\n${e.dates}\n${e.location || e.description || ''}`).join('\n');
export const roleSuggestions = [
  { skill: 'Technology Management', basis: 'role', evidence: roleHistory[0].role },
  { skill: 'Project Management', basis: 'role', evidence: roleHistory[1].role },
  { skill: 'Digital Transformation', basis: 'role', evidence: roleHistory[1].role },
  { skill: 'Program Management', basis: 'role', evidence: roleHistory[2].role },
  { skill: 'Delivery Management', basis: 'role', evidence: roleHistory[2].role },
  { skill: 'PMO', basis: 'role', evidence: roleHistory[3].role },
  { skill: 'Strategic Planning', basis: 'role', evidence: roleHistory[5].role },
  { skill: 'IT Management', basis: 'role', evidence: roleHistory[6].role },
];
