import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

const RESUME_TEMPLATES = {
  uiux: {
    title: 'Senior UI/UX Engineer',
    skills: ['UI/UX', 'Figma', 'Wireframing', 'User Testing', 'Prototyping', 'CSS3', 'React', 'System Design', 'Communication', 'Agile'],
    text: `PROFESSIONAL RESUME:
Senior UI/UX Engineer with 6+ years of experience designing high-converting web and mobile interfaces. Specializing in Figma, Wireframing, User Testing, Rapid Prototyping, CSS3, and React component libraries. Demonstrated success leading design systems, conducting user research, improving WCAG 2.1 accessibility, and accelerating user engagement by 40%.

CORE COMPETENCIES:
• UI/UX Design & Wireframing
• Figma & Interactive Prototyping
• User Testing & Usability Research
• Responsive Design (CSS3 & Tailwind CSS)
• React & Design System Architecture
• Agile & Cross-Functional Teamwork`
  },
  fullstack: {
    title: 'Lead Full Stack Developer',
    skills: ['React', 'Node.js', 'TypeScript', 'JavaScript', 'PostgreSQL', 'REST API', 'GraphQL', 'Docker', 'Git', 'CI/CD'],
    text: `PROFESSIONAL RESUME:
Senior Full Stack Engineer with 7+ years of experience architecting enterprise web applications. Expert in React, Node.js, TypeScript, JavaScript, PostgreSQL, REST API, GraphQL, and Docker. Proven track record leading agile engineering teams, designing resilient database models, and building high-throughput microservices handling millions of daily active users.

TECHNICAL SKILLS:
• Frontend: React, TypeScript, JavaScript, HTML5, CSS3, Redux
• Backend: Node.js, Express, REST API, GraphQL, Microservices
• Databases & Cloud: PostgreSQL, MySQL, Redis, Docker, Git, CI/CD`
  },
  devops: {
    title: 'Senior DevOps & Cloud Specialist',
    skills: ['DevOps', 'AWS', 'Azure', 'Docker', 'Kubernetes', 'CI/CD', 'Python', 'Git', 'Microservices', 'System Design'],
    text: `PROFESSIONAL RESUME:
Senior DevOps & Cloud Infrastructure Engineer with 8 years of experience managing multi-cloud environments. Specialist in AWS, Azure, Docker, Kubernetes, automated CI/CD pipelines, and Python scripting. Successfully optimized cloud architecture to reduce infrastructure costs by 35% while maintaining 99.99% service availability.

KEY HIGHLIGHTS:
• Container Orchestration: Kubernetes, Docker, Helm
• Cloud Infrastructure: AWS (EC2, S3, RDS), Azure, Terraform
• Automation: CI/CD Pipelines, GitHub Actions, Python, Bash, Git`
  },
  datascientist: {
    title: 'Data Scientist & ML Engineer',
    skills: ['Python', 'Machine Learning', 'Data Analysis', 'SQL', 'Tableau', 'Power BI', 'REST API', 'PostgreSQL', 'FastAPI', 'Problem Solving'],
    text: `PROFESSIONAL RESUME:
Data Scientist and Machine Learning Specialist with 5+ years building predictive ML models and scalable data pipelines. Deep expertise in Python, Machine Learning, Data Analysis, SQL, TensorFlow, Tableau, and Power BI. Designed recommendation algorithms and NLP models that increased customer retention by 25%.

COMPETENCIES:
• Machine Learning & Statistical Modeling (Python, Scikit-learn)
• Data Analysis & Visualization (Tableau, Power BI, SQL)
• API Integration & Deployment (FastAPI, REST API, PostgreSQL)`
  },
  java: {
    title: 'Backend Java Microservices Engineer',
    skills: ['Java', 'Spring Boot', 'Microservices', 'SQL', 'PostgreSQL', 'Redis', 'REST API', 'Docker', 'Unit Testing', 'Git'],
    text: `PROFESSIONAL RESUME:
Senior Backend Java Developer with 6 years of experience building high-performance distributed systems. Core focus on Java, Spring Boot, Microservices architecture, PostgreSQL, Redis, REST APIs, and Docker. Experience leading migration of monolithic enterprise systems to modular microservices.

TECHNICAL STACK:
• Core Java & Spring Framework (Spring Boot, Spring Data JPA)
• Relational & NoSQL Storage (PostgreSQL, MySQL, Redis)
• Testing & DevOps: Unit Testing (JUnit, Mockito), Docker, Git`
  }
}

