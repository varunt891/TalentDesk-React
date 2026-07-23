import { useState } from 'react'
import { apiRequest } from '../lib/api'

function MarkdownView({ content }) {
  if (!content) return null

  const formatInline = (str) => {
    return str
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1 ↗</a>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
  }

  const lines = content.split('\n')
  const elements = []
  let codeBlockLines = null
  let listItems = []
  let tableRows = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}-${Math.random()}`} className="md-list">
          {listItems.map((li, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(li) }} />
          ))}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      // Filter out alignment divider row like | :--- | :--- |
      const cleanRows = tableRows.filter(row => !row.every(cell => /^[\s:-]+$/.test(cell)))
      if (cleanRows.length > 0) {
        const header = cleanRows[0]
        const body = cleanRows.slice(1)
        elements.push(
          <div key={`table-${elements.length}-${Math.random()}`} className="md-table-wrapper">
            <table className="md-table">
              <thead>
                <tr>
                  {header.map((cell, idx) => (
                    <th key={idx} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      tableRows = []
    }
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()

    // Markdown Table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList()
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim())
      tableRows.push(cells)
      return
    } else {
      flushTable()
    }

    // Code Block
    if (trimmed.startsWith('```')) {
      if (codeBlockLines !== null) {
        const codeText = codeBlockLines.join('\n')
        elements.push(
          <div key={`code-${idx}`} className="md-code-box">
            <div className="md-code-header">
              <span className="md-code-lang">Search String / Output</span>
              <button
                type="button"
                className="md-code-copy-btn"
                onClick={() => navigator.clipboard.writeText(codeText)}
              >
                📋 Copy Text
              </button>
            </div>
            <pre><code>{codeText}</code></pre>
          </div>
        )
        codeBlockLines = null
      } else {
        flushList()
        codeBlockLines = []
      }
      return
    }

    if (codeBlockLines !== null) {
      codeBlockLines.push(line)
      return
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***') {
      flushList()
      elements.push(<hr key={`hr-${idx}`} className="md-hr" />)
      return
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(
        <h3 key={`h3-${idx}`} className="md-h3">
          {trimmed.replace('### ', '')}
        </h3>
      )
      return
    }

    if (trimmed.startsWith('#### ')) {
      flushList()
      elements.push(
        <h4 key={`h4-${idx}`} className="md-h4">
          {trimmed.replace('#### ', '')}
        </h4>
      )
      return
    }

    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        <h2 key={`h2-${idx}`} className="md-h2">
          {trimmed.replace('## ', '')}
        </h2>
      )
      return
    }

    // Bullets
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const cleanLine = trimmed.replace(/^[•*-]\s*/, '')
      listItems.push(cleanLine)
      return
    }

    // Paragraph
    if (trimmed.length > 0) {
      flushList()
      elements.push(
        <p
          key={`p-${idx}`}
          className="md-p"
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }}
        />
      )
    } else {
      flushList()
    }
  })

  flushList()
  flushTable()

  return <div className="markdown-rendered-view">{elements}</div>
}

