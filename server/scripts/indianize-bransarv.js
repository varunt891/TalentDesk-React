import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ORG_ID = '6448981f-de5b-40f9-89dc-150609ebba60'

const names = [
  'Aarav Sharma', 'Aditi Menon', 'Rohan Mehta', 'Priya Nair', 'Karan Malhotra',
  'Neha Iyer', 'Vikram Rao', 'Ananya Gupta', 'Arjun Reddy', 'Meera Joshi',
  'Rahul Kapoor', 'Sneha Kulkarni', 'Siddharth Jain', 'Pooja Bansal', 'Nikhil Verma',
  'Isha Chatterjee', 'Manish Agarwal', 'Kavya Subramanian', 'Saurabh Mishra', 'Divya Pillai',
  'Aditya Narayan', 'Ritika Sinha', 'Harsh Patel', 'Swati Deshmukh', 'Gaurav Saxena',
  'Tanvi Shah', 'Abhishek Tiwari', 'Nandini Bose', 'Yash Goyal', 'Simran Kaur',
  'Pranav Bhat', 'Riya Mukherjee', 'Akshay Khanna', 'Mansi Arora', 'Varun Bhide',
  'Shreya Nambiar', 'Kunal Sethi', 'Aishwarya Rao', 'Devansh Trivedi', 'Bhavya Jain',
  'Mohit Chawla', 'Rashmi Iyer', 'Naveen Kumar', 'Kirti Saxena', 'Sameer Batra',
  'Tanya Malhotra', 'Raghavendra Prasad', 'Anika Dutta', 'Deepak Menon', 'Nisha Thomas',
  'Chirag Shah', 'Lavanya Krishnan', 'Omkar Patil', 'Payal Mehta', 'Sahil Arora',
  'Vidya Nair', 'Ramesh Gupta', 'Charu Bansal', 'Akhil Reddy', 'Namrata Joshi',
  'Tejas Kulkarni', 'Sonal Verma', 'Jayant Mishra', 'Preeti Agarwal', 'Nitin Sinha',
  'Keerthi Rao', 'Rohit Jain', 'Gayatri Pillai', 'Madhav Sharma', 'Aparna Bose',
  'Prakash Iyer', 'Sakshi Kapoor', 'Tarun Goyal', 'Urvashi Menon', 'Vivek Nambiar',
  'Malvika Shah', 'Anmol Batra', 'Renu Chatterjee', 'Keshav Patil', 'Diya Khanna',
]

const teams = [
  ['Technology Delivery Team 1', 'Technology Staffing'],
  ['Technology Delivery Team 2', 'Technology Staffing'],
  ['Enterprise Accounts Team', 'Client Success'],
  ['Healthcare Delivery Team', 'Healthcare Staffing'],
  ['BFSI Delivery Team', 'BFSI Staffing'],
  ['Operations Desk', 'Operations'],
]

