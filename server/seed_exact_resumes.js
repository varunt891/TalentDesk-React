import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

function getResumeForTitle(jobTitle = '', firstName = '', lastName = '') {
  const titleLower = String(jobTitle).toLowerCase()

  if (titleLower.includes('ui') || titleLower.includes('ux') || titleLower.includes('design')) {
    return {
      title: jobTitle || 'Senior UI/UX Engineer',
      skills: ['UI/UX', 'Figma', 'Wireframing', 'User Testing', 'Prototyping', 'CSS3', 'React', 'Tailwind CSS', 'System Design', 'Agile'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Senior UI/UX Engineer'}

SUMMARY:
Creative and detail-oriented ${jobTitle || 'Senior UI/UX Engineer'} with 6+ years of experience designing intuitive, high-converting digital products. Proven track record leading end-to-end user experience workflows, wireframing in Figma, conducting usability testing, and crafting accessible React UI component libraries.

CORE COMPETENCIES & SKILLS:
• User Interface & Experience Design (UI/UX, Figma, Sketch)
• Wireframing, Information Architecture & Interactive Prototyping
• User Testing, Personas & Usability Research
• Modern Frontend Styling (CSS3, Tailwind CSS, Sass)
• React & Design System Component Integration
• Agile Methodologies & Cross-Functional Collaboration`
    }
  }

  if (titleLower.includes('frontend') || titleLower.includes('front end') || titleLower.includes('react') || titleLower.includes('web')) {
    return {
      title: jobTitle || 'Senior Frontend Engineer',
      skills: ['React', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3', 'Redux', 'Tailwind CSS', 'REST API', 'Git', 'Jest'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Senior Frontend Developer'}

SUMMARY:
Results-driven ${jobTitle || 'Senior Frontend Developer'} with 6+ years specializing in building fast, scalable web applications with React, TypeScript, and JavaScript. Experienced in state management (Redux/Zustand), optimizing web vitals, integrating REST APIs, and writing automated unit tests.

TECHNICAL PROFICIENCIES:
• Core Web: React, TypeScript, JavaScript (ES6+), HTML5, CSS3
• Architecture & UI: Redux, Tailwind CSS, Component Libraries
• Tooling & Testing: REST API, Git, Vite, Webpack, Jest, Cypress`
    }
  }

  if (titleLower.includes('java') || titleLower.includes('spring') || titleLower.includes('backend')) {
    return {
      title: jobTitle || 'Senior Java Backend Engineer',
      skills: ['Java', 'Spring Boot', 'Microservices', 'SQL', 'PostgreSQL', 'Redis', 'REST API', 'Docker', 'Unit Testing', 'Git'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Senior Java Backend Engineer'}

SUMMARY:
High-performing ${jobTitle || 'Senior Java Backend Engineer'} with 7+ years of experience building resilient microservices and backend data pipelines. Deep expertise in Java, Spring Boot, PostgreSQL, Redis distributed caching, RESTful API design, and Docker containerization.

TECHNICAL HIGHLIGHTS:
• Core Technologies: Java 17, Spring Boot, Spring Data JPA
• Microservices: REST API, Microservices, Redis Caching, Kafka
• Database & DevOps: PostgreSQL, SQL, Docker, JUnit, Git`
    }
  }

  if (titleLower.includes('devops') || titleLower.includes('cloud') || titleLower.includes('aws') || titleLower.includes('architect') || titleLower.includes('infrastructure')) {
    return {
      title: jobTitle || 'Senior DevOps & Cloud Specialist',
      skills: ['DevOps', 'AWS', 'Kubernetes', 'Docker', 'CI/CD', 'Python', 'Azure', 'Git', 'Microservices', 'System Design'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Senior DevOps & Cloud Specialist'}

SUMMARY:
Certified ${jobTitle || 'Senior DevOps Specialist'} with 8+ years of experience managing multi-region cloud environments. Specialist in AWS, Kubernetes, Docker, automated CI/CD pipelines, and infrastructure automation using Python and Terraform. Successfully reduced infrastructure spend by 35% while maintaining 99.99% system availability.

KEY COMPETENCIES:
• Cloud Platforms: AWS (EC2, EKS, RDS, S3), Azure
• Containerization & CI/CD: Docker, Kubernetes, CI/CD, GitHub Actions
• Scripting & Security: Python, Bash, Git, System Design, Microservices`
    }
  }

  if (titleLower.includes('data') || titleLower.includes('ml') || titleLower.includes('machine learning') || titleLower.includes('ai') || titleLower.includes('analytics')) {
    return {
      title: jobTitle || 'Data Scientist & ML Engineer',
      skills: ['Python', 'Machine Learning', 'Data Analysis', 'SQL', 'Tableau', 'Power BI', 'FastAPI', 'PostgreSQL', 'REST API', 'Problem Solving'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Data Scientist & ML Engineer'}

SUMMARY:
Data Scientist and Machine Learning Engineer with 5+ years of experience extracting actionable business insights and deploying predictive ML models. Expert in Python, Machine Learning, Data Analysis, SQL, TensorFlow, Tableau, and FastAPI microservices.

TECHNICAL PROFICIENCIES:
• Predictive Modeling: Python, Machine Learning, Scikit-learn
• Data Visualization & Analytics: SQL, Tableau, Power BI, PostgreSQL
• Deployment & Integration: FastAPI, REST API, Problem Solving`
    }
  }

  if (titleLower.includes('product') || titleLower.includes('project') || titleLower.includes('manager') || titleLower.includes('scrum')) {
    return {
      title: jobTitle || 'Technical Product Manager',
      skills: ['Agile', 'Scrum', 'Jira', 'Product Management', 'System Design', 'Communication', 'Leadership', 'Problem Solving', 'Data Analysis', 'Teamwork'],
      resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Technical Product Manager'}

SUMMARY:
Strategic ${jobTitle || 'Technical Product Manager'} with 6+ years driving cross-functional product roadmaps from concept to launch. Proven leader in Agile, Scrum, Jira project tracking, requirements gathering, system architecture, and stakeholder communication.

KEY LEADERSHIP SKILLS:
• Product Lifecycle & Strategy: Agile, Scrum, Product Management
• Tools & Methodologies: Jira, Confluence, Data Analysis
• Soft Skills: Leadership, Communication, Problem Solving, Teamwork`
    }
  }

  // Default Full Stack / Software Engineer
  return {
    title: jobTitle || 'Lead Full Stack Engineer',
    skills: ['React', 'Node.js', 'TypeScript', 'JavaScript', 'PostgreSQL', 'REST API', 'GraphQL', 'Docker', 'Git', 'CI/CD'],
    resume: `PROFESSIONAL RESUME: ${firstName} ${lastName}
TARGET ROLE: ${jobTitle || 'Lead Full Stack Engineer'}

SUMMARY:
Versatile ${jobTitle || 'Lead Full Stack Engineer'} with 7+ years building modern SaaS web applications. Specialist in React, Node.js, TypeScript, JavaScript, PostgreSQL, REST API, and Docker. Track record of delivering scalable web platforms and leading agile dev teams.

CORE STACK:
• Frontend: React, TypeScript, JavaScript, HTML5, CSS3
• Backend: Node.js, Express, REST API, GraphQL, PostgreSQL
• DevOps & Practices: Docker, Git, CI/CD, Agile`
  }
}

async function seedExactResumes() {
  console.log('🚀 Matching candidate text resumes to their EXACT job titles...')

  try {
    const candidates = await prisma.candidate.findMany()
    console.log(`Found ${candidates.length} candidates in database.`)

    for (const cand of candidates) {
      const matchData = getResumeForTitle(cand.job_title, cand.first_name, cand.last_name)

      await prisma.candidate.update({
        where: { id: cand.id },
        data: {
          resume_text: matchData.resume,
          skills: matchData.skills
        }
      })
      console.log(`✅ Candidate ${cand.first_name} ${cand.last_name} (${cand.job_title || 'Software Engineer'}) updated with matching resume text & skills!`)
    }

    console.log(' All candidate resumes are now 100% matched to their job titles!')
  } catch (err) {
    console.error(' Seeding error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

seedExactResumes()