export default function AICenter() {
  const [activeTool, setActiveTool] = useState('boolean')

  // Tool 1: Boolean Generator
  const [boolInput, setBoolInput] = useState({
    title: 'Frontend React Developer',
    skills: 'React.js, JavaScript, HTML5, CSS3, Tailwind CSS, REST API',
    location: 'Mohali, Punjab',
    experience: '2-4 Years',
    jdText: ''
  })
  const [boolResults, setBoolResults] = useState(null)
  const [boolLoading, setBoolLoading] = useState(false)
  const [boolError, setBoolError] = useState(null)

  // Tool 2: Email Generator
  const [emailForm, setEmailForm] = useState({
    candidateName: 'Alex Rivera',
    currentRole: 'Senior Frontend Engineer',
    targetRole: 'Lead React Architect',
    company: 'TalentDesk Technologies',
    sellingPoints: '$160k - $190k base, 100% Remote flexibility, 4-day work week option, Equity package'
  })
  const [emailResults, setEmailResults] = useState(null)
  const [emailLoading, setEmailLoading] = useState(false)

  // Tool 3: Resume Formatter
  const [resumeText, setResumeText] = useState('')
  const [formatterResults, setFormatterResults] = useState(null)
  const [formatterLoading, setFormatterLoading] = useState(false)

  // Tool 4: JD Analyzer & Questions
  const [jdText, setJdText] = useState('')
  const [jdResults, setJdResults] = useState(null)
  const [jdLoading, setJdLoading] = useState(false)

  // Tool 5: Candidate Matcher
  const [matchJd, setMatchJd] = useState('')
  const [matchCandidate, setMatchCandidate] = useState('')
  const [matchResult, setMatchResult] = useState(null)
  const [matchLoading, setMatchLoading] = useState(false)

  // Tool 6: Market & Salary Copilot
  const [salaryForm, setSalaryForm] = useState({
    role: 'Senior React Developer',
    location: 'Austin, TX / Remote',
    expLevel: '5+ years'
  })
  const [salaryResult, setSalaryResult] = useState(null)
  const [salaryLoading, setSalaryLoading] = useState(false)

  // Tool 7: Freeform Copilot
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copilotResponse, setCopilotResponse] = useState(null)
  const [copilotLoading, setCopilotLoading] = useState(false)

  // Copy Feedback
  const [copiedKey, setCopiedKey] = useState(null)
  const [apiNotice, setApiNotice] = useState(null)

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const callAiApi = async (promptText, toolId) => {
    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: {
          prompt: promptText,
          toolId
        }
      })

      if (data?.text) {
        if (data.grounded) {
          setApiNotice('🌐 Response grounded with live Google Search web intelligence.')
        } else {
          setApiNotice(null)
        }
        return data.text
      }

      throw new Error(data?.error || 'AI service returned an empty response.')
    } catch (err) {
      const message = err.message || 'AI request failed.'
      setApiNotice(`⚠️ AI Notice: ${message}`)
      throw new Error(message, { cause: err })
    }
  }

  // Submit Handlers
  const handleBooleanSubmit = async (e) => {
    e.preventDefault()
    setBoolLoading(true)
    setBoolError(null)
    setBoolResults(null)

    const prompt = `You are a Senior Technical Sourcing Specialist.
STRICT RULE: Construct precision high-conversion Boolean search strings STRICTLY using ONLY:
1. Target Job Title: ${boolInput.title}
2. Must-Have Skills: ${boolInput.skills}
3. Must-Have Job Description Requirements: ${boolInput.jdText}

EXCLUDE all nice-to-haves, soft skills, company overview, benefits, or optional filler text.
Location: ${boolInput.location}
Experience Level: ${boolInput.experience}

Format:
### 1. LinkedIn Recruiter / Sales Navigator Search String
\`\`\`text
(String)
\`\`\`

### 2. Google X-Ray Search String
\`\`\`text
(site:linkedin.com/in/ query)
\`\`\`

### 3. Indeed & Job Board Search String
\`\`\`text
(String)
\`\`\`

### 4. Alternative Search Keywords & Synonyms
- Title Synonyms: ...
- Skill Synonyms: ...
- Location Variations: ...`

    try {
      const res = await callAiApi(prompt, 'boolean')
      setBoolResults(res)
    } catch (err) {
      setBoolError(err.message)
    } finally {
      setBoolLoading(false)
    }
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setEmailLoading(true)
    setEmailResults(null)

    const prompt = `You are an Executive Recruiter. Write personalized candidate outreach templates.
Output ONLY structured Markdown response. DO NOT output internal reasoning notes.

Candidate Name: ${emailForm.candidateName}
Current Role: ${emailForm.currentRole}
Target Role: ${emailForm.targetRole}
Company: ${emailForm.company}
Selling Points: ${emailForm.sellingPoints}

Format:
### LinkedIn InMail (Short & High Conversion)
### Cold Outreach Email
### 3-Day Follow-Up Nudge`

    try {
      const res = await callAiApi(prompt, 'email')
      setEmailResults(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setEmailLoading(false)
    }
  }

  const handleFormatterSubmit = async (e) => {
    e.preventDefault()
    if (!resumeText.trim()) return
    setFormatterLoading(true)
    setFormatterResults(null)

    const prompt = `You are a Professional Corporate Resume Editor. Format this raw resume into a clean, standardized executive candidate summary.

CRITICAL INSTRUCTIONS:
1. Extract the EXACT Candidate Name from the first line or header of the raw resume text (e.g. if the text starts with "John Anderson", write "**Candidate Name:** John Anderson").
2. DO NOT include any emojis or icons anywhere in the output headers or bullet points. Keep it strictly clean, professional, and corporate.

RAW RESUME TEXT:
${resumeText}

Format:
### Standardized Executive Candidate Summary
**Candidate Name:** [Exact Name from Resume]
**Target Position:** ...
**Years of Experience:** ...

#### Executive Summary
#### Core Technical Stack
#### Key Professional Experience
#### Education & Certifications`

    try {
      const res = await callAiApi(prompt, 'formatter')
      setFormatterResults(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setFormatterLoading(false)
    }
  }

  const handleJdSubmit = async (e) => {
    e.preventDefault()
    if (!jdText.trim()) return
    setJdLoading(true)
    setJdResults(null)

    const prompt = `You are a Talent Architect. Extract structured insights from this Job Description.
Output ONLY structured Markdown. DO NOT output internal thinking notes.

JOB DESCRIPTION:
${jdText}

Format:
### Executive Summary
### Must-Have Core Skills
### Nice-to-Have Skills
### Ideal Candidate Persona
### Top 5 Technical Interview Questions`

    try {
      const res = await callAiApi(prompt, 'jd')
      setJdResults(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setJdLoading(false)
    }
  }

  const handleMatchSubmit = async (e) => {
    e.preventDefault()
    if (!matchJd.trim() || !matchCandidate.trim()) return
    setMatchLoading(true)
    setMatchResult(null)

    const prompt = `You are an AI Candidate Evaluator. Compare candidate resume to JD.
Output ONLY structured Markdown.

JD: ${matchJd}
RESUME: ${matchCandidate}

Format:
### Match Rating: [X / 100]
### Key Matching Strengths
### Potential Gaps / Unverified Areas
### Probing Interview Questions`

    try {
      const res = await callAiApi(prompt, 'match')
      setMatchResult(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setMatchLoading(false)
    }
  }

  const handleSalarySubmit = async (e) => {
    e.preventDefault()
    setSalaryLoading(true)
    setSalaryResult(null)

    const prompt = `You are a Global Executive Compensation & Market Intelligence Analyst.

CRITICAL INSTRUCTIONS:
1. Provide accurate, real-world salary benchmarks specifically for the requested location: "${salaryForm.location}".
2. Use the LOCAL CURRENCY of "${salaryForm.location}" (for example INR/Rs for India, GBP for UK, EUR for Europe, CAD for Canada, AUD for Australia, BRL for Brazil, JPY for Japan, AED for UAE, PHP for Philippines).
3. Provide structured Markdown tables for salary benchmarks by seniority level.
4. Output ONLY structured Markdown. DO NOT output internal reasoning or scratchpad notes.

TARGET DETAILS:
- Role Title: ${salaryForm.role}
- Location / Region: ${salaryForm.location}
- Experience Level: ${salaryForm.expLevel}

Format:
### Compensation & Market Intelligence

**Target Role:** ${salaryForm.role}  
**Location:** ${salaryForm.location}  
**Experience Level:** ${salaryForm.expLevel}  

---

#### Salary Benchmarks ([Local Currency Code & Symbol])
| Level / Title | YOE | Base Salary Range | Total Comp Range |
| :--- | :--- | :--- | :--- |

#### Market Demand Trends
- **Demand Index:** (High / Very High / Moderate)
- **Time-to-Hire Average:** (Average days)
- **Key Hiring Drivers:** (Key local market drivers)`

    try {
      const res = await callAiApi(prompt, 'salary')
      setSalaryResult(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setSalaryLoading(false)
    }
  }

  const handleCopilotSubmit = async (e) => {
    e.preventDefault()
    if (!copilotPrompt.trim()) return
    setCopilotLoading(true)
    setCopilotResponse(null)

    const prompt = `You are TalentDesk AI Recruiter Copilot. Provide strategic, actionable talent intelligence.
Output ONLY structured Markdown response.

PROMPT: ${copilotPrompt}`

    try {
      const res = await callAiApi(prompt, 'copilot')
      setCopilotResponse(res)
    } catch (err) {
      alert(err.message)
    } finally {
      setCopilotLoading(false)
    }
  }

  const tools = [
    { id: 'boolean', icon: '🔍', title: 'AI Boolean Search', sub: 'Generate LinkedIn, X-Ray & Job Board search strings' },
    { id: 'email', icon: '✉️', title: 'AI Outreach Email Generator', sub: 'Draft high-converting InMails & cold emails' },
    { id: 'formatter', icon: '📄', title: 'AI Resume Formatter', sub: 'Standardize & polish candidate resumes' },
    { id: 'jd', icon: '📋', title: 'AI JD Analyzer & Interview Questions', sub: 'Extract core skills & candidate persona' },
    { id: 'match', icon: '🎯', title: 'AI Candidate Match Evaluator', sub: 'Score candidate fit against job requirements' },
    { id: 'salary', icon: '💰', title: 'AI Salary & Market Intelligence', sub: 'Get compensation ranges & sourcing insights' },
    { id: 'copilot', icon: '⚡', title: 'Freeform AI Recruiter Copilot', sub: 'Ask any custom sourcing query' }
  ]

  return (
    <div className="ai-center-page">
      {/* Header Banner */}
      <header className="ai-center-header">
        <div className="ai-header-content">
          <div className="ai-badge">
            <span className="ai-sparkle">✨</span>
            <span>TALENTDESK RECRUITER AI SUITE</span>
          </div>
          <h1>Recruiter AI Innovation Center</h1>
          <p>7 specialized AI intelligence tools for sourcing, resume formatting, email outreach, candidate evaluation, and salary benchmarks.</p>
        </div>

        <div className="ai-key-card">
          <div className="ai-key-status">
            <span className="key-indicator active" />
            <span className="key-label">Server AI Active</span>
          </div>
          <p className="ai-key-note">Live web search grounding enabled</p>
        </div>
      </header>

      {apiNotice && (
        <div className="ai-notice-banner">
          <span>{apiNotice}</span>
          <button type="button" onClick={() => setApiNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* Grid Tool Selector Tiles */}
      <div className="ai-tools-grid">
        {tools.map(t => (
          <button
            key={t.id}
            type="button"
            className={`ai-tool-tile ${activeTool === t.id ? 'active' : ''}`}
            onClick={() => setActiveTool(t.id)}
          >
            <span className="tile-icon">{t.icon}</span>
            <div className="tile-info">
              <strong>{t.title}</strong>
              <small>{t.sub}</small>
            </div>
          </button>
        ))}
      </div>

      {/* Tool 1: Boolean Search */}
      {activeTool === 'boolean' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>🔍 AI Boolean Search Generator</h3>
            <p className="ai-card-sub">Generate precision LinkedIn Recruiter, Google X-Ray, and Job Board search queries.</p>

            <form onSubmit={handleBooleanSubmit}>
              <div className="ai-field-grid">
                <div className="ai-field">
                  <label>Target Job Title</label>
                  <input
                    type="text"
                    value={boolInput.title}
                    onChange={e => setBoolInput({ ...boolInput, title: e.target.value })}
                    required
                  />
                </div>
                <div className="ai-field">
                  <label>Must-Have Skills</label>
                  <input
                    type="text"
                    value={boolInput.skills}
                    onChange={e => setBoolInput({ ...boolInput, skills: e.target.value })}
                  />
                </div>
                <div className="ai-field">
                  <label>Location / Remote</label>
                  <input
                    type="text"
                    value={boolInput.location}
                    onChange={e => setBoolInput({ ...boolInput, location: e.target.value })}
                  />
                </div>
                <div className="ai-field">
                  <label>Experience Level</label>
                  <input
                    type="text"
                    value={boolInput.experience}
                    onChange={e => setBoolInput({ ...boolInput, experience: e.target.value })}
                  />
                </div>
              </div>

              <div className="ai-field">
                <label>Must-Have Job Description Requirements</label>
                <textarea
                  rows="4"
                  placeholder="Paste core must-have requirements from Job Description..."
                  value={boolInput.jdText}
                  onChange={e => setBoolInput({ ...boolInput, jdText: e.target.value })}
                />
              </div>

              <button type="submit" className="ai-submit-btn" disabled={boolLoading}>
                {boolLoading ? <span className="ai-spinner" /> : '✨ Generate Boolean Strings'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Generated Boolean Search Strings</h4>
              {boolResults && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(boolResults, 'bool')}>
                  {copiedKey === 'bool' ? '✓ Copied!' : '📋 Copy Results'}
                </button>
              )}
            </div>

            {boolError && <div className="ai-error-box">⚠️ {boolError}</div>}
            {!boolResults && !boolLoading && !boolError && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">🔍</div>
                <h5>Ready to Generate</h5>
                <p>Click <strong>Generate Boolean Strings</strong> to produce copy-paste search strings.</p>
              </div>
            )}
            {boolLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>AI is synthesizing search queries...</p>
              </div>
            )}
            {boolResults && (
              <div className="ai-output-content">
                <MarkdownView content={boolResults} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 2: Outreach Email Generator */}
      {activeTool === 'email' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>✉️ AI Cold Outreach & Email Generator</h3>
            <p className="ai-card-sub">Draft personalized InMails, cold emails, and follow-up nudges tailored to candidates.</p>

            <form onSubmit={handleEmailSubmit}>
              <div className="ai-field-grid">
                <div className="ai-field">
                  <label>Candidate Name</label>
                  <input
                    type="text"
                    value={emailForm.candidateName}
                    onChange={e => setEmailForm({ ...emailForm, candidateName: e.target.value })}
                    required
                  />
                </div>
                <div className="ai-field">
                  <label>Candidate Current Role</label>
                  <input
                    type="text"
                    value={emailForm.currentRole}
                    onChange={e => setEmailForm({ ...emailForm, currentRole: e.target.value })}
                  />
                </div>
                <div className="ai-field">
                  <label>Target Position</label>
                  <input
                    type="text"
                    value={emailForm.targetRole}
                    onChange={e => setEmailForm({ ...emailForm, targetRole: e.target.value })}
                    required
                  />
                </div>
                <div className="ai-field">
                  <label>Company / Client Name</label>
                  <input
                    type="text"
                    value={emailForm.company}
                    onChange={e => setEmailForm({ ...emailForm, company: e.target.value })}
                  />
                </div>
              </div>

              <div className="ai-field">
                <label>Key Selling Points / Perks</label>
                <textarea
                  rows="3"
                  value={emailForm.sellingPoints}
                  onChange={e => setEmailForm({ ...emailForm, sellingPoints: e.target.value })}
                />
              </div>

              <button type="submit" className="ai-submit-btn" disabled={emailLoading}>
                {emailLoading ? <span className="ai-spinner" /> : '✉️ Generate Outreach Emails'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Generated Outreach Templates</h4>
              {emailResults && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(emailResults, 'email')}>
                  {copiedKey === 'email' ? '✓ Copied!' : '📋 Copy Templates'}
                </button>
              )}
            </div>

            {!emailResults && !emailLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">✉️</div>
                <h5>Outreach Generator Ready</h5>
                <p>Fill in candidate details to draft high-converting InMails and cold emails.</p>
              </div>
            )}
            {emailLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Drafting recruitment emails...</p>
              </div>
            )}
            {emailResults && (
              <div className="ai-output-content">
                <MarkdownView content={emailResults} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 3: Resume Formatter */}
      {activeTool === 'formatter' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>📄 AI Resume Formatter & Standardizer</h3>
            <p className="ai-card-sub">Paste messy resume text to produce a clean, standardized executive candidate summary.</p>

            <form onSubmit={handleFormatterSubmit}>
              <div className="ai-field">
                <label>Paste Raw Candidate Resume Text</label>
                <textarea
                  rows="12"
                  placeholder="Paste unformatted resume text here..."
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="ai-submit-btn" disabled={formatterLoading}>
                {formatterLoading ? <span className="ai-spinner" /> : '📄 Format Candidate Resume'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Standardized Candidate Executive Profile</h4>
              {formatterResults && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(formatterResults, 'formatter')}>
                  {copiedKey === 'formatter' ? '✓ Copied!' : '📋 Copy Formatted Summary'}
                </button>
              )}
            </div>

            {!formatterResults && !formatterLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">📄</div>
                <h5>Resume Formatter Ready</h5>
                <p>Paste raw candidate text to generate a standardized executive summary.</p>
              </div>
            )}
            {formatterLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Standardizing resume structure & tech stack...</p>
              </div>
            )}
            {formatterResults && (
              <div className="ai-output-content">
                <MarkdownView content={formatterResults} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 4: JD Analyzer */}
      {activeTool === 'jd' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>📋 AI JD Analyzer & Interview Questions</h3>
            <p className="ai-card-sub">Extract core requirements, candidate persona, and 5 technical interview questions.</p>

            <form onSubmit={handleJdSubmit}>
              <div className="ai-field">
                <label>Job Description Text</label>
                <textarea
                  rows="12"
                  placeholder="Paste Job Description..."
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="ai-submit-btn" disabled={jdLoading}>
                {jdLoading ? <span className="ai-spinner" /> : '📋 Analyze JD & Extract Questions'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Structured JD Insights</h4>
              {jdResults && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(jdResults, 'jd')}>
                  {copiedKey === 'jd' ? '✓ Copied!' : '📋 Copy Analysis'}
                </button>
              )}
            </div>

            {!jdResults && !jdLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">📋</div>
                <h5>JD Analyzer Ready</h5>
                <p>Paste a job description to extract core skills and interview questions.</p>
              </div>
            )}
            {jdLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Analyzing Job Description requirements...</p>
              </div>
            )}
            {jdResults && (
              <div className="ai-output-content">
                <MarkdownView content={jdResults} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 5: Candidate Matcher */}
      {activeTool === 'match' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>🎯 AI Candidate-to-Job Fit Evaluator</h3>
            <p className="ai-card-sub">Compare candidate profile against job criteria to calculate match rating and gaps.</p>

            <form onSubmit={handleMatchSubmit}>
              <div className="ai-field">
                <label>Job Description Criteria</label>
                <textarea
                  rows="6"
                  placeholder="Paste JD requirements..."
                  value={matchJd}
                  onChange={e => setMatchJd(e.target.value)}
                  required
                />
              </div>
              <div className="ai-field">
                <label>Candidate Resume / Summary</label>
                <textarea
                  rows="6"
                  placeholder="Paste Candidate profile..."
                  value={matchCandidate}
                  onChange={e => setMatchCandidate(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="ai-submit-btn" disabled={matchLoading}>
                {matchLoading ? <span className="ai-spinner" /> : '🎯 Score Match & Gaps'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Candidate Match Scorecard</h4>
              {matchResult && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(matchResult, 'match')}>
                  {copiedKey === 'match' ? '✓ Copied!' : '📋 Copy Scorecard'}
                </button>
              )}
            </div>

            {!matchResult && !matchLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">🎯</div>
                <h5>Candidate Evaluator Ready</h5>
                <p>Provide Job Description and Candidate profile to generate match rating.</p>
              </div>
            )}
            {matchLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Scoring candidate alignment...</p>
              </div>
            )}
            {matchResult && (
              <div className="ai-output-content">
                <MarkdownView content={matchResult} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 6: Salary Intelligence */}
      {activeTool === 'salary' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>💰 AI Salary & Market Intelligence</h3>
            <p className="ai-card-sub">Get real-time market compensation benchmarks, demand indices, and hiring drivers.</p>

            <form onSubmit={handleSalarySubmit}>
              <div className="ai-field">
                <label>Target Role Title</label>
                <input
                  type="text"
                  value={salaryForm.role}
                  onChange={e => setSalaryForm({ ...salaryForm, role: e.target.value })}
                  required
                />
              </div>
              <div className="ai-field">
                <label>Location / Region</label>
                <input
                  type="text"
                  value={salaryForm.location}
                  onChange={e => setSalaryForm({ ...salaryForm, location: e.target.value })}
                  required
                />
              </div>
              <div className="ai-field">
                <label>Experience Level</label>
                <input
                  type="text"
                  value={salaryForm.expLevel}
                  onChange={e => setSalaryForm({ ...salaryForm, expLevel: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="ai-submit-btn" disabled={salaryLoading}>
                {salaryLoading ? <span className="ai-spinner" /> : '💰 Fetch Salary Benchmarks'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Compensation Intelligence Report</h4>
              {salaryResult && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(salaryResult, 'salary')}>
                  {copiedKey === 'salary' ? '✓ Copied!' : '📋 Copy Report'}
                </button>
              )}
            </div>

            {!salaryResult && !salaryLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">💰</div>
                <h5>Salary Intelligence Ready</h5>
                <p>Enter role and location to estimate market compensation ranges.</p>
              </div>
            )}
            {salaryLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Analyzing live market compensation data...</p>
              </div>
            )}
            {salaryResult && (
              <div className="ai-output-content">
                <MarkdownView content={salaryResult} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 7: Freeform Copilot */}
      {activeTool === 'copilot' && (
        <div className="ai-tool-layout">
          <div className="ai-form-card">
            <h3>⚡ Freeform Recruiter AI Copilot</h3>
            <p className="ai-card-sub">Ask TalentDesk AI anything related to recruiting, sourcing strategies, or candidate feedback.</p>

            <form onSubmit={handleCopilotSubmit}>
              <div className="ai-field">
                <label>Recruiting Query or Custom Prompt</label>
                <textarea
                  rows="8"
                  placeholder="e.g. Write a phone screening rubric for a Senior DevOps Engineer..."
                  value={copilotPrompt}
                  onChange={e => setCopilotPrompt(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="ai-submit-btn" disabled={copilotLoading}>
                {copilotLoading ? <span className="ai-spinner" /> : '⚡ Ask AI Copilot'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>AI Copilot Output</h4>
              {copilotResponse && (
                <button type="button" className="copy-btn" onClick={() => handleCopy(copilotResponse, 'copilot')}>
                  {copiedKey === 'copilot' ? '✓ Copied!' : '📋 Copy Response'}
                </button>
              )}
            </div>

            {!copilotResponse && !copilotLoading && (
              <div className="ai-placeholder-box">
                <div className="placeholder-icon">⚡</div>
                <h5>AI Copilot Ready</h5>
                <p>Type any recruiting instruction to generate custom AI responses.</p>
              </div>
            )}
            {copilotLoading && (
              <div className="ai-loading-box">
                <div className="loading-pulse" />
                <p>Processing query with AI Assistant...</p>
              </div>
            )}
            {copilotResponse && (
              <div className="ai-output-content">
                <MarkdownView content={copilotResponse} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
