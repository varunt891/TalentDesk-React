import { DEFAULT_AI_POLICY } from '../../shared/aiPolicy.js'

export function createDemoData() {
  const now = new Date().toISOString()
  const date = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  const userId = '00000000-0000-4000-8000-000000000001'
  const orgId = '00000000-0000-4000-8000-000000000002'
  const organization = { id: orgId, name: 'TalentDesk Demo', slug: 'talentdesk-demo', industry: 'Staffing & Recruiting', subscription_plan: 'Growth', plan: 'starter', timezone: 'Asia/Kolkata', currency: 'USD', date_format: 'MM/DD/YYYY', language: 'en', market: 'US', candidate_limit: 15000, ai_credit_limit: 1000, is_active: true, created_at: now, updated_at: now }
  const profiles = [
    { id: userId, org_id: orgId, full_name: 'Demo Superadmin', email: 'demo@example.test', role: 'SUPERADMIN', is_platform_admin: true, team: 'Recruiting', department: 'Recruitment', is_active: true, created_at: now },
    { id: '00000000-0000-4000-8000-000000000003', org_id: orgId, full_name: 'Morgan Reed', email: 'morgan@example.test', role: 'RECRUITMENT_MANAGER', team: 'Recruiting', department: 'Recruitment', manager_id: userId, is_active: true, created_at: now },
    { id: '00000000-0000-4000-8000-000000000004', org_id: orgId, full_name: 'Jamie Chen', email: 'jamie@example.test', role: 'RECRUITER', team: 'Recruiting', department: 'Recruitment', manager_id: '00000000-0000-4000-8000-000000000003', is_active: true, created_at: now },
  ]
  const roles = [
    ['Senior React Engineer', 'Aurora Digital', 'Austin, TX', ['React', 'TypeScript', 'Next.js']],
    ['Java Backend Engineer', 'Cedar Financial', 'Charlotte, NC', ['Java', 'Spring Boot', 'PostgreSQL']],
    ['Python Developer', 'Northstar Analytics', 'Boston, MA', ['Python', 'FastAPI', 'SQL']],
    ['Cloud Architect', 'Summit Cloud', 'Seattle, WA', ['AWS', 'Terraform', 'Kubernetes']],
    ['Data Engineer', 'Riverbend Health', 'Chicago, IL', ['Python', 'Snowflake', 'dbt']],
    ['DevOps Engineer', 'Bluebird Software', 'Denver, CO', ['Docker', 'Azure', 'Terraform']],
    ['QA Automation Engineer', 'Oakridge Retail', 'Dallas, TX', ['Playwright', 'Selenium', 'Java']],
    ['Business Analyst', 'Willow Consulting', 'Atlanta, GA', ['SQL', 'Agile', 'Power BI']],
    ['Product Designer', 'Juniper Studio', 'San Francisco, CA', ['Figma', 'UX Research', 'Accessibility']],
    ['Full Stack Engineer', 'Maple Technologies', 'New York, NY', ['React', 'Node.js', 'PostgreSQL']],
  ]
  const names = ['Avery Patel', 'Liam Brooks', 'Sofia Reyes', 'Noah Morgan', 'Priya Sharma', 'Ethan Chen', 'Maya Johnson', 'Arjun Mehta', 'Olivia Bennett', 'Lucas Reed', 'Isabella Costa', 'Rohan Kapoor', 'Amelia Grant', 'Daniel Kim', 'Ananya Rao', 'James Walker', 'Zara Ahmed', 'Benjamin Clark', 'Chloe Martin', 'Aditya Singh', 'Grace Turner', 'Henry Lewis', 'Nisha Iyer', 'Ella Robinson', 'Alexander Scott', 'Meera Nair', 'Samuel Wright', 'Lily Anderson', 'Vikram Joshi', 'Emily Davis']
  const stages = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
  const jobs = roles.map(([title, client, location, skills], i) => ({ id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, org_id: orgId, user_id: userId, job_id: `DEMO-${String(i + 1).padStart(3, '0')}`, title, client: `Demo — ${client}`, location, skills, description: `Fictional demonstration requisition for a ${title}. Deliver projects using ${skills.join(', ')}, collaborate with stakeholders and mentor colleagues.`, notes: 'Fictional demo data. Changes are saved only in this browser.', status: 'Open', type: i % 2 ? 'Contract' : 'Full-time', priority: i % 3 ? 'Medium' : 'High', open_date: date(-i - 8), end_date: date(180), submittal_due: date(7), openings: 2, rate: `$${75 + i * 3}/hr`, pay_rate: `$${75 + i * 3}/hr`, bill_rate: `$${100 + i * 3}/hr`, experience_level: 'Senior', work_mode: i % 2 ? 'Hybrid' : 'Remote', assigned_to: [userId], recruiter_name: profiles[0].full_name, contact_name: `Demo Hiring Manager ${i + 1}`, created_at: now, updated_at: now }))
  const candidates = names.map((name, i) => {
    const job = jobs[Math.floor(i / 3)], stage = stages[i % stages.length]
    const [first_name, last_name] = name.split(' ')
    return { id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, org_id: orgId, user_id: userId, first_name, last_name, email: `candidate${i + 1}@example.test`, phone: `+1 202 555 ${String(100 + i).padStart(4, '0')}`, location: job.location, job_id: job.job_id, job_title: job.title, client: job.client, skills: job.skills, experience: String(5 + i % 9), work_auth: ['US Citizen', 'Green Card', 'H1B'][i % 3], rate: job.rate, relocation: i % 2 ? 'Yes' : 'No', internal_status: stage, external_status: stage, priority: ['High', 'Medium', 'Low'][i % 3], feedback_status: stage === 'Rejected' ? 'Negative' : 'Awaiting', recruiter_id: userId, recruiter_name: profiles[0].full_name, account_manager: 'Morgan Reed', fe_name: 'Demo Account Team', submission_date: date(-(i % 20)), followup_date: date(i % 5 - 1), interview_date: stage === 'Interview Scheduled' ? date(2) : null, interview_time: stage === 'Interview Scheduled' ? '14:00' : null, interview_type: 'Video Call', notes: `FICTIONAL DEMO PROFILE. ${5 + i % 9} years of relevant experience. Available after two weeks' notice. This person and their work history are fictional.`, resume_text: `${name}\n${job.title}\nFICTIONAL DEMO RESUME\nSkills: ${job.skills.join(', ')}\nExperience: ${5 + i % 9} years delivering enterprise projects and mentoring colleagues.\nEducation: BS Computer Science at Demo University.`, created_at: date(-(i % 20)) + 'T12:00:00Z', updated_at: now }
  })
  // Keep the sourced pool independent from submitted candidate records.
  candidates.push(...candidates.slice(0, 3).map((row, i) => ({ ...row, id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, first_name: ['Taylor', 'Casey', 'Jordan'][i], email: `sourced${i + 1}@example.test`, internal_status: 'Sourced', external_status: 'Pending', job_id: null, submission_date: null })))
  return { version: 1, organization, policy: structuredClone(DEFAULT_AI_POLICY), tables: {
    candidates, jobs, profiles, organizations: [organization],
    tasks: [{ id: '40000000-0000-4000-8000-000000000001', org_id: orgId, title: 'Review the React shortlist', description: 'Fictional task for browser preview.', status: 'Pending', priority: 'High', assigned_by: userId, assigned_to: userId, due_date: date(1), created_at: now, updated_at: now }],
    callbacks: [{ id: '50000000-0000-4000-8000-000000000001', org_id: orgId, user_id: userId, candidate_name: 'Noah Morgan', job: jobs[1].job_id, phone: candidates[3].phone, date: date(1), time: '14:00', status: 'pending', interest: 'Hot', notes: 'Fictional demo interview callback.', created_at: now }],
    followups: [{ id: '60000000-0000-4000-8000-000000000001', org_id: orgId, user_id: userId, candidate_name: 'Avery Patel', date: date(-1), status: 'pending', notes: 'Fictional follow-up; confirm availability.', created_at: now }],
    postings: [], notifications: [], task_comments: [], activity_logs: [], admin_audit_log: [], submission_collisions: [], user_invitations: [],
  } }
}