const candidates = [
  {
    first_name: 'Aarohi', last_name: 'Sharma', email: 'aarohi.sharma@gmail.com', phone: '+91 98765 41001',
    location: 'Bengaluru, Karnataka', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2401',
    job_title: 'Senior React Developer', client: 'Infosys Digital', rate: '₹24 LPA',
    fe_name: 'Priya Nair', account_manager: 'Rohan Mehta', recruiter_name: 'Aditi Menon',
    skills: ['React', 'TypeScript', 'Redux Toolkit', 'Tailwind CSS'], notes: 'Current CTC: ₹19 LPA. Expected CTC: ₹24 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Kabir', last_name: 'Iyer', email: 'kabir.iyer@gmail.com', phone: '+91 98765 41002',
    location: 'Hyderabad, Telangana', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2402',
    job_title: 'Product Designer', client: 'Flipkart Labs', rate: '₹20 LPA',
    fe_name: 'Neha Iyer', account_manager: 'Vikram Rao', recruiter_name: 'Ananya Gupta',
    skills: ['Figma', 'Design Systems', 'Prototyping', 'User Research'], notes: 'Current CTC: ₹16 LPA. Expected CTC: ₹20 LPA. Notice period: 45 days.',
  },
  {
    first_name: 'Devika', last_name: 'Menon', email: 'devika.menon@gmail.com', phone: '+91 98765 41003',
    location: 'Pune, Maharashtra', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2403',
    job_title: 'DevOps Engineer', client: 'Tata Digital', rate: '₹26 LPA',
    fe_name: 'Karan Malhotra', account_manager: 'Rahul Kapoor', recruiter_name: 'Sneha Kulkarni',
    skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform'], notes: 'Current CTC: ₹21 LPA. Expected CTC: ₹26 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Vihaan', last_name: 'Reddy', email: 'vihaan.reddy@gmail.com', phone: '+91 98765 41004',
    location: 'Chennai, Tamil Nadu', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2404',
    job_title: 'QA Automation Lead', client: 'Zoho', rate: '₹22 LPA',
    fe_name: 'Meera Joshi', account_manager: 'Siddharth Jain', recruiter_name: 'Pooja Bansal',
    skills: ['Selenium', 'Cypress', 'Playwright', 'API Testing'], notes: 'Current CTC: ₹17.5 LPA. Expected CTC: ₹22 LPA. Notice period: 60 days.',
  },
  {
    first_name: 'Ishaan', last_name: 'Kapoor', email: 'ishaan.kapoor@gmail.com', phone: '+91 98765 41005',
    location: 'Gurugram, Haryana', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2405',
    job_title: 'Solutions Architect', client: 'HCLTech', rate: '₹36 LPA',
    fe_name: 'Nikhil Verma', account_manager: 'Isha Chatterjee', recruiter_name: 'Manish Agarwal',
    skills: ['System Design', 'Cloud Architecture', 'Node.js', 'NoSQL'], notes: 'Current CTC: ₹30 LPA. Expected CTC: ₹36 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Myra', last_name: 'Nair', email: 'myra.nair@gmail.com', phone: '+91 98765 41006',
    location: 'Kochi, Kerala', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2406',
    job_title: 'Backend Engineer', client: 'Freshworks', rate: '₹23 LPA',
    fe_name: 'Kavya Subramanian', account_manager: 'Saurabh Mishra', recruiter_name: 'Divya Pillai',
    skills: ['Node.js', 'Express', 'PostgreSQL', 'Prisma'], notes: 'Current CTC: ₹18 LPA. Expected CTC: ₹23 LPA. Notice period: 45 days.',
  },
  {
    first_name: 'Arjun', last_name: 'Bhat', email: 'arjun.bhat@gmail.com', phone: '+91 98765 41007',
    location: 'Mumbai, Maharashtra', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2407',
    job_title: 'Junior Developer', client: 'Reliance Jio', rate: '₹8 LPA',
    fe_name: 'Aditya Narayan', account_manager: 'Ritika Sinha', recruiter_name: 'Harsh Patel',
    skills: ['JavaScript', 'HTML', 'CSS', 'React'], notes: 'Current CTC: ₹5.5 LPA. Expected CTC: ₹8 LPA. Notice period: Immediate.',
  },
  {
    first_name: 'Tara', last_name: 'Mukherjee', email: 'tara.mukherjee@gmail.com', phone: '+91 98765 41008',
    location: 'Kolkata, West Bengal', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2408',
    job_title: 'Technical Writer', client: 'LTIMindtree', rate: '₹14 LPA',
    fe_name: 'Swati Deshmukh', account_manager: 'Gaurav Saxena', recruiter_name: 'Tanvi Shah',
    skills: ['Documentation', 'Markdown', 'API Docs', 'Git'], notes: 'Current CTC: ₹11 LPA. Expected CTC: ₹14 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Rudra', last_name: 'Patel', email: 'rudra.patel@gmail.com', phone: '+91 98765 41009',
    location: 'Ahmedabad, Gujarat', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2409',
    job_title: 'Data Scientist', client: 'PhonePe', rate: '₹28 LPA',
    fe_name: 'Abhishek Tiwari', account_manager: 'Nandini Bose', recruiter_name: 'Yash Goyal',
    skills: ['Python', 'Pandas', 'SQL', 'Machine Learning'], notes: 'Current CTC: ₹23 LPA. Expected CTC: ₹28 LPA. Notice period: 60 days.',
  },
  {
    first_name: 'Anika', last_name: 'Sinha', email: 'anika.sinha@gmail.com', phone: '+91 98765 41010',
    location: 'Noida, Uttar Pradesh', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2410',
    job_title: 'Scrum Master', client: 'Paytm', rate: '₹18 LPA',
    fe_name: 'Simran Kaur', account_manager: 'Pranav Bhat', recruiter_name: 'Riya Mukherjee',
    skills: ['Agile', 'Jira', 'Kanban', 'Scrum'], notes: 'Current CTC: ₹14.5 LPA. Expected CTC: ₹18 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Shruthi', last_name: 'Reddy', email: 'shruthi.reddy@gmail.com', phone: '+91 98765 41011',
    location: 'Hyderabad, Telangana', work_auth: 'Indian Citizen', job_id: 'IN-REQ-2411',
    job_title: 'Senior Java Full Stack Developer', client: 'Wipro', rate: '₹27 LPA',
    fe_name: 'Akshay Khanna', account_manager: 'Mansi Arora', recruiter_name: 'Varun Bhide',
    skills: ['Java', 'Spring Boot', 'Microservices', 'Angular', 'AWS', 'Docker', 'Kubernetes', 'Kafka', 'Terraform', 'REST APIs'],
    notes: 'Current CTC: ₹22 LPA. Expected CTC: ₹27 LPA. Notice period: 30 days.',
  },
  {
    first_name: 'Nivedita', last_name: 'Rao', email: 'nivedita.rao@gmail.com', phone: '+91 98765 41012',
    location: 'Bengaluru, Karnataka', work_auth: 'OCI', job_id: 'IN-REQ-2412',
    job_title: 'Senior Java Full Stack Developer', client: 'Tech Mahindra', rate: '₹29 LPA',
    fe_name: 'Shreya Nambiar', account_manager: 'Kunal Sethi', recruiter_name: 'Aishwarya Rao',
    skills: ['Java', 'Spring Boot', 'React', 'AWS', 'Kafka', 'PostgreSQL'], notes: 'Current CTC: ₹24 LPA. Expected CTC: ₹29 LPA. Notice period: 45 days.',
  },
]

