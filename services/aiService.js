const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

const callAI = async (messages, temperature = 0.3, maxTokens = 1000) => {
  const res = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'HireIQ Platform',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `OpenRouter error: ${res.status}`);
  }

  const data = await res.json();
  if (!data.choices?.[0]) throw new Error('AI service returned empty response');
  return data.choices[0].message.content;
};

const cleanJSON = (raw) => raw.replace(/```json|```/g, '').trim();

// ── 1. Match Scoring (Module 1 + 13 Skill Inference + 14 Ghost Risk + 15 Team Fit) ──
const scoreCandidate = async (candidate, job, teamSkills = []) => {
  const teamSection = teamSkills.length > 0
    ? `\nEXISTING TEAM SKILLS (for gap analysis): ${teamSkills.join(', ')}`
    : '';

  const prompt = `You are a senior technical recruiter at a top company.
Calculate the ATS Match Score for this candidate against the job requirements using the following weighted criteria:
1. Form Skills Match (30%): Direct and semantically equivalent matches of required skills from the form.
2. Form Role Experience (20%): Years of professional experience directly aligned with the job profile.
3. Resume PDF Context (30%): Analysis of the parsed Resume PDF text. Evaluate the depth of experience, contextual application of skills, and overall resume quality.
4. Bonus / Projects / Internships (20%): Extra points for internships, personal projects, or nice-to-have skills.

JOB:
Title: ${job.title}
Required Skills: ${job.requiredSkills.join(', ')}
Nice-to-have: ${(job.niceToHaveSkills || []).join(', ')}
Min Experience: ${job.minExperience} years
${teamSection}

CANDIDATE:
Name: ${candidate.name}
Form Skills: ${candidate.skills.join(', ')}
Form Experience: ${candidate.experience} years
Resume PDF Text: ${candidate.resumeText ? candidate.resumeText.slice(0, 3000) : 'No Resume PDF Provided'}

Instructions:
- Calculate a final "matchScore" out of 100 based on the 4 criteria above.
- In "strengths", explicitly mention details found in the Resume PDF.
- Check for semantically equivalent skill terms before penalizing gaps.
- ghostRisk: high if experience greatly exceeds/undershoot job req, else medium/low.
- teamFitScore (0-100): how well candidate fills gaps in the existing team (null if no team skills given).
- List "inferredMatches" where skill terminology differs but is semantically equivalent.

Respond ONLY with valid JSON (no markdown):
{
  "matchScore": <0-100>,
  "summary": "<one sharp recruiter-verdict sentence explaining the score>",
  "strengths": ["...", "..."],
  "gaps": ["...", "..."],
  "ghostRisk": "low|medium|high",
  "teamFitScore": <0-100 or null>,
  "teamFitReason": "<one sentence>",
  "inferredMatches": ["React.js ≈ ReactJS", "..."]
}`;

  const raw = await callAI([{ role: 'user', content: prompt }]);
  return JSON.parse(cleanJSON(raw));
};

// ── 2. AI Interview Questions (Module 3) ──
const generateInterviewQuestions = async (candidate, job) => {
  const prompt = `Generate 6 targeted, specific interview questions for this candidate applying to ${job.title}.
Candidate skills: ${candidate.skills.join(', ')}, Experience: ${candidate.experience} years.
Skill gaps: ${(candidate.aiGaps || []).join(', ') || 'none identified'}.
Job requires: ${job.requiredSkills.join(', ')}.

Make questions specific — not generic. Mix behavioural and technical.
Return ONLY a JSON array of 6 strings. No markdown, no numbering.`;
  const raw = await callAI([{ role: 'user', content: prompt }]);
  return JSON.parse(cleanJSON(raw));
};

// ── 3. AI Email Templates (Module 7) ──
const generateEmailTemplate = async (type, candidate, job, companyName) => {
  const types = {
    screening: 'a screening call invitation',
    interview: 'an interview invitation with date/time placeholders',
    rejection: 'a warm, professional rejection',
    offer:     'a job offer letter with salary/start date placeholders',
  };
  const prompt = `Write ${types[type] || 'an email'} for:
Candidate: ${candidate.name}
Job: ${job.title} at ${companyName}
Candidate summary: ${candidate.aiSummary || ''}

Write a professional, warm email. Use [DATE], [TIME], [SALARY] as placeholders where needed.
Return ONLY a valid JSON object: { "subject": "...", "body": "..." }.
IMPORTANT: You must escape newlines in the body string using \\n so the output is valid JSON.`;
  const raw = await callAI([{ role: 'user', content: prompt }], 0.5);
  try {
    return JSON.parse(cleanJSON(raw));
  } catch (err) {
    console.error('JSON Parse Error in generateEmailTemplate:', err, '\nRaw AI Output:', raw);
    // Attempt to manually extract if it failed due to unescaped newlines
    const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/i);
    const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]+)"\s*}/i);
    if (subjectMatch && bodyMatch) {
      return { subject: subjectMatch[1], body: bodyMatch[1].replace(/\\n/g, '\n') };
    }
    throw new Error('Failed to generate valid email format');
  }
};

