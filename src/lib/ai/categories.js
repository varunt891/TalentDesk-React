// Two shapes a "compare" can take — picked at runtime via a toggle in
// ActionsPanel rather than forcing the user into two near-duplicate
// categories that both just mean "compare two things." ActionsPanel applies
// these automatically whenever the 'compare' action is active, regardless
// of which category (or no category at all) triggered it — see its
// COMPARE_DUAL_MODES/COMPARISON_ACTIONS usage — so this category doesn't
// need to (and shouldn't) pass its own copy.
export const COMPARE_DUAL_MODES = [
  {
    id: 'resume_vs_jd', label: 'Resume vs Job Description',
    fieldA: { label: 'Resume', placeholder: 'Paste the candidate resume...' },
    fieldB: { label: 'Job Description', placeholder: 'Paste the job description...' },
  },
  {
    id: 'candidate_vs_candidate', label: 'Candidate vs Candidate',
    fieldA: { label: 'Candidate A', placeholder: 'Paste the first candidate resume/profile...' },
    fieldB: { label: 'Candidate B', placeholder: 'Paste the second candidate resume/profile...' },
  },
]

// Actions that make sense when the input is two separate pieces of content
// being weighed against each other. Rewrite/Improve/Draft/Translate/Extract/
// Summarize don't have a coherent meaning applied to "Resume + Job
// Description" as a pair, so dual-input mode restricts the pill row to just
// this set instead of offering all 11 generic actions.
export const COMPARISON_ACTIONS = ['compare', 'score', 'analyze', 'explain', 'recommend']

// AI Center's category launcher registry. Every category maps onto the
// shared AI framework from Phase 5.1 — either the generic Action Framework
// (mode: 'action', reusing an id from prompts.js's AI_ACTIONS) or the
// workspace-aware Copilot chat (mode: 'chat') for categories that need live
// pipeline/candidate data rather than pasted content. No new prompt logic
// is introduced here — this is purely a curated launcher UI.
export const AI_CATEGORIES = [
  { id: 'resume_analysis', label: 'Resume Analysis', icon: 'eye', description: 'Analyze a resume for strengths, gaps, and fit signals.', mode: 'action', actionId: 'analyze', placeholder: 'Paste the resume text...' },
  {
    id: 'jd_generator', label: 'Job Description Generator', icon: 'jobs', description: 'Draft a new job description from role details.', mode: 'action', actionId: 'draft',
    placeholder: 'Describe the role, requirements, and seniority level...',
    actionContext: 'Generate a complete, structured job description document — NOT an email or message, and do not address it to a candidate. Include sections for Job Title, Location & Work Type, Role Overview, Key Responsibilities, Required Qualifications, Preferred Qualifications, and Compensation.',
  },
  { id: 'candidate_summary', label: 'Candidate Summaries', icon: 'summarize', description: 'Summarize a candidate profile or resume.', mode: 'action', actionId: 'summarize', placeholder: 'Paste the candidate profile or resume...' },
  {
    id: 'boolean_search', label: 'Boolean Search Builder', icon: 'search', description: 'Build a Boolean search string from role requirements.', mode: 'action', actionId: 'draft',
    placeholder: 'List the target title and must-have skills...',
    actionContext: 'Generate ONLY a Boolean search string (using AND/OR/NOT and parentheses) for sourcing on LinkedIn Recruiter or a resume database — NOT an email, prose, or a job description. Return the search string plus a one-line explanation of the logic.',
  },
  {
    id: 'interview_questions', label: 'Interview Questions', icon: 'checkCircle', description: 'Generate targeted interview questions for a role.', mode: 'action', actionId: 'draft',
    placeholder: 'Describe the role and what to probe for...',
    actionContext: 'Generate a numbered list of targeted interview questions for this role — NOT an email or a job description. Group them under headings such as Technical, Behavioral, and Experience where useful.',
  },
  {
    id: 'email_writer', label: 'Email Writer', icon: 'mail', description: 'Draft recruiting outreach or nudge emails.', mode: 'action', actionId: 'draft',
    placeholder: 'Describe who this email is for and the goal...',
    actionContext: 'Draft a complete outreach email, including a subject line and body, addressed to the candidate or client described.',
  },
  {
    id: 'followup_generator', label: 'Follow-up Generator', icon: 'followups', description: 'Draft a candidate or client follow-up message.', mode: 'action', actionId: 'draft',
    placeholder: 'Describe the situation needing a follow-up...',
    actionContext: 'Draft a short follow-up email or message for this specific situation, addressed appropriately to the candidate or client involved.',
  },
  { id: 'pipeline_analysis', label: 'Pipeline Analysis', icon: 'pipeline', description: 'Ask Copilot to analyze your live pipeline health.', mode: 'chat', examplePrompt: 'Analyze my current pipeline health and flag any bottlenecks.' },
  { id: 'communication_assistant', label: 'Communication Assistant', icon: 'callbacks', description: "Plan today's candidate outreach with Copilot.", mode: 'chat', examplePrompt: "Help me plan today's candidate outreach and follow-ups." },
  { id: 'skill_extraction', label: 'Resume Skill Extraction', icon: 'extract', description: 'Extract a structured skill list from a resume.', mode: 'action', actionId: 'extract', placeholder: 'Paste the resume text...', actionContext: 'skills' },
  { id: 'candidate_comparison', label: 'Compare Candidates', icon: 'compare', description: 'Compare a resume against a job description, or two candidates against each other.', mode: 'action', actionId: 'compare' },
  { id: 'market_salary_analysis', label: 'Market Salary & Demand', icon: 'trendUp', description: 'Yearly & hourly salary benchmarks and job demand outlook by experience level.', mode: 'salary' },
]

export function getCategory(id) {
  return AI_CATEGORIES.find(c => c.id === id) || AI_CATEGORIES[0]
}
