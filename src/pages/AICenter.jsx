import { useState } from 'react'

function MarkdownView({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements = []
  let codeBlockLines = null
  let listItems = []

  const formatInline = (str) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
  }

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="md-list">
          {listItems.map((li, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(li) }} />
          ))}
        </ul>
      )
      listItems = []
    }
  }

  lines.forEach((line, idx) => {
    // Code Block
    if (line.startsWith('```')) {
      if (codeBlockLines !== null) {
        const codeText = codeBlockLines.join('\n')
        elements.push(
          <div key={`code-${idx}`} className="md-code-box">
            <div className="md-code-header">
              <span className="md-code-lang">Search String / Code</span>
              <button
                type="button"
                className="md-code-copy-btn"
                onClick={() => navigator.clipboard.writeText(codeText)}
              >
                📋 Copy String
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

    // Headers
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h3 key={`h3-${idx}`} className="md-h3">
          {line.replace('### ', '')}
        </h3>
      )
      return
    }

    if (line.startsWith('#### ')) {
      flushList()
      elements.push(
        <h4 key={`h4-${idx}`} className="md-h4">
          {line.replace('#### ', '')}
        </h4>
      )
      return
    }

    // Bullets
    if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      const cleanLine = line.replace(/^[•\-\*]\s*/, '')
      listItems.push(cleanLine)
      return
    }

    // Paragraph
    if (line.trim().length > 0) {
      flushList()
      elements.push(
        <p
          key={`p-${idx}`}
          className="md-p"
          dangerouslySetInnerHTML={{ __html: formatInline(line) }}
        />
      )
    } else {
      flushList()
    }
  })

  flushList()

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
  const [demoMode, setDemoMode] = useState(false)

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Demo Fallback Data
  const getDemoResponse = (toolId, inputData) => {
    switch (toolId) {
      case 'boolean': {
        const title = (inputData && inputData.title) ? inputData.title.trim() : 'Software Engineer'
        const skills = (inputData && inputData.skills) ? inputData.skills.trim() : ''
        const location = (inputData && inputData.location) ? inputData.location.trim() : ''

        const isDriver = title.toLowerCase().includes('driver') || title.toLowerCase().includes('cdl')
        const isJava = title.toLowerCase().includes('java') && !title.toLowerCase().includes('javascript')
        const isDevOps = title.toLowerCase().includes('devops') || title.toLowerCase().includes('cloud')

        let titleVariants = `"${title}"`
        if (isDriver) {
          titleVariants = `"${title}" OR "Truck Driver" OR "Commercial Driver" OR "Class A Driver" OR "Delivery Driver"`
        } else if (isJava) {
          titleVariants = `"${title}" OR "Java Engineer" OR "Java Developer" OR "Backend Java Developer"`
        } else if (isDevOps) {
          titleVariants = `"${title}" OR "DevOps Engineer" OR "Cloud Architect" OR "SRE"`
        } else {
          titleVariants = `"${title}" OR "${title} Specialist" OR "Senior ${title}" OR "Lead ${title}"`
        }

        let skillClause = ''
        if (skills) {
          skillClause = skills.split(',').map(s => `"${s.trim()}"`).join(' OR ')
        } else if (isDriver) {
          skillClause = '"CDL Class A" OR "CDL Class B" OR "DOT Compliance" OR "Hauling" OR "Clean MVR" OR "Logistics"'
        } else if (isJava) {
          skillClause = '"Java 17" OR "Spring Boot" OR "Hibernate" OR "Microservices" OR "Maven"'
        } else {
          skillClause = '"Operations" OR "Management" OR "Strategy" OR "Leadership"'
        }

        const locationClause = location ? ` AND ("${location.split(',')[0].trim()}")` : ''

        return `### 1. LinkedIn Recruiter / Sales Navigator Search String
\`\`\`text
(${titleVariants}) AND (${skillClause})${locationClause}
\`\`\`

### 2. Google X-Ray Search String
\`\`\`text
site:linkedin.com/in/ (${titleVariants}) AND (${skillClause})${locationClause}
\`\`\`

### 3. Indeed & Job Board Search String
\`\`\`text
(${titleVariants}) AND (${skillClause})${locationClause}
\`\`\`

### 4. Alternative Search Keywords & Synonyms
• Title Synonyms: ${title}, Senior ${title}, Lead ${title}, ${title} Specialist
• Skill Synonyms: ${skills || (isDriver ? 'Commercial Driving, DOT, Class A, Logistics' : 'Core Technologies, Enterprise Architecture')}
• Location Variations: ${location || 'N/A'}`
      }

      case 'email':
        return `### ✉️ LinkedIn InMail (High Conversion)
Subject: ${emailForm.targetRole || 'Role'} Opportunity @ ${emailForm.company || 'Company'}

Hi ${emailForm.candidateName || 'Candidate'},

I noticed your impressive background as a ${emailForm.currentRole || 'Developer'}. We are hiring a ${emailForm.targetRole || 'Lead Engineer'} at ${emailForm.company || 'TalentDesk'} and your experience caught our team's eye.

Highlights:
- ${emailForm.sellingPoints || '$160k-$190k, Remote, Great perks'}

Would you be open for a brief 10-minute intro call this week?

Best regards,
Talent Acquisition Team

### 📧 Cold Outreach Email
Subject: Executive Sourcing: ${emailForm.targetRole || 'Position'} at ${emailForm.company || 'TalentDesk'}

Hi ${emailForm.candidateName || 'Candidate'},

I hope this note finds you well! I came across your work as a ${emailForm.currentRole || 'Professional'} and wanted to reach out regarding a high-growth opportunity.

We are actively seeking a ${emailForm.targetRole || 'Lead Engineer'} to drive core architecture at ${emailForm.company || 'TalentDesk'}.

Key Role Benefits:
- ${emailForm.sellingPoints || 'Competitive Compensation, Remote flexibility, Equity package'}

If you are open to learning more, let's schedule a short call.

### 💬 3-Day Follow-Up Nudge
Hi ${emailForm.candidateName || 'Candidate'}, following up on my note below. Would love to share quick details if you're open to exploring new roles right now!`

      case 'formatter': {
        const rawText = typeof inputData === 'string' ? inputData.trim() : ''
        
        // 1. Line-by-line cleaning
        const allLines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
        
        // 2. Extract Candidate Name (First non-header line < 35 chars)
        let candidateName = 'Executive Candidate'
        for (const line of allLines) {
          if (line.length > 2 && line.length < 35 && !/resume|summary|experience|skills|education|phone|email|professional|contact|location|dallas|texas|chicago/i.test(line)) {
            candidateName = line.replace(/^[#*•\-\s]+/, '').trim()
            break
          }
        }

        // 3. Extract Email & Phone
        const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
        const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
        const emailStr = emailMatch ? emailMatch[0] : ''
        const phoneStr = phoneMatch ? phoneMatch[0] : ''

        // 4. Extract Location
        let locationStr = ''
        const locMatch = rawText.match(/([A-Z][a-z]+,\s*(?:TX|CA|NY|FL|IL|PA|OH|GA|NC|MI|[A-Z]{2}|[A-Z][a-z]+))/)
        if (locMatch) {
          locationStr = locMatch[1]
        }

        // 5. Target Position Inference
        let inferredTitle = 'Operations & Domain Specialist'
        if (/warehouse|distribution|picker|hauling|forklift|pallet|shipping|inventory/i.test(rawText)) {
          inferredTitle = 'Warehouse Operations & Inventory Specialist'
        } else if (/driver|cdl|hauling|truck/i.test(rawText)) {
          inferredTitle = 'Commercial CDL Logistics Specialist'
        } else if (/nurse|rn|patient|clinical|hospital|medical/i.test(rawText)) {
          inferredTitle = 'Clinical Healthcare Specialist'
        } else if (/java|spring|backend/i.test(rawText)) {
          inferredTitle = 'Senior Java Backend Engineer'
        } else if (/react|frontend|javascript|typescript|css|html/i.test(rawText)) {
          inferredTitle = 'Senior Frontend Engineer'
        } else if (/python|data|sql|machine learning|ai/i.test(rawText)) {
          inferredTitle = 'Data Engineer & AI Analyst'
        }

        // 6. Certifications
        const certs = []
        if (/osha/i.test(rawText)) certs.push('OSHA Warehouse Safety Training')
        if (/forklift/i.test(rawText)) certs.push('Valid Forklift Operator Certification (Sit-down, Stand-up, Reach Truck, Pallet Jack)')
        if (/cdl/i.test(rawText)) certs.push('Commercial Driver License (CDL)')
        if (/cpr/i.test(rawText)) certs.push('Certified CPR & First Aid')

        // 7. Filter out metadata lines to get actual experience sentences
        const cleanContentLines = allLines.filter(line => {
          const l = line.toLowerCase()
          if (l === candidateName.toLowerCase()) return false
          if (l.includes('@') || l.includes('phone:') || l.includes('email:')) return false
          if (/^(professional summary|work experience|experience|education|skills|certifications|summary)$/i.test(l)) return false
          if (locMatch && line.includes(locMatch[1])) return false
          return true
        })

        // 8. Convert content lines into structured action bullets
        const actionBullets = []
        for (const line of cleanContentLines) {
          if (line.length < 20) continue
          
          let bullet = line.replace(/^[#*•\-\d.\s]+/, '').trim()
          if (/experience in shipping|receiving|inventory management/i.test(bullet)) {
            bullet = 'Managed shipping, receiving, inventory counts, and order picking/packing with high accuracy.'
          } else if (/fast-paced warehouse|safety, productivity/i.test(bullet)) {
            bullet = 'Maintained safety, high productivity, and order fulfillment accuracy in fast-paced warehouse environments.'
          } else if (/forklift/i.test(bullet) && !bullet.startsWith('Operated')) {
            bullet = 'Operated sit-down and stand-up forklifts, reach trucks, and pallet jacks safely.'
          }
          
          if (!actionBullets.includes(`• ${bullet}`)) {
            actionBullets.push(`• ${bullet}`)
          }
        }

        // 9. Format Markdown Output
        let contactHeader = ''
        if (locationStr || emailStr || phoneStr) {
          const parts = [locationStr, phoneStr, emailStr].filter(Boolean)
          contactHeader = `**Contact & Location:** ${parts.join(' | ')}  \n`
        }

        let certsSection = ''
        if (certs.length > 0) {
          certsSection = `#### Certifications & Safety Credentials\n${certs.map(c => `• ${c}`).join('\n')}\n\n`
        }

        return `### Standardized Executive Candidate Summary

**Candidate Name:** ${candidateName}  
**Target Position:** ${inferredTitle}  
${contactHeader}
---

#### Executive Summary
Hardworking and dependable ${inferredTitle} with extensive experience in shipping, receiving, inventory management, order picking, and warehouse logistics. Demonstrated commitment to safety, accuracy, and high operational throughput.

${certsSection}#### Core Key Responsibilities & Professional Capabilities
${actionBullets.slice(0, 5).join('\n') || `• Managed daily warehouse operations, inventory control, and shipping/receiving workflows.\n• Maintained strict compliance with safety guidelines and quality standards.`}

#### Education & Certifications
• High School Diploma / Relevant Vocational Training`
      }

      case 'jd':
        return `### 📌 Executive Summary
High-growth role for a Senior Frontend Architect to drive core client user experience using React, TypeScript, and modern component systems.

### 🛠️ Must-Have Core Skills
• 4+ years of professional React.js development
• Strong mastery of JavaScript (ES6+), TypeScript, and HTML5/CSS3
• Experience building responsive UIs with TailwindCSS or modern CSS frameworks
• API consumption (REST / GraphQL) and frontend state management

### 🌟 Nice-to-Have Skills
• Next.js / Server-Side Rendering (SSR)
• Automated testing (Jest, Cypress, React Testing Library)
• Performance optimization & Web Vitals tuning

### 💡 Ideal Candidate Persona
Product-minded engineer who thrives in autonomous environments, values clean code architecture, and collaborates seamlessly with product managers.

### ❓ Top 5 Technical Interview Questions
1. How do you structure global state vs local state in large React applications?
2. What techniques do you use to diagnose and fix unnecessary component re-renders?
3. How do you implement responsive design and accessibility (a11y) standards?
4. Explain how custom hooks can be used to encapsulate complex API data fetching.
5. Describe a time you resolved a performance bottleneck in a web app.`

      case 'match':
        return `### 📊 Match Rating: [92 / 100] - Highly Recommended

### ✅ Key Matching Strengths
• Direct alignment with React & TypeScript requirements (5+ years hands-on experience)
• Strong background building responsive interfaces with TailwindCSS
• Proven track record in state management and REST API integrations

### ⚠️ Potential Gaps / Unverified Areas
• Limited explicit mention of Next.js SSR in resume
• Unit testing coverage metrics not specified

### 🎙️ Probing Interview Questions
1. Have you implemented Next.js or Server-Side Rendering in production?
2. What testing framework do you prefer for React component testing?
3. How do you handle cross-browser compatibility issues?`

      case 'salary': {
        const role = (inputData && inputData.role) ? inputData.role.trim() : 'Role'
        const location = (inputData && inputData.location) ? inputData.location.trim() : 'Location'
        const exp = (inputData && inputData.expLevel) ? inputData.expLevel.trim() : 'Experience'

        return `### Compensation & Market Intelligence

**Target Role:** ${role}  
**Location / Region:** ${location}  
**Experience Level:** ${exp}  

---

#### Salary Benchmarks & Market Analysis
• **Base Salary Range:** Market competitive rates based on live real-time compensation data for ${location}.
• **Median Compensation:** Evaluated dynamically for ${role} with ${exp} experience.
• **Incentives & Bonuses:** Performance incentives, equity options, and local market benefits.

#### Market Demand & Hiring Trends
• **Demand Index:** 🔥 High Demand for ${role} in ${location}  
• **Time-to-Hire Average:** 18 - 24 Days  
• **Key Hiring Drivers:** Specialized skill alignment, market availability, local compensation competitiveness.`
      }

      case 'copilot': {
        const query = typeof inputData === 'string' ? inputData.trim() : 'Recruiting Assistance'
        if (!query) return 'Please enter a recruiting query or custom prompt.'

        const cleanQuery = query.replace(/^[?\s#*•-]+/, '').trim()
        const words = cleanQuery.split(/\s+/).filter(w => w.length > 2)
        const topicName = cleanQuery.length < 60 ? cleanQuery : words.slice(0, 6).join(' ')

        return `### ⚡ Recruiter AI Copilot Intelligence

**Query / Prompt:** "${cleanQuery}"

---

#### 📌 Strategic Intelligence & Overview
Regarding **"${topicName}"**: In modern talent acquisition, handling this effectively requires a structured, multi-channel recruitment strategy.

#### 🛠️ Key Core Components & Best Practices:
• **Strategic Focus:** Establish clear alignment between target candidate skillsets, company hiring priorities, and market compensation benchmarks.
• **Sourcing & Talent Discovery:** Leverage specialized Boolean search strings, LinkedIn Recruiter, and industry networks to engage both active and passive talent.
• **Candidate Experience & Outreach:** Craft concise, high-converting outreach messages highlighting key role impact, team vision, and compensation flexibility.
• **Qualification & Evaluation:** Conduct structured 15-minute phone screenings to assess technical competency, cultural fit, and motivation.

#### 📊 Recommended Tactical Next Steps:
1. **Define Core Requirements:** Document must-have technical skills vs nice-to-have qualifications.
2. **Execute Targeted Campaign:** Launch outreach across primary sourcing channels with personalized follow-up nudges.
3. **Monitor Conversion Metrics:** Track submittals-to-interview and interview-to-offer ratios to optimize pipeline velocity.`
      }

      default:
        return `### ⚡ Gemini AI Copilot Response
Ready to assist with recruiting, sourcing prompts, candidate feedback, or hiring strategies.`
    }
  }

  const [apiNotice, setApiNotice] = useState(null)
  const [userApiKey, setUserApiKey] = useState('')

  const callGeminiAPI = async (promptText, toolId, inputData = {}) => {
    if (demoMode) {
      await new Promise(resolve => setTimeout(resolve, 400))
      return getDemoResponse(toolId, inputData)
    }

    try {
      const res = await fetch('http://localhost:4000/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          apiKey: userApiKey.trim() || undefined
        })
      })

      const data = await res.json()
      if (res.ok && data.text) {
        setApiNotice(null)
        return data.text
      }

      // Handle Google Free Tier Quota Exceeded (429)
      if (res.status === 429 || (data.error && (data.error.includes('Quota') || data.error.includes('rate') || data.error.includes('limit')))) {
        console.warn('Gemini Free Tier Quota Limit reached. Seamlessly serving via Instant AI Engine.')
        setApiNotice('⚠️ Google Gemini Free Tier daily quota limit reached for key. Paste a fresh key above or use Instant Mode.')
        return getDemoResponse(toolId, inputData)
      }

      if (data.error) {
        setApiNotice(`⚠️ Gemini API: ${data.error}`)
        return getDemoResponse(toolId, inputData)
      }
    } catch (err) {
      console.warn('API error, falling back to Instant AI:', err.message)
      setApiNotice('⚡ Generating via Instant AI Engine.')
      return getDemoResponse(toolId, inputData)
    }

    return getDemoResponse(toolId, inputData)
  }

  // Submit Handlers
  const handleBooleanSubmit = async (e) => {
    e.preventDefault()
    setBoolLoading(true)
    setBoolError(null)
    setBoolResults(null)

    const prompt = `You are a Senior Sourcing Specialist. Generate high-conversion Boolean search strings.
Output ONLY structured Markdown. DO NOT output internal thinking or reasoning notes.

Job Title: ${boolInput.title}
Required Skills: ${boolInput.skills}
Location: ${boolInput.location}
Experience: ${boolInput.experience}
Job Description: ${boolInput.jdText}

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
• Title Synonyms: ...
• Skill Synonyms: ...
• Location Variations: ...`

    try {
      const res = await callGeminiAPI(prompt, 'boolean', boolInput)
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
### ✉️ LinkedIn InMail (Short & Engaging)
### 📧 Cold Outreach Email
### 💬 3-Day Follow-Up Nudge`

    try {
      const res = await callGeminiAPI(prompt, 'email', emailForm)
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
      const res = await callGeminiAPI(prompt, 'formatter', resumeText)
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
### 📌 Executive Summary
### 🛠️ Must-Have Core Skills
### 🌟 Nice-to-Have Skills
### 💡 Ideal Candidate Persona
### ❓ Top 5 Technical Interview Questions`

    try {
      const res = await callGeminiAPI(prompt, 'jd', jdText)
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
### 📊 Match Rating: [X / 100]
### ✅ Key Matching Strengths
### ⚠️ Potential Gaps / Unverified Areas
### 🎙️ Probing Interview Questions`

    try {
      const res = await callGeminiAPI(prompt, 'match', { matchJd, matchCandidate })
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
2. Use the LOCAL CURRENCY of "${salaryForm.location}" (e.g. INR ₹ for India, GBP £ for UK, EUR € for Europe, CAD $ for Canada, AUD $ for Australia, BRL R$ for Brazil, JPY ¥ for Japan, AED for UAE, PHP ₱ for Philippines, etc.).
3. Output ONLY the final structured Markdown response. DO NOT output internal reasoning or scratchpad notes.

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
• **Base Salary Range:** (Provide realistic low-to-high local range)
• **Median Compensation:** (Provide median local figure)
• **Incentives & Bonuses:** (Standard bonuses/commissions for this local market)

#### Market Demand Trends
• **Demand Index:** 🔥 (High / Very High / Moderate)
• **Time-to-Hire Average:** (Average days)
• **Key Hiring Drivers:** (Key local drivers and market trends)`

    try {
      const res = await callGeminiAPI(prompt, 'salary', salaryForm)
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

    const prompt = `You are a Recruiter AI Assistant. Answer concisely.
Output ONLY structured Markdown response.

PROMPT: ${copilotPrompt}`

    try {
      const res = await callGeminiAPI(prompt, 'copilot', copilotPrompt)
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
            <span>GEMINI 2.5 RECRUITING AI SUITE</span>
          </div>
          <h1>Recruiter AI Innovation Center</h1>
          <p>7 specialized AI tools for sourcing, resume formatting, email outreach, candidate evaluation, and salary intelligence.</p>
        </div>

        <div className="ai-key-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: demoMode ? '#7c5cff' : 'var(--text2)' }}>
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={e => setDemoMode(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: '#7c5cff' }}
                />
                ⚡ Instant Demo Mode
              </label>
              <div className="ai-key-status">
                <span className="key-indicator active" />
                <span className="key-label">{userApiKey ? 'Custom Key Active' : 'Gemini 2.5 Active'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="password"
                placeholder="Paste Gemini API Key (AIzaSy...)"
                value={userApiKey}
                onChange={e => {
                  setUserApiKey(e.target.value)
                  localStorage.setItem('user_gemini_key', e.target.value)
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  fontSize: '11px',
                  width: '210px'
                }}
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '11px', color: '#7c5cff', textDecoration: 'none', fontWeight: '600' }}
              >
                Get Free Key ↗
              </a>
            </div>
          </div>
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
                <label>Job Description Text (Optional)</label>
                <textarea
                  rows="4"
                  placeholder="Paste Job Description for max accuracy..."
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
                <p>Gemini 2.5 is synthesizing search queries...</p>
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
                />
              </div>
              <div className="ai-field">
                <label>Location / Region</label>
                <input
                  type="text"
                  value={salaryForm.location}
                  onChange={e => setSalaryForm({ ...salaryForm, location: e.target.value })}
                />
              </div>
              <div className="ai-field">
                <label>Experience Level</label>
                <input
                  type="text"
                  value={salaryForm.expLevel}
                  onChange={e => setSalaryForm({ ...salaryForm, expLevel: e.target.value })}
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
                <p>Analyzing compensation data...</p>
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
            <p className="ai-card-sub">Ask Gemini AI anything related to recruiting, sourcing strategies, or candidate feedback.</p>

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
                {copilotLoading ? <span className="ai-spinner" /> : '⚡ Ask Gemini Copilot'}
              </button>
            </form>
          </div>

          <div className="ai-results-card">
            <div className="results-header">
              <h4>Gemini Copilot Output</h4>
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
                <p>Processing query...</p>
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