// ── 4. Reverse JD Generator (Module 16) ──
const generateJobDescription = async (bulletPoints, title) => {
  const prompt = `Write a professional, compelling job description for: ${title}
Based on these rough requirements: ${bulletPoints}

Return ONLY a JSON object:
{
  "description": "<2-3 paragraph overview>",
  "responsibilities": ["...", "..."],
  "requirements": ["...", "..."],
  "niceToHave": ["...", "..."],
  "requiredSkills": ["skill1", "skill2"],
  "minExperience": <number>
}`;
  const raw = await callAI([{ role: 'user', content: prompt }], 0.4, 1500);
  return JSON.parse(cleanJSON(raw));
};

// ── 5. Bias Detection (Module 4) ──
const analyzeForBias = async (shortlistData, job) => {
  const candidateLines = shortlistData.map(c =>
    `${c.name}: skills=[${c.skills.join(', ')}], exp=${c.experience}yrs, score=${c.matchScore}%`
  ).join('\n');

  const prompt = `You are a DEI bias auditor for a recruitment system.
Job "${job.title}" requires: ${job.requiredSkills.join(', ')}, min ${job.minExperience} years.

Shortlisted candidates:
${candidateLines}

Check for:
1. Keyword proxy bias (penalizing semantically identical skills with different names)
2. Experience-score mismatches (overqualified/underqualified inconsistently ranked)
3. Inequitable patterns across experience tiers

Apply Four-Fifths Rule: compare selection rates across experience tiers (0-2yr, 3-5yr, 6+yr).

Return ONLY valid JSON:
{
  "overallFairnessScore": <0-100>,
  "keywordFlags": [{ "candidateName": "...", "issue": "..." }],
  "fourFifthsResults": [
    { "tier": "0-2yr", "applied": <n>, "shortlisted": <n>, "rate": <0-1> }
  ],
  "summary": "<Two sentence assessment.>"
}`;
  const raw = await callAI([{ role: 'user', content: prompt }], 0.2, 1200);
  return JSON.parse(cleanJSON(raw));
};

// ── 6. XAI Score Explainer (Module 17) ──
const explainScore = async (candidate, job) => {
  const prompt = `Explain the ATS match score (${candidate.matchScore}%) for this candidate using the 4-pillar scoring system:
1. Form Skills Match (30% max)
2. Form Professional Experience (20% max)
3. Resume PDF Context & Analysis (30% max)
4. Bonus / Projects / Internships (20% max)

JOB REQUIRED SKILLS: ${job.requiredSkills.join(', ')} (min ${job.minExperience} years)
CANDIDATE FORM SKILLS: ${candidate.skills.join(', ')} (${candidate.experience} years)
RESUME PDF TEXT: ${candidate.resumeText ? candidate.resumeText.slice(0, 3000) : 'Not provided'}
OVERALL SCORE: ${candidate.matchScore}%

Return ONLY valid JSON (no markdown):
{
  "skillBreakdown": [
    { "skill": "React", "status": "matched|inferred|missing", "weight": <0-30>, "contribution": <points out of 30 total for skills>, "note": "..." }
  ],
  "experienceContribution": { "required": ${job.minExperience}, "actual": ${candidate.experience}, "contribution": <points out of 20> },
  "resumePdfContribution": { "contribution": <points out of 30>, "note": "Explicitly mention how the Resume PDF text supported or detracted from the score." },
  "bonusContribution": { "contribution": <points out of 20>, "note": "e.g., strong academic projects or internships" },
  "totalScore": ${candidate.matchScore},
  "verdict": "<one sentence>"
}`;
  const raw = await callAI([{ role: 'user', content: prompt }], 0.1);
  return JSON.parse(cleanJSON(raw));
};

module.exports = {
  scoreCandidate,
  generateInterviewQuestions,
  generateEmailTemplate,
  generateJobDescription,
  analyzeForBias,
  explainScore,
};
