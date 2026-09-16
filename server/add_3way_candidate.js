import { prisma } from './src/prisma.js'

async function addThreeWayCandidate() {
  console.log('🚀 Adding 3-way candidate (same candidate, 3 different job IDs at same client)...')

  const ORG_ID = '4871af76-fa56-4069-af34-5f9ab4c0be10'
  const USER_VARUN = '1fdd5ba8-1c9b-482a-a4c4-9c5f138526ae'
  const USER_ANDREW = 'beabe6d9-5b88-4141-a3b0-93a715bc685b'

  const commonInfo = {
    first_name: 'Jordan',
    last_name: 'Blake',
    email: 'jordan.blake@cloudarch.io',
    phone: '(206) 555-0144',
    client: 'Microsoft',
    location: 'Seattle, WA',
    work_auth: 'US Citizen',
    experience: '10 years',
    submission_date: '2026-09-16',
    internal_status: 'Submitted',
    external_status: 'Under Review',
    priority: 'High',
    rate: '$95/hr',
    skills: ['Azure', 'Kubernetes', 'Terraform', 'System Architecture', 'Go', 'Python'],
    notes: 'Submitted to 3 distinct requisitions under Microsoft.',
    resume_text: 'Jordan Blake - Principal Cloud Architect\nEmail: jordan.blake@cloudarch.io | Phone: (206) 555-0144 | Seattle, WA\n\n10+ years driving enterprise cloud migrations for fortune 500 tech companies.'
  }

  const sub1 = await prisma.candidate.create({
    data: {
      org_id: ORG_ID,
      user_id: USER_VARUN,
      recruiter_name: 'Varun Thakur',
      ...commonInfo,
      job_id: 'JOB-201',
      job_title: 'Senior Azure Cloud Architect',
    },
  })

  const sub2 = await prisma.candidate.create({
    data: {
      org_id: ORG_ID,
      user_id: USER_ANDREW,
      recruiter_name: 'Andrew Gonzalez',
      ...commonInfo,
      job_id: 'JOB-202',
      job_title: 'Principal Infrastructure Platform Engineer',
    },
  })

  const sub3 = await prisma.candidate.create({
    data: {
      org_id: ORG_ID,
      user_id: USER_VARUN,
      recruiter_name: 'Varun Thakur',
      ...commonInfo,
      job_id: 'JOB-203',
      job_title: 'Cloud Security & Compliance Specialist',
    },
  })

  console.log('✅ Created 3 candidate submissions for Jordan Blake:', [sub1.id, sub2.id, sub3.id])

  console.log('Creating 3 soft collision pairs for the 3 requisitions...')
  await prisma.submissionCollision.createMany({
    data: [
      {
        org_id: ORG_ID,
        type: 'soft',
        match_field: 'both',
        status: 'open',
        candidate_id: sub1.id,
        candidate_name: `${sub1.first_name} ${sub1.last_name}`,
        candidate_email: sub1.email,
        candidate_phone: sub1.phone,
        job_id: sub1.job_id,
        job_title: sub1.job_title,
        client: sub1.client,
        submitting_user_id: sub1.user_id,
        submitting_recruiter_name: sub1.recruiter_name,

        matched_candidate_id: sub2.id,
        matched_recruiter_id: sub2.user_id,
        matched_recruiter_name: sub2.recruiter_name,
        matched_job_id: sub2.job_id,
        matched_job_title: sub2.job_title,
        matched_client: sub2.client,
      },
      {
        org_id: ORG_ID,
        type: 'soft',
        match_field: 'both',
        status: 'open',
        candidate_id: sub1.id,
        candidate_name: `${sub1.first_name} ${sub1.last_name}`,
        candidate_email: sub1.email,
        candidate_phone: sub1.phone,
        job_id: sub1.job_id,
        job_title: sub1.job_title,
        client: sub1.client,
        submitting_user_id: sub1.user_id,
        submitting_recruiter_name: sub1.recruiter_name,

        matched_candidate_id: sub3.id,
        matched_recruiter_id: sub3.user_id,
        matched_recruiter_name: sub3.recruiter_name,
        matched_job_id: sub3.job_id,
        matched_job_title: sub3.job_title,
        matched_client: sub3.client,
      },
      {
        org_id: ORG_ID,
        type: 'soft',
        match_field: 'both',
        status: 'open',
        candidate_id: sub2.id,
        candidate_name: `${sub2.first_name} ${sub2.last_name}`,
        candidate_email: sub2.email,
        candidate_phone: sub2.phone,
        job_id: sub2.job_id,
        job_title: sub2.job_title,
        client: sub2.client,
        submitting_user_id: sub2.user_id,
        submitting_recruiter_name: sub2.recruiter_name,

        matched_candidate_id: sub3.id,
        matched_recruiter_id: sub3.user_id,
        matched_recruiter_name: sub3.recruiter_name,
        matched_job_id: sub3.job_id,
        matched_job_title: sub3.job_title,
        matched_client: sub3.client,
      },
    ],
  })

  console.log('🎉 Successfully added 3-way candidate submissions and collision pairs!')
  process.exit(0)
}

addThreeWayCandidate().catch((err) => {
  console.error('❌ Insertion error:', err)
  process.exit(1)
})
