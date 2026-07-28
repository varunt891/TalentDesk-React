import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function createDentistData() {
  console.log('🚀 Creating Dentist Job and Candidate Profile...')

  try {
    // 1. Create Dentist Job Requisition
    const dentistJob = await prisma.job.upsert({
      where: { id: '00000000-0000-0000-0000-000000000201' },
      update: {
        job_id: 'JOB-201',
        title: 'General Dentist & Oral Surgeon',
        client: 'DentalCare Health Clinics',
        location: 'Chicago, IL',
        type: 'Full-time',
        status: 'Open',
        rate: '$150/hr',
        open_date: '2026-07-28',
        priority: 'High',
        fe: 'Dr. Aris',
        skills: ['Dentistry', 'Oral Surgery', 'Teeth Cleaning', 'Root Canal', 'Patient Care', 'Dental X-Rays'],
        description: `DentalCare Health Clinics is seeking an experienced General Dentist with a proven track record in comprehensive dental care, root canals, oral surgery, teeth cleaning, and diagnostic X-rays. Must have strong patient communication skills and active state dental licensure.`
      },
      create: {
        id: '00000000-0000-0000-0000-000000000201',
        job_id: 'JOB-201',
        title: 'General Dentist & Oral Surgeon',
        client: 'DentalCare Health Clinics',
        location: 'Chicago, IL',
        type: 'Full-time',
        status: 'Open',
        rate: '$150/hr',
        open_date: '2026-07-28',
        priority: 'High',
        fe: 'Dr. Aris',
        skills: ['Dentistry', 'Oral Surgery', 'Teeth Cleaning', 'Root Canal', 'Patient Care', 'Dental X-Rays'],
        description: `DentalCare Health Clinics is seeking an experienced General Dentist with a proven track record in comprehensive dental care, root canals, oral surgery, teeth cleaning, and diagnostic X-rays. Must have strong patient communication skills and active state dental licensure.`
      }
    })
    console.log(` Created Job: ${dentistJob.job_id} - ${dentistJob.title}`)

    // 2. Create Dentist Candidate Profile (6 Years Experience)
    const dentistCandidate = await prisma.candidate.upsert({
      where: { id: '00000000-0000-0000-0000-000000000202' },
      update: {
        first_name: 'Dr. Marcus',
        last_name: 'Vance',
        email: 'dr.marcus.vance@dentalcare.com',
        phone: '+1 312 555 7890',
        location: 'Chicago, IL',
        work_auth: 'US Citizen',
        experience: '6',
        submission_date: '2026-07-28',
        job_id: 'JOB-201',
        job_title: 'General Dentist',
        client: 'DentalCare Health Clinics',
        rate: '$150/hr',
        relocation: 'No',
        internal_status: 'Submitted',
        external_status: 'Interview Scheduled',
        feedback_status: 'Positive',
        priority: 'High',
        fe_name: 'Sarah K.',
        skills: ['Dentistry', 'Oral Surgery', 'Teeth Cleaning', 'Root Canal', 'Patient Care', 'Dental X-Rays'],
        notes: 'Experienced general practitioner with 6 years of clinical dentist practice, specialized in preventive dentistry, root canal treatments, and cosmetic oral surgery.',
        resume_text: `PROFESSIONAL RESUME: Dr. Marcus Vance, DDS
TARGET ROLE: General Dentist (6 Years Experience)

SUMMARY:
Licensed General Dentist with 6 years of clinical practice experience providing high-quality oral healthcare to patients of all ages. Specialist in preventive dentistry, root canal therapy, teeth cleaning, oral surgery, dental X-rays, and patient care management.

CLINICAL EXPERTISE & SKILLS:
• Comprehensive Dentistry & Diagnostic Dental X-Rays
• Root Canal Therapy & Endodontics
• Oral Surgery & Tooth Extractions
• Teeth Cleaning & Preventive Periodontics
• Patient Care, Treatment Planning & Local Anesthesia
• Active Dental Licensure & Board Certified`
      },
      create: {
        id: '00000000-0000-0000-0000-000000000202',
        first_name: 'Dr. Marcus',
        last_name: 'Vance',
        email: 'dr.marcus.vance@dentalcare.com',
        phone: '+1 312 555 7890',
        location: 'Chicago, IL',
        work_auth: 'US Citizen',
        experience: '6',
        submission_date: '2026-07-28',
        job_id: 'JOB-201',
        job_title: 'General Dentist',
        client: 'DentalCare Health Clinics',
        rate: '$150/hr',
        relocation: 'No',
        internal_status: 'Submitted',
        external_status: 'Interview Scheduled',
        feedback_status: 'Positive',
        priority: 'High',
        fe_name: 'Sarah K.',
        skills: ['Dentistry', 'Oral Surgery', 'Teeth Cleaning', 'Root Canal', 'Patient Care', 'Dental X-Rays'],
        notes: 'Experienced general practitioner with 6 years of clinical dentist practice, specialized in preventive dentistry, root canal treatments, and cosmetic oral surgery.',
        resume_text: `PROFESSIONAL RESUME: Dr. Marcus Vance, DDS
TARGET ROLE: General Dentist (6 Years Experience)

SUMMARY:
Licensed General Dentist with 6 years of clinical practice experience providing high-quality oral healthcare to patients of all ages. Specialist in preventive dentistry, root canal therapy, teeth cleaning, oral surgery, dental X-rays, and patient care management.

CLINICAL EXPERTISE & SKILLS:
• Comprehensive Dentistry & Diagnostic Dental X-Rays
• Root Canal Therapy & Endodontics
• Oral Surgery & Tooth Extractions
• Teeth Cleaning & Preventive Periodontics
• Patient Care, Treatment Planning & Local Anesthesia
• Active Dental Licensure & Board Certified`
      }
    })
    console.log(` Created Candidate: ${dentistCandidate.first_name} ${dentistCandidate.last_name} (${dentistCandidate.experience} yrs exp)`)

    console.log(' Dentist job and candidate profile created successfully!')
  } catch (err) {
    console.error(' Creation error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

createDentistData()
