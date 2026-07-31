// AI Center's category launcher registry. Every category maps onto the
// shared AI framework from Phase 5.1 — either the generic Action Framework
// (mode: 'action', reusing an id from prompts.js's AI_ACTIONS) or the
// workspace-aware Copilot chat (mode: 'chat') for categories that need live
// pipeline/candidate data rather than pasted content. No new prompt logic
// is introduced here — this is purely a curated launcher UI.
export const AI_CATEGORIES = [
  { id: 'resume_analysis', label: 'Resume Analysis', icon: 'eye', description: 'Analyze a resume for strengths, gaps, and fit signals.', mode: 'action', actionId: 'analyze', placeholder: 'Paste the resume text...' },
  { id: 'candidate_matching', label: 'Candidate Matching', icon: 'compare', description: "Compare a candidate against a job's requirements.", mode: 'action', actionId: 'compare', placeholder: 'Paste the candidate profile and job requirements...' },
  { id: 'jd_generator', label: 'Job Description Generator', icon: 'jobs', description: 'Draft a new job description from role details.', mode: 'action', actionId: 'draft', placeholder: 'Describe the role, requirements, and seniority level...' },
  { id: 'candidate_summary', label: 'Candidate Summaries', icon: 'summarize', description: 'Summarize a candidate profile or resume.', mode: 'action', actionId: 'summarize', placeholder: 'Paste the candidate profile or resume...' },
  { id: 'boolean_search', label: 'Boolean Search Builder', icon: 'search', description: 'Build a Boolean search string from role requirements.', mode: 'action', actionId: 'draft', placeholder: 'List the target title and must-have skills...' },
  { id: 'interview_questions', label: 'Interview Questions', icon: 'checkCircle', description: 'Generate targeted interview questions for a role.', mode: 'action', actionId: 'draft', placeholder: 'Describe the role and what to probe for...' },
  { id: 'email_writer', label: 'Email Writer', icon: 'mail', description: 'Draft recruiting outreach or nudge emails.', mode: 'action', actionId: 'draft', placeholder: 'Describe who this email is for and the goal...' },
  { id: 'followup_generator', label: 'Follow-up Generator', icon: 'followups', description: 'Draft a candidate or client follow-up message.', mode: 'action', actionId: 'draft', placeholder: 'Describe the situation needing a follow-up...' },
  { id: 'pipeline_analysis', label: 'Pipeline Analysis', icon: 'pipeline', description: 'Ask Copilot to analyze your live pipeline health.', mode: 'chat', examplePrompt: 'Analyze my current pipeline health and flag any bottlenecks.' },
  { id: 'communication_assistant', label: 'Communication Assistant', icon: 'callbacks', description: "Plan today's candidate outreach with Copilot.", mode: 'chat', examplePrompt: "Help me plan today's candidate outreach and follow-ups." },
  { id: 'skill_extraction', label: 'Resume Skill Extraction', icon: 'extract', description: 'Extract a structured skill list from a resume.', mode: 'action', actionId: 'extract', placeholder: 'Paste the resume text...', actionContext: 'skills' },
  { id: 'candidate_comparison', label: 'Candidate Comparison', icon: 'users', description: 'Compare two or more candidates side by side.', mode: 'action', actionId: 'compare', placeholder: 'Paste the candidate profiles to compare...' },
]

export function getCategory(id) {
  return AI_CATEGORIES.find(c => c.id === id) || AI_CATEGORIES[0]
}
