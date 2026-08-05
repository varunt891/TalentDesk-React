// Offline fallback used when the AI skill-extraction call fails or returns
// unparseable output — a plain dictionary/regex scan, source-agnostic (works
// on resume text or a job description equally well). Shared by Candidates.jsx
// (resume skill extraction) and Jobs.jsx (job description skill extraction)
// so both AI-assist features degrade the same way instead of failing silently.
export function fallbackExtractSkills(text = '') {
  if (!text) return []
  const dictionary = [
    'React', 'React Native', 'Node.js', 'Express', 'TypeScript', 'JavaScript', 'Python', 'Django', 'Flask', 'FastAPI',
    'Java', 'Spring Boot', 'C++', 'C#', '.NET', 'Go', 'Golang', 'Rust', 'PHP', 'Ruby', 'Rails', 'SQL', 'PostgreSQL',
    'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD',
    'Git', 'DevOps', 'Microservices', 'HTML5', 'CSS3', 'Tailwind CSS', 'Sass', 'Figma', 'System Design', 'Agile',
    'Scrum', 'Jira', 'Unit Testing', 'Jest', 'Cypress', 'Machine Learning', 'Data Analysis', 'Tableau', 'Power BI',
    'Communication', 'Leadership', 'Problem Solving', 'Teamwork'
  ]
  const lower = text.toLowerCase()
  const matches = dictionary.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    return regex.test(lower)
  })
  return matches.slice(0, 10)
}