const jobs = [
  ['IN-REQ-2401', 'Senior React Developer', 'Infosys Digital', 'Bengaluru, Karnataka / Hybrid', 'Contract-to-Hire', '₹22-28 LPA', '₹2,700/hr', '₹2,100/hr', ['React', 'TypeScript', 'Redux Toolkit', 'Tailwind CSS']],
  ['IN-REQ-2402', 'Product Designer', 'Flipkart Labs', 'Bengaluru, Karnataka / Hybrid', 'Full-time', '₹18-24 LPA', '₹2,300/hr', '₹1,800/hr', ['Figma', 'Design Systems', 'Prototyping', 'User Research']],
  ['IN-REQ-2403', 'DevOps Engineer', 'Tata Digital', 'Pune, Maharashtra / Remote', 'Full-time', '₹24-30 LPA', '₹3,000/hr', '₹2,300/hr', ['AWS', 'Kubernetes', 'Docker', 'Terraform']],
  ['IN-REQ-2404', 'QA Automation Lead', 'Zoho', 'Chennai, Tamil Nadu / Hybrid', 'Full-time', '₹20-25 LPA', '₹2,500/hr', '₹1,950/hr', ['Selenium', 'Cypress', 'Playwright', 'API Testing']],
  ['IN-REQ-2405', 'Solutions Architect', 'HCLTech', 'Noida, Uttar Pradesh / Hybrid', 'Consulting', '₹32-40 LPA', '₹4,400/hr', '₹3,300/hr', ['System Design', 'Cloud Architecture', 'Node.js', 'NoSQL']],
  ['IN-REQ-2406', 'Backend Engineer', 'Freshworks', 'Chennai, Tamil Nadu / Remote', 'Full-time', '₹20-26 LPA', '₹2,600/hr', '₹2,000/hr', ['Node.js', 'Express', 'PostgreSQL', 'Prisma']],
  ['IN-REQ-2409', 'Data Scientist', 'PhonePe', 'Bengaluru, Karnataka / Hybrid', 'Full-time', '₹25-32 LPA', '₹3,500/hr', '₹2,700/hr', ['Python', 'Pandas', 'SQL', 'Machine Learning']],
  ['IN-REQ-2411', 'Senior Java Full Stack Developer', 'Wipro', 'Hyderabad, Telangana / Hybrid', 'Third-party Payroll', '₹25-31 LPA', '₹3,200/hr', '₹2,500/hr', ['Java', 'Spring Boot', 'Angular', 'AWS', 'Kafka']],
]

