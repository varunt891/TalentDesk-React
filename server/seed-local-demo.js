import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Intentionally uses only the loopback API, never DATABASE_URL or Neon.
const base = 'http://127.0.0.1:4001/api'
const credentials = JSON.parse(await readFile(new URL('../.talentdesk-local/credentials.json', import.meta.url), 'utf8'))
let token
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Local API returned ${response.status}`)
  return result
}

const session = await request('/auth/login', { email: credentials.email, password: credentials.password })
assert.equal(session.organization?.slug, 'talentdesk-local', 'Demo data can only be added to TalentDesk Local.')
token = session.token
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const date = offset => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
const recruiter = session.profile.full_name || 'Local Owner'

const roles = [
  ['Senior React Engineer', 'Aurora Digital', 'Austin, TX', ['React', 'TypeScript', 'Next.js', 'GraphQL', 'Jest'], 85],
  ['Java Backend Engineer', 'Cedar Financial', 'Charlotte, NC', ['Java', 'Spring Boot', 'PostgreSQL', 'Kafka', 'JUnit'], 90],
  ['Python Developer', 'Northstar Analytics', 'Boston, MA', ['Python', 'FastAPI', 'Django', 'Redis', 'SQL'], 80],
  ['Cloud Solutions Architect', 'Summit Cloud', 'Seattle, WA', ['AWS', 'Terraform', 'Kubernetes', 'Docker', 'Python'], 110],
  ['Data Engineer', 'Riverbend Health', 'Chicago, IL', ['Python', 'Spark', 'Snowflake', 'dbt', 'Airflow'], 95],
  ['DevOps Engineer', 'Bluebird Software', 'Denver, CO', ['Azure', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'], 92],
  ['QA Automation Engineer', 'Oakridge Retail', 'Dallas, TX', ['Playwright', 'Selenium', 'Java', 'API Testing', 'SQL'], 72],
  ['Business Analyst', 'Willow Consulting', 'Atlanta, GA', ['Business Analysis', 'SQL', 'Jira', 'Agile', 'Power BI'], 75],
  ['Product Designer', 'Juniper Studio', 'San Francisco, CA', ['Figma', 'UX Research', 'Design Systems', 'Prototyping', 'Accessibility'], 88],
  ['Full Stack Engineer', 'Maple Technologies', 'New York, NY', ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS'], 98],
]
const names = [
  ['Avery', 'Patel'], ['Liam', 'Brooks'], ['Sofia', 'Reyes'],
  ['Noah', 'Morgan'], ['Priya', 'Sharma'], ['Ethan', 'Chen'],
  ['Maya', 'Johnson'], ['Arjun', 'Mehta'], ['Olivia', 'Bennett'],
  ['Lucas', 'Reed'], ['Isabella', 'Costa'], ['Rohan', 'Kapoor'],
  ['Amelia', 'Grant'], ['Daniel', 'Kim'], ['Ananya', 'Rao'],
  ['James', 'Walker'], ['Zara', 'Ahmed'], ['Benjamin', 'Clark'],
  ['Chloe', 'Martin'], ['Aditya', 'Singh'], ['Grace', 'Turner'],
  ['Henry', 'Lewis'], ['Nisha', 'Iyer'], ['Ella', 'Robinson'],
  ['Alexander', 'Scott'], ['Meera', 'Nair'], ['Samuel', 'Wright'],
  ['Lily', 'Anderson'], ['Vikram', 'Joshi'], ['Emily', 'Davis'],
]
const stages = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
const existingJobs = (await request('/data/jobs')).data
const newJobs = roles.map(([title, client, location, skills, rate], index) => ({
  job_id: `LOCAL-DEMO-${String(index + 1).padStart(3, '0')}`,
  title, client: `Demo — ${client}`, location, skills,
  type: index % 3 === 0 ? 'Full-time' : 'Contract', status: 'Open',
  priority: index % 3 === 0 ? 'High' : 'Medium', rate: `$${rate}/hr`,
  bill_rate: `$${rate + 25}/hr`, pay_rate: `$${rate}/hr`,
  open_date: date(-15 - index), end_date: date(180), submittal_due: date(7),
  openings: 2, max_submittals: 6, experience_level: 'Senior',
  work_mode: ['Remote', 'Hybrid', 'On-site'][index % 3],
  fe: 'Demo Account Team', contact_name: `Demo Hiring Manager ${index + 1}`,
  assigned_to: [session.user.id],
  description: `LOCAL DEMO REQUISITION. Seeking a ${title} with strong ${skills.slice(0, 3).join(', ')} experience. Responsibilities include solution delivery, collaboration with product teams, code or design reviews, and mentoring. Target experience: 5–12 years.`,
  notes: 'Synthetic local demonstration data. Two-stage interview process: technical assessment and hiring manager conversation.',
})).filter(job => !existingJobs.some(existing => existing.job_id === job.job_id))
if (newJobs.length) await request('/data/jobs', newJobs)

const rows = names.map(([first_name, last_name], index) => {
  const [job_title, client, location, skills, baseRate] = roles[Math.floor(index / 3)]
  const stage = stages[index % stages.length]
  const experience = 5 + index % 9
  const email = `local.demo.${String(index + 1).padStart(2, '0')}@example.test`
  const phone = `+1 (202) 555-${String(100 + index).padStart(4, '0')}`
  const employer = ['Demo Horizon Labs', 'Demo Beacon Group', 'Demo Evergreen Systems'][index % 3]
  const interviewStage = ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected'].includes(stage)
  const education = ['BS Computer Science', 'MS Information Systems', 'BS Software Engineering'][index % 3]
  const notes = [
    'LOCAL DEMO PROFILE — fictional person and employment history.',
    `Current employer: ${employer}. Education: ${education}.`,
    `Availability: ${index % 3 === 0 ? 'Immediate' : 'Two weeks notice'}. Work preference: ${index % 2 ? 'Hybrid' : 'Remote'}.`,
    `Recruiter assessment: ${stage === 'Rejected' ? 'Technical assessment did not meet the required depth.' : stage === 'Withdrew' ? 'Candidate accepted another opportunity.' : 'Strong communication, relevant delivery experience, and clear examples of measurable results.'}`,
    stage === 'On Hold' ? 'Client temporarily paused hiring pending budget confirmation.' : `Next step: ${stage === 'Hired' ? 'Complete onboarding paperwork.' : stage === 'Offer Extended' ? 'Confirm offer acceptance and start date.' : 'Coordinate the next conversation with the account team.'}`,
  ].join('\n')
  return {
    first_name, last_name, email, phone, location,
    work_auth: ['US Citizen', 'Green Card', 'H1B'][index % 3],
    experience: String(experience),
    linkedin: `https://example.test/profiles/${first_name.toLowerCase()}-${last_name.toLowerCase()}`,
    submission_date: date(-index % 21),
    job_id: `LOCAL-DEMO-${String(Math.floor(index / 3) + 1).padStart(3, '0')}`,
    job_title, client: `Demo — ${client}`, rate: `$${baseRate + index % 5}/hr`,
    relocation: index % 2 ? 'Yes' : 'No', internal_status: stage,
    external_status: stage,
    feedback_status: stage === 'Rejected' ? 'Negative' : ['Shortlisted', 'Interview Done', 'Offer Extended', 'Hired'].includes(stage) ? 'Positive' : 'Awaiting',
    priority: ['High', 'Medium', 'Low'][index % 3],
    interview_date: interviewStage ? date(stage === 'Interview Scheduled' ? 2 + index % 3 : -2 - index % 4) : null,
    interview_time: interviewStage ? ['10:00', '11:30', '14:00'][index % 3] : null,
    interview_type: interviewStage ? 'Video' : null,
    fe_name: 'Demo Account Team', fe_extension: String(200 + index % 4),
    account_manager: ['Demo Maya Sullivan', 'Demo Owen Carter'][index % 2],
    recruiter_name: recruiter, recruiter_id: session.user.id,
    skills, notes,
    followup_date: ['Hired', 'Rejected', 'Withdrew'].includes(stage) ? null : date(index % 5 - 1),
    resume_text: `${first_name} ${last_name}\n${job_title}\n${email} | ${phone} | ${location}\n\nFICTIONAL LOCAL DEMO RESUME\n\nSUMMARY\n${experience} years of experience delivering reliable solutions using ${skills.slice(0, 3).join(', ')}. Strong stakeholder communication and mentoring skills.\n\nSKILLS\n${skills.join(', ')}\n\nEXPERIENCE\nSenior ${job_title} — ${employer}, 2022–present\nLed a six-person delivery team, improved delivery time by 25%, and introduced automated quality checks. Partnered with stakeholders to define requirements and deliver quarterly releases.\n\n${job_title} — Demo Atlas Services, ${2026 - experience}–2022\nDelivered enterprise projects, documented architecture and workflows, and mentored junior colleagues.\n\nEDUCATION\n${education}, Demo Metropolitan University\n\nADDITIONAL INFORMATION\nAvailable ${index % 3 ? 'after two weeks notice' : 'immediately'}. Target rate: $${baseRate + index % 5}/hr. All details are synthetic.`,
  }
})
const existing = (await request('/data/candidates')).data
const missing = rows.filter(row => !existing.some(candidate => candidate.email === row.email))
if (missing.length) await request('/data/candidates', missing)

const saved = (await request('/data/candidates')).data.filter(candidate => rows.some(row => row.email === candidate.email))
assert.equal(saved.length, 30, 'Expected 30 local demo candidates.')
console.log(`Added ${missing.length} candidates and ${newJobs.length} linked demo jobs to TalentDesk Local.`)
console.log('Verified: 30 demo candidates, 3 in each of 10 stages:')
console.log(JSON.stringify(Object.fromEntries(stages.map(stage => [stage, saved.filter(row => row.internal_status === stage).length])), null, 2))
