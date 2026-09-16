import { prisma } from './src/prisma.js'

async function addSixWayCandidate() {
  console.log('🚀 Adding 6-way candidate (same candidate, 6 different job IDs at Google)...')

  const ORG_ID = '4871af76-fa56-4069-af34-5f9ab4c0be10'
  const USER_VARUN = '1fdd5ba8-1c9b-482a-a4c4-9c5f138526ae'
  const USER_ANDREW = 'beabe6d9-5b88-4141-a3b0-93a715bc685b'

  const commonInfo = {
    first_name: 'Devon',
    last_name: 'Vance',
    email: 'devon.vance@google-partner.io',
    phone: '(650) 899-4411',
    client: 'Google',
    location: 'Mountain View, CA',
    work_auth: 'US Citizen',
    experience: '12 years',
    submission_date: '2026-09-16',
    internal_status: 'Submitted',
    external_status: 'Under Review',
    priority: 'High',
    rate: '$110/hr',
    skills: ['Go', 'Kubernetes', 'Borg', 'Distributed Systems', 'gRPC', 'Python'],
    notes: 'Submitted to 6 distinct requisitions under Google.',
    resume_text: 'Devon Vance - Principal Infrastructure Engineer\nEmail: devon.vance@google-partner.io | Phone: (650) 899-4411 | Mountain View, CA\n\n12+ years in Large-Scale Distributed Systems & Cloud Platforms.'
  }

  const jobs = [
    { id: 'JOB-301', title: 'Senior Infrastructure Engineer (Borg/Kubernetes)' },
    { id: 'JOB-302', title: 'Principal Site Reliability Architect' },
    { id: 'JOB-303', title: 'Distributed Systems & Go Developer' },
    { id: 'JOB-304', title: 'Cloud Platform Security Lead' },
    { id: 'JOB-305', title: 'Networking & gRPC Specialist' },
    { id: 'JOB-306', title: 'Technical Program Infrastructure Director' },
  ]

  const createdSubs = []
  for (let i = 0; i < jobs.length; i++) {
    const sub = await prisma.candidate.create({
      data: {
        org_id: ORG_ID,
        user_id: i % 2 === 0 ? USER_VARUN : USER_ANDREW,
        recruiter_name: i % 2 === 0 ? 'Varun Thakur' : 'Andrew Gonzalez',
        ...commonInfo,
        job_id: jobs[i].id,
        job_title: jobs[i].title,
      },
    })
    createdSubs.push(sub)
  }

  console.log('✅ Created 6 candidate submissions for Devon Vance')

  // Create pairwise collision records for all combinations (6 * 5 / 2 = 15 collisions)
  const collisionData = []
  for (let i = 0; i < createdSubs.length; i++) {
    for (let j = i + 1; j < createdSubs.length; j++) {
      const s1 = createdSubs[i]
      const s2 = createdSubs[j]
      collisionData.push({
        org_id: ORG_ID,
        type: 'soft',
        match_field: 'both',
        status: 'open',
        candidate_id: s1.id,
        candidate_name: `${s1.first_name} ${s1.last_name}`,
        candidate_email: s1.email,
        candidate_phone: s1.phone,
        job_id: s1.job_id,
        job_title: s1.job_title,
        client: s1.client,
        submitting_user_id: s1.user_id,
        submitting_recruiter_name: s1.recruiter_name,

        matched_candidate_id: s2.id,
        matched_recruiter_id: s2.user_id,
        matched_recruiter_name: s2.recruiter_name,
        matched_job_id: s2.job_id,
        matched_job_title: s2.job_title,
        matched_client: s2.client,
      })
    }
  }

  await prisma.submissionCollision.createMany({ data: collisionData })
  console.log(`🎉 Successfully created ${collisionData.length} collision entries for 6-way candidate Devon Vance!`)
  process.exit(0)
}

addSixWayCandidate().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