function slugName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')
}

async function main() {
  const org = await prisma.organization.update({
    where: { id: ORG_ID },
    data: { timezone: 'Asia/Calcutta', industry: 'Staffing & Recruiting', company_size: '50-200' },
  })

  const bransarvProfiles = await prisma.profile.findMany({
    where: { org_id: ORG_ID, email: { endsWith: '@bransarv.com' } },
    orderBy: { created_at: 'asc' },
    select: { id: true, email: true, role: true },
  })

  for (let i = 0; i < bransarvProfiles.length; i += 1) {
    const profile = bransarvProfiles[i]
    const fullName = names[i % names.length]
    const [team, department] = teams[i % teams.length]
    const suffix = profile.email?.split('@')[0]?.split('.').pop() || `in${String(i + 1).padStart(2, '0')}`
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        full_name: fullName,
        email: `${slugName(fullName)}.${suffix}@bransarv.com`,
        phone: `+91 80${String(5550100 + i).slice(-7)}`,
        extension: `BLR-${String(200 + i).padStart(3, '0')}`,
        team,
        department,
      },
    })
  }

  const existingCandidates = await prisma.candidate.findMany({
    where: { org_id: ORG_ID },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  })

  for (let i = 0; i < existingCandidates.length; i += 1) {
    const candidate = candidates[i % candidates.length]
    await prisma.candidate.update({
      where: { id: existingCandidates[i].id },
      data: {
        ...candidate,
        relocation: i % 3 === 0 ? 'Negotiable' : 'No',
        resume_text: `${candidate.first_name} ${candidate.last_name} is an India-based ${candidate.job_title} with experience in ${candidate.skills.join(', ')}. ${candidate.notes}`,
      },
    })
  }

  const owner = await prisma.profile.findFirst({ where: { org_id: ORG_ID }, orderBy: { created_at: 'asc' }, select: { id: true } })
  const assignees = await prisma.profile.findMany({ where: { org_id: ORG_ID, role: { in: ['recruiter', 'account_manager'] } }, take: 5, select: { id: true } })

  for (let i = 0; i < jobs.length; i += 1) {
    const [job_id, title, client, location, type, rate, bill_rate, pay_rate, skills] = jobs[i]
    await prisma.job.upsert({
      where: { id: (await prisma.job.findFirst({ where: { org_id: ORG_ID, job_id }, select: { id: true } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: {
        title, client, location, type, rate, bill_rate, pay_rate, skills,
        status: 'Open',
        priority: i < 2 ? 'High' : 'Medium',
        work_mode: location.includes('Remote') ? 'Remote' : 'Hybrid',
        workers_comp_code: 'GST-PAYROLL',
        openings: i < 3 ? 3 : 2,
        max_submittals: 8,
        experience_level: i < 2 ? 'Senior' : 'Mid',
        contact_name: names[(i + 10) % names.length],
        description: `${title} requirement for ${client}. India hiring workflow with INR budget, CTC discussion, notice period screening, and local joining coordination.`,
        notes: 'India region test data: validate INR compensation labels, CTC language, city/state locations, and GST/payroll wording.',
      },
      create: {
        org_id: ORG_ID,
        user_id: owner?.id,
        job_id, title, client, location, type, rate, bill_rate, pay_rate, skills,
        status: 'Open',
        open_date: new Date().toISOString().slice(0, 10),
        priority: i < 2 ? 'High' : 'Medium',
        fe: names[(i + 4) % names.length],
        assigned_to: assignees.map(a => a.id),
        work_mode: location.includes('Remote') ? 'Remote' : 'Hybrid',
        workers_comp_code: 'GST-PAYROLL',
        openings: i < 3 ? 3 : 2,
        max_submittals: 8,
        experience_level: i < 2 ? 'Senior' : 'Mid',
        contact_name: names[(i + 10) % names.length],
        description: `${title} requirement for ${client}. India hiring workflow with INR budget, CTC discussion, notice period screening, and local joining coordination.`,
        notes: 'India region test data: validate INR compensation labels, CTC language, city/state locations, and GST/payroll wording.',
      },
    })
  }

  const summary = {
    org: org.name,
    profilesUpdated: bransarvProfiles.length,
    candidatesUpdated: existingCandidates.length,
    jobsTotal: await prisma.job.count({ where: { org_id: ORG_ID } }),
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