const JOBS_DATA = [
  {
    job_id: 'JOB-101',
    title: 'Senior UI/UX Engineer',
    client: 'MetaTech Corp',
    location: 'San Francisco, CA (Hybrid)',
    type: 'Contract',
    status: 'Open',
    rate: '$95/hr',
    open_date: '2026-07-28',
    priority: 'High',
    fe: 'Sarah K.',
    skills: ['UI/UX', 'Figma', 'Wireframing', 'User Testing', 'CSS3', 'React'],
    description: `MetaTech Corp is seeking a Senior UI/UX Engineer to lead user-centered product design and design system architecture. Candidate will collaborate closely with product managers and engineers to conduct user testing, wireframing, and build responsive React UI components.`
  },
  {
    job_id: 'JOB-102',
    title: 'Lead Full Stack Developer',
    client: 'CloudFlex Systems',
    location: 'New York, NY (Remote)',
    type: 'Contract-to-Hire',
    status: 'Open',
    rate: '$110/hr',
    open_date: '2026-07-28',
    priority: 'High',
    fe: 'Mike R.',
    skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'REST API', 'Docker'],
    description: `CloudFlex Systems is seeking a Lead Full Stack Developer to spearhead our core SaaS platform development. Key responsibilities include designing scalable Node.js REST APIs, building modern React interfaces, and managing PostgreSQL database schemas.`
  },
  {
    job_id: 'JOB-103',
    title: 'Senior DevOps & Cloud Specialist',
    client: 'FinCorp Global',
    location: 'Austin, TX (Remote)',
    type: 'Contract',
    status: 'Open',
    rate: '$115/hr',
    open_date: '2026-07-28',
    priority: 'High',
    fe: 'Rachel W.',
    skills: ['DevOps', 'AWS', 'Kubernetes', 'Docker', 'CI/CD', 'Python'],
    description: `FinCorp Global is seeking a Senior DevOps & Cloud Specialist to automate infrastructure provisioning and maintain multi-region AWS Kubernetes clusters. Must have hands-on experience with automated CI/CD pipelines, Docker container orchestration, and Python automation.`
  },
  {
    job_id: 'JOB-104',
    title: 'Data Scientist & ML Engineer',
    client: 'DataFlow AI',
    location: 'Boston, MA (Hybrid)',
    type: 'Full-time',
    status: 'Open',
    rate: '$120/hr',
    open_date: '2026-07-28',
    priority: 'Medium',
    fe: 'Alex M.',
    skills: ['Python', 'Machine Learning', 'Data Analysis', 'SQL', 'Tableau', 'FastAPI'],
    description: `Join DataFlow AI as a Data Scientist & Machine Learning Engineer to build cutting-edge predictive analytics and LLM integrations. Responsible for feature engineering, model training in Python, SQL data extraction, and executive dashboarding in Tableau.`
  },
  {
    job_id: 'JOB-105',
    title: 'Backend Java Microservices Engineer',
    client: 'Enterprise Core',
    location: 'Chicago, IL (On-site)',
    type: 'Contract',
    status: 'Open',
    rate: '$90/hr',
    open_date: '2026-07-28',
    priority: 'Medium',
    fe: 'Sarah K.',
    skills: ['Java', 'Spring Boot', 'Microservices', 'PostgreSQL', 'Redis', 'REST API'],
    description: `Enterprise Core is hiring a Senior Backend Java Developer to refactor legacy monoliths into high-performance Spring Boot microservices. Requires deep knowledge of distributed caching with Redis, relational data modeling in PostgreSQL, and RESTful web services.`
  }
]

async function seed() {
  console.log('🚀 Starting Resume Text & Jobs Seeding...')

  try {
    // 1. Fetch Candidates
    const candidates = await prisma.candidate.findMany()
    console.log(`Found ${candidates.length} candidate records in database.`)

    const templates = [
      RESUME_TEMPLATES.uiux,
      RESUME_TEMPLATES.fullstack,
      RESUME_TEMPLATES.devops,
      RESUME_TEMPLATES.datascientist,
      RESUME_TEMPLATES.java
    ]

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]
      const tpl = templates[i % templates.length]

      await prisma.candidate.update({
        where: { id: cand.id },
        data: {
          resume_text: tpl.text,
          skills: tpl.skills,
          job_title: cand.job_title || tpl.title
        }
      })
      console.log(` Updated candidate ${cand.first_name} ${cand.last_name} with ${tpl.title} resume text & skills.`)
    }

    // 2. Upsert Jobs
    for (const job of JOBS_DATA) {
      const existing = await prisma.job.findFirst({
        where: { job_id: job.job_id }
      })

      if (existing) {
        await prisma.job.update({
          where: { id: existing.id },
          data: job
        })
        console.log(` Updated job ${job.job_id} (${job.title}).`)
      } else {
        await prisma.job.create({
          data: job
        })
        console.log(` Created job ${job.job_id} (${job.title}).`)
      }
    }

    console.log(' Seeding completed successfully!')
  } catch (err) {
    console.error(' Seeding error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

seed()
