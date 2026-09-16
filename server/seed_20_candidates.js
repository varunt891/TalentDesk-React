import { prisma } from './src/prisma.js'

async function seed20Candidates() {
  console.log('🚀 Seeding 20 demo candidates with full details, 3 duplicates, and 3 interview scheduled...')

  const ORG_ID = '4871af76-fa56-4069-af34-5f9ab4c0be10' // TalentDesk org ID
  const USER_VARUN = '1fdd5ba8-1c9b-482a-a4c4-9c5f138526ae'
  const USER_ANDREW = 'beabe6d9-5b88-4141-a3b0-93a715bc685b'

  const candidatesData = [
    // ------------------------------------------------------------------------
    // DUPLICATE PAIR 1 (COLLISION 1: Same Job JOB-114 - Cloud Architect)
    // ------------------------------------------------------------------------
    {
      first_name: 'Alexander',
      last_name: 'Wright',
      email: 'alex.wright@techsolutions.io',
      phone: '(512) 892-4100',
      job_id: 'JOB-114',
      job_title: 'Lead Cloud Solutions Architect',
      client: 'AWS CloudCorp',
      location: 'Austin, TX',
      work_auth: 'US Citizen',
      experience: '11 years',
      submission_date: '2026-09-15',
      internal_status: 'Submitted',
      external_status: 'Under Review',
      priority: 'High',
      rate: '$95/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['AWS', 'Kubernetes', 'Terraform', 'System Architecture', 'Python', 'Docker', 'CI/CD'],
      notes: 'Strong enterprise architect with 11+ years migrating legacy apps to AWS EKS and Terraform.',
      resume_text: 'Alexander Wright - Lead Cloud Solutions Architect\nEmail: alex.wright@techsolutions.io | Phone: (512) 892-4100 | Austin, TX\n\nSUMMARY:\n11+ years experience in Enterprise Cloud Infrastructure, Kubernetes orchestration, and multi-region AWS architectures.'
    },
    {
      first_name: 'Alex',
      last_name: 'Wright',
      email: 'alex.wright@techsolutions.io',
      phone: '(512) 892-4100',
      job_id: 'JOB-114',
      job_title: 'Lead Cloud Solutions Architect',
      client: 'AWS CloudCorp',
      location: 'Austin, TX',
      work_auth: 'US Citizen',
      experience: '11 years',
      submission_date: '2026-09-16',
      internal_status: 'Submitted',
      external_status: 'Under Review',
      priority: 'High',
      rate: '$90/hr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['AWS', 'Kubernetes', 'Terraform', 'Cloud Architecture', 'Python', 'Go'],
      notes: 'Duplicate submission by Varun Thakur for the same AWS CloudCorp requisition.',
      resume_text: 'Alex Wright - Senior Cloud Architect\nEmail: alex.wright@techsolutions.io | Phone: (512) 892-4100\nAustin, TX\n\nExpertise: AWS Solutions Architect Professional certified. Built multi-region Terraform pipelines.'
    },

    // ------------------------------------------------------------------------
    // DUPLICATE PAIR 2 (COLLISION 2: Same Job JOB-118 - Senior React Engineer)
    // ------------------------------------------------------------------------
    {
      first_name: 'Elena',
      last_name: 'Rostova',
      email: 'elena.rostova@devmail.io',
      phone: '(415) 381-9920',
      job_id: 'JOB-118',
      job_title: 'Senior Frontend Developer (React)',
      client: 'Stripe Fintech',
      location: 'San Francisco, CA',
      work_auth: 'Green Card',
      experience: '7 years',
      submission_date: '2026-09-14',
      internal_status: 'Submitted',
      external_status: 'Screening',
      priority: 'High',
      rate: '$85/hr',
      recruiter_name: 'Sarah Jenkins',
      user_id: USER_VARUN,
      skills: ['React', 'TypeScript', 'Next.js', 'TailwindCSS', 'Redux Toolkit', 'GraphQL', 'Jest'],
      notes: 'Top tier UI engineer with extensive React 19 and Next.js App Router performance tuning experience.',
      resume_text: 'Elena Rostova - Senior Frontend Developer\nEmail: elena.rostova@devmail.io | Phone: (415) 381-9920\nSan Francisco, CA\n\n7 years building high-frequency fintech web portals in React, TypeScript, and GraphQL.'
    },
    {
      first_name: 'Elena',
      last_name: 'Rostova',
      email: 'elena.rostova@devmail.io',
      phone: '(415) 381-9920',
      job_id: 'JOB-118',
      job_title: 'Senior Frontend Developer (React)',
      client: 'Stripe Fintech',
      location: 'San Francisco, CA',
      work_auth: 'Green Card',
      experience: '7 years',
      submission_date: '2026-09-16',
      internal_status: 'Submitted',
      external_status: 'Screening',
      priority: 'Medium',
      rate: '$88/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['React', 'TypeScript', 'Next.js', 'Web Vitals', 'TailwindCSS'],
      notes: 'Duplicate submission from agency vendor via Andrew Gonzalez.',
      resume_text: 'Elena Rostova - Principal UI Engineer\nEmail: elena.rostova@devmail.io | Phone: (415) 381-9920\nSF, California.'
    },

    // ------------------------------------------------------------------------
    // DUPLICATE PAIR 3 (COLLISION 3: Same Client Cyberdyne - Soft Collision)
    // ------------------------------------------------------------------------
    {
      first_name: 'Marcus',
      last_name: 'Vance',
      email: 'marcus.vance@cybernet.org',
      phone: '(206) 749-1122',
      job_id: 'JOB-120',
      job_title: 'Senior DevOps & Site Reliability Engineer',
      client: 'Cyberdyne Systems',
      location: 'Seattle, WA',
      work_auth: 'US Citizen',
      experience: '9 years',
      submission_date: '2026-09-13',
      internal_status: 'Shortlisted',
      external_status: 'Client Review',
      priority: 'High',
      rate: '$140,000/yr',
      recruiter_name: 'Shruthi Reddy',
      user_id: USER_VARUN,
      skills: ['DevOps', 'SRE', 'Prometheus', 'Grafana', 'Kubernetes', 'Ansible', 'Python'],
      notes: 'SRE Specialist focused on 99.999% uptime for cloud services.',
      resume_text: 'Marcus Vance - Senior Site Reliability Engineer\nEmail: marcus.vance@cybernet.org | Phone: (206) 749-1122\nSeattle, WA.'
    },
    {
      first_name: 'Marcus',
      last_name: 'Vance',
      email: 'marcus.vance@cybernet.org',
      phone: '(206) 749-1122',
      job_id: 'JOB-122',
      job_title: 'Infrastructure Security Engineer',
      client: 'Cyberdyne Systems',
      location: 'Seattle, WA',
      work_auth: 'US Citizen',
      experience: '9 years',
      submission_date: '2026-09-16',
      internal_status: 'Submitted',
      external_status: 'Submitted',
      priority: 'Medium',
      rate: '$145,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['DevOps', 'Cybersecurity', 'SIEM', 'AWS Security', 'Kubernetes Security'],
      notes: 'Soft collision — submitted to a second role at Cyberdyne Systems by Varun Thakur.',
      resume_text: 'Marcus Vance - Security & SRE Engineer\nEmail: marcus.vance@cybernet.org | Phone: (206) 749-1122.'
    },

    // ------------------------------------------------------------------------
    // 3 CANDIDATES WITH INTERVIEW SCHEDULED
    // ------------------------------------------------------------------------
    {
      first_name: 'Sophia',
      last_name: 'Chen',
      email: 'sophia.chen@ai-labs.com',
      phone: '(408) 991-3344',
      job_id: 'IN-REQ-2409',
      job_title: 'Senior Data Scientist & ML Engineer',
      client: 'PhonePe',
      location: 'San Jose, CA',
      work_auth: 'H1B',
      experience: '6 years',
      submission_date: '2026-09-10',
      internal_status: 'Interview Scheduled',
      external_status: 'Interviewing',
      interview_date: '2026-09-18',
      interview_time: '10:00 AM',
      priority: 'High',
      rate: '$155,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Python', 'PyTorch', 'TensorFlow', 'LLMs', 'Scikit-Learn', 'SQL', 'BigQuery'],
      notes: 'Final round technical interview scheduled with VP of AI Engineering on Friday.',
      resume_text: 'Sophia Chen, PhD - Senior Data Scientist\nEmail: sophia.chen@ai-labs.com | Phone: (408) 991-3344\nSan Jose, CA\n\nPhD in Computer Science (Stanford). Built production recommendation systems serving 10M DAUs.'
    },
    {
      first_name: 'David',
      last_name: 'Kowalski',
      email: 'david.k@cloudnet.org',
      phone: '(312) 654-8899',
      job_id: 'IN-REQ-2411',
      job_title: 'Senior Java Full Stack Developer',
      client: 'Wipro',
      location: 'Chicago, IL',
      work_auth: 'US Citizen',
      experience: '8 years',
      submission_date: '2026-09-11',
      internal_status: 'Interview Scheduled',
      external_status: 'Interviewing',
      interview_date: '2026-09-18',
      interview_time: '02:00 PM',
      priority: 'High',
      rate: '$75/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['Java 21', 'Spring Boot', 'Angular 17', 'Microservices', 'PostgreSQL', 'Kafka'],
      notes: 'Client technical round confirmed for 2:00 PM CST.',
      resume_text: 'David Kowalski - Senior Java Full Stack Developer\nEmail: david.k@cloudnet.org | Phone: (312) 654-8899\nChicago, IL\n\n8 years building resilient banking applications with Spring Boot, Java 21, and Angular.'
    },
    {
      first_name: 'Aisha',
      last_name: 'Patel',
      email: 'aisha.patel@techsolutions.com',
      phone: '(470) 223-5511',
      job_id: 'IN-REQ-2406',
      job_title: 'Backend Engineer (Go & Distributed Systems)',
      client: 'Freshworks',
      location: 'Atlanta, GA',
      work_auth: 'Green Card',
      experience: '5 years',
      submission_date: '2026-09-12',
      internal_status: 'Interview Scheduled',
      external_status: 'Interviewing',
      interview_date: '2026-09-19',
      interview_time: '11:30 AM',
      priority: 'High',
      rate: '$135,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Go', 'Golang', 'gRPC', 'PostgreSQL', 'Redis', 'Docker', 'Microservices'],
      notes: 'System design interview scheduled with Tech Lead Aisha Patel.',
      resume_text: 'Aisha Patel - Backend Engineer (Go & gRPC)\nEmail: aisha.patel@techsolutions.com | Phone: (470) 223-5511\nAtlanta, GA\n\n5 years designing high-throughput microservices using Golang, gRPC, and Redis streams.'
    },

    // ------------------------------------------------------------------------
    // 11 ADDITIONAL REALISTIC CANDIDATES FOR COMPLETE 20 DEMO DATASET
    // ------------------------------------------------------------------------
    {
      first_name: 'Carlos',
      last_name: 'Mendoza',
      email: 'carlos.mendoza@cybersec.io',
      phone: '(737) 441-2090',
      job_id: 'JOB-125',
      job_title: 'Cybersecurity Analyst & SOC Specialist',
      client: 'CrowdStrike Partner',
      location: 'Austin, TX',
      work_auth: 'US Citizen',
      experience: '6 years',
      submission_date: '2026-09-13',
      internal_status: 'Shortlisted',
      external_status: 'Client Screening',
      priority: 'Medium',
      rate: '$65/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['SIEM', 'Splunk', 'CrowdStrike', 'Threat Hunting', 'Incident Response', 'CISSP'],
      notes: 'CISSP certified security analyst with deep threat hunting expertise.',
      resume_text: 'Carlos Mendoza, CISSP - Cybersecurity Analyst\nEmail: carlos.mendoza@cybersec.io | Austin, TX.'
    },
    {
      first_name: 'Emily',
      last_name: 'Watson',
      email: 'emily.watson@uxstudio.com',
      phone: '(212) 883-9944',
      job_id: 'JOB-126',
      job_title: 'Lead Product Designer (UI/UX)',
      client: 'Figma Systems',
      location: 'New York, NY',
      work_auth: 'US Citizen',
      experience: '7 years',
      submission_date: '2026-09-14',
      internal_status: 'Shortlisted',
      external_status: 'Portfolio Review',
      priority: 'High',
      rate: '$145,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Figma', 'User Research', 'Design Systems', 'Prototyping', 'UI/UX', 'Accessibility'],
      notes: 'Exceptional portfolio showcasing enterprise SaaS design system creation.',
      resume_text: 'Emily Watson - Lead Product Designer\nEmail: emily.watson@uxstudio.com | New York, NY.'
    },
    {
      first_name: 'Rohan',
      last_name: 'Deshmukh',
      email: 'rohan.deshmukh@datapipeline.org',
      phone: '(425) 301-7788',
      job_id: 'JOB-127',
      job_title: 'Senior Data Engineer (Snowflake & Spark)',
      client: 'Databricks Partner',
      location: 'Bellevue, WA',
      work_auth: 'H1B',
      experience: '8 years',
      submission_date: '2026-09-14',
      internal_status: 'Submitted',
      external_status: 'Under Review',
      priority: 'Medium',
      rate: '$80/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['PySpark', 'Snowflake', 'dbt', 'Airflow', 'Python', 'SQL', 'BigQuery'],
      notes: 'Expert in building multi-TB data lakehouse pipelines.',
      resume_text: 'Rohan Deshmukh - Senior Data Engineer\nEmail: rohan.deshmukh@datapipeline.org | Bellevue, WA.'
    },
    {
      first_name: 'Jessica',
      last_name: 'Taylor',
      email: 'jessica.taylor@qa-automation.net',
      phone: '(303) 512-6633',
      job_id: 'JOB-128',
      job_title: 'SDET & Automation Test Lead',
      client: 'Lockheed Martin',
      location: 'Denver, CO',
      work_auth: 'US Citizen',
      experience: '9 years',
      submission_date: '2026-09-15',
      internal_status: 'Offer Extended',
      external_status: 'Offer Pending',
      priority: 'High',
      rate: '$125,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Playwright', 'Cypress', 'Selenium', 'TypeScript', 'CI/CD', 'API Testing'],
      notes: 'Offer extended! Waiting for candidate sign off by Friday.',
      resume_text: 'Jessica Taylor - SDET & Automation Lead\nEmail: jessica.taylor@qa-automation.net | Denver, CO.'
    },
    {
      first_name: 'Liam',
      last_name: 'O\'Connor',
      email: 'liam.oconnor@devops-hub.io',
      phone: '(617) 492-1100',
      job_id: 'JOB-129',
      job_title: 'Site Reliability Specialist',
      client: 'Raytheon',
      location: 'Boston, MA',
      work_auth: 'US Citizen',
      experience: '5 years',
      submission_date: '2026-09-15',
      internal_status: 'Submitted',
      external_status: 'Submitted',
      priority: 'Low',
      rate: '$70/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['Linux', 'Docker', 'Kubernetes', 'Bash', 'Python', 'Monitoring'],
      notes: 'Solid mid-level SRE engineer.',
      resume_text: 'Liam O\'Connor - SRE Specialist\nEmail: liam.oconnor@devops-hub.io | Boston, MA.'
    },
    {
      first_name: 'Priya',
      last_name: 'Sharma',
      email: 'priya.sharma@fullstack.dev',
      phone: '(469) 821-4477',
      job_id: 'JOB-130',
      job_title: 'Full Stack Node & React Engineer',
      client: 'Toyota Connected',
      location: 'Dallas, TX',
      work_auth: 'Green Card',
      experience: '6 years',
      submission_date: '2026-09-15',
      internal_status: 'New',
      external_status: 'New Lead',
      priority: 'Medium',
      rate: '$75/hr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Node.js', 'Express', 'React', 'TypeScript', 'MongoDB', 'AWS Lambda'],
      notes: 'Fresh applicant submitted via online sourcing portal.',
      resume_text: 'Priya Sharma - Full Stack Software Developer\nEmail: priya.sharma@fullstack.dev | Dallas, TX.'
    },
    {
      first_name: 'Michael',
      last_name: 'Brown',
      email: 'michael.brown@pm-expert.com',
      phone: '(214) 709-3322',
      job_id: 'JOB-131',
      job_title: 'Technical Product Manager',
      client: 'Capital One',
      location: 'Plano, TX',
      work_auth: 'US Citizen',
      experience: '10 years',
      submission_date: '2026-09-15',
      internal_status: 'Hired',
      external_status: 'Placed',
      priority: 'High',
      rate: '$160,000/yr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['Product Management', 'Agile/Scrum', 'Jira', 'API Architecture', 'Roadmapping'],
      notes: 'HIRED! Offer accepted and start date confirmed for October 1st.',
      resume_text: 'Michael Brown - Technical Product Manager\nEmail: michael.brown@pm-expert.com | Plano, TX.'
    },
    {
      first_name: 'Hannah',
      last_name: 'Zimmerman',
      email: 'hannah.z@mobile-apps.org',
      phone: '(310) 902-8811',
      job_id: 'JOB-132',
      job_title: 'Senior iOS Engineer (Swift & SwiftUI)',
      client: 'Snapchat',
      location: 'Los Angeles, CA',
      work_auth: 'US Citizen',
      experience: '7 years',
      submission_date: '2026-09-16',
      internal_status: 'Submitted',
      external_status: 'Submitted',
      priority: 'High',
      rate: '$90/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['Swift', 'SwiftUI', 'Combine', 'Combine/CoreData', 'XCTest'],
      notes: 'Experienced iOS developer with 3 apps published on Apple App Store.',
      resume_text: 'Hannah Zimmerman - Senior iOS Engineer\nEmail: hannah.z@mobile-apps.org | LA, CA.'
    },
    {
      first_name: 'Vikram',
      last_name: 'Singhania',
      email: 'vikram.s@db-admin.net',
      phone: '(972) 410-6677',
      job_id: 'JOB-133',
      job_title: 'Principal Database Administrator (PostgreSQL & Oracle)',
      client: 'ExxonMobil',
      location: 'Houston, TX',
      work_auth: 'Green Card',
      experience: '12 years',
      submission_date: '2026-09-16',
      internal_status: 'Shortlisted',
      external_status: 'Screening',
      priority: 'High',
      rate: '$95/hr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['PostgreSQL', 'Oracle DBA', 'Performance Tuning', 'High Availability', 'Backup & Recovery'],
      notes: 'Expert DBA specialized in high-concurrency relational databases.',
      resume_text: 'Vikram Singhania - Principal DBA\nEmail: vikram.s@db-admin.net | Houston, TX.'
    },
    {
      first_name: 'Samantha',
      last_name: 'Miller',
      email: 'samantha.m@hr-staffing.com',
      phone: '(615) 321-9988',
      job_id: 'JOB-134',
      job_title: 'Talent Acquisition & Sourcing Lead',
      client: 'Healthcare Systems',
      location: 'Nashville, TN',
      work_auth: 'US Citizen',
      experience: '8 years',
      submission_date: '2026-09-16',
      internal_status: 'New',
      external_status: 'New Lead',
      priority: 'Medium',
      rate: '$55/hr',
      recruiter_name: 'Andrew Gonzalez',
      user_id: USER_ANDREW,
      skills: ['Technical Sourcing', 'LinkedIn Recruiter', 'Boolean Search', 'ATS Management'],
      notes: 'Senior technical recruiter with expertise sourcing specialized clinical & IT talent.',
      resume_text: 'Samantha Miller - Talent Acquisition Lead\nEmail: samantha.m@hr-staffing.com | Nashville, TN.'
    },
    {
      first_name: 'Nathaniel',
      last_name: 'Brooks',
      email: 'nathaniel.b@embedded-sys.io',
      phone: '(408) 772-1133',
      job_id: 'JOB-135',
      job_title: 'Embedded Firmware Engineer (C/C++)',
      client: 'NVIDIA Partner',
      location: 'Santa Clara, CA',
      work_auth: 'US Citizen',
      experience: '9 years',
      submission_date: '2026-09-16',
      internal_status: 'Submitted',
      external_status: 'Submitted',
      priority: 'High',
      rate: '$85/hr',
      recruiter_name: 'Varun Thakur',
      user_id: USER_VARUN,
      skills: ['C++', 'Embedded C', 'RTOS', 'ARM Cortex', 'SPI/I2C', 'Hardware Debugging'],
      notes: 'Low-level C/C++ firmware expert for autonomous systems.',
      resume_text: 'Nathaniel Brooks - Embedded Systems Engineer\nEmail: nathaniel.b@embedded-sys.io | Santa Clara, CA.'
    }
  ]

  console.log(`Creating ${candidatesData.length} candidates...`)

  const createdCandidates = []
  for (const cand of candidatesData) {
    const created = await prisma.candidate.create({
      data: {
        org_id: ORG_ID,
        ...cand,
      },
    })
    createdCandidates.push(created)
  }

  console.log(`✅ Successfully inserted ${createdCandidates.length} candidate records!`)

  // Now create the 3 Collision records in `submission_collisions` for the 3 duplicate pairs!
  // Pair 1: Alexander Wright (Index 0) vs Alex Wright (Index 1) -> Hard collision on JOB-114
  // Pair 2: Elena Rostova (Index 2) vs Elena Rostova (Index 3) -> Hard collision on JOB-118
  // Pair 3: Marcus Vance (Index 4) vs Marcus Vance (Index 5) -> Soft collision on Cyberdyne Systems

  const cand1 = createdCandidates[0]
  const cand1Dup = createdCandidates[1]

  const cand2 = createdCandidates[2]
  const cand2Dup = createdCandidates[3]

  const cand3 = createdCandidates[4]
  const cand3Dup = createdCandidates[5]

  console.log('Creating 3 open submission collision records...')

  await prisma.submissionCollision.createMany({
    data: [
      {
        org_id: ORG_ID,
        type: 'hard',
        match_field: 'both',
        status: 'open',
        candidate_id: cand1.id,
        candidate_name: `${cand1.first_name} ${cand1.last_name}`,
        candidate_email: cand1.email,
        candidate_phone: cand1.phone,
        job_id: cand1.job_id,
        job_title: cand1.job_title,
        client: cand1.client,
        submitting_user_id: cand1.user_id,
        submitting_recruiter_name: cand1.recruiter_name,

        matched_candidate_id: cand1Dup.id,
        matched_recruiter_id: cand1Dup.user_id,
        matched_recruiter_name: cand1Dup.recruiter_name,
        matched_job_id: cand1Dup.job_id,
        matched_job_title: cand1Dup.job_title,
        matched_client: cand1Dup.client,
      },
      {
        org_id: ORG_ID,
        type: 'hard',
        match_field: 'both',
        status: 'open',
        candidate_id: cand2.id,
        candidate_name: `${cand2.first_name} ${cand2.last_name}`,
        candidate_email: cand2.email,
        candidate_phone: cand2.phone,
        job_id: cand2.job_id,
        job_title: cand2.job_title,
        client: cand2.client,
        submitting_user_id: cand2.user_id,
        submitting_recruiter_name: cand2.recruiter_name,

        matched_candidate_id: cand2Dup.id,
        matched_recruiter_id: cand2Dup.user_id,
        matched_recruiter_name: cand2Dup.recruiter_name,
        matched_job_id: cand2Dup.job_id,
        matched_job_title: cand2Dup.job_title,
        matched_client: cand2Dup.client,
      },
      {
        org_id: ORG_ID,
        type: 'soft',
        match_field: 'both',
        status: 'open',
        candidate_id: cand3.id,
        candidate_name: `${cand3.first_name} ${cand3.last_name}`,
        candidate_email: cand3.email,
        candidate_phone: cand3.phone,
        job_id: cand3.job_id,
        job_title: cand3.job_title,
        client: cand3.client,
        submitting_user_id: cand3.user_id,
        submitting_recruiter_name: cand3.recruiter_name,

        matched_candidate_id: cand3Dup.id,
        matched_recruiter_id: cand3Dup.user_id,
        matched_recruiter_name: cand3Dup.recruiter_name,
        matched_job_id: cand3Dup.job_id,
        matched_job_title: cand3Dup.job_title,
        matched_client: cand3Dup.client,
      },
    ],
  })

  console.log('🎉 Seeding finished! 20 Candidates, 3 Duplicate Open Collisions, and 3 Interview Scheduled candidates added.')
  process.exit(0)
}

seed20Candidates().catch((err) => {
  console.error('❌ Seeding error:', err)
  process.exit(1)
})
