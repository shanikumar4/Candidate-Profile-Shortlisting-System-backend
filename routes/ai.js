const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// POST /api/ai/shortlist
router.post('/shortlist', async (req, res) => {
  try {
    const { requiredSkills, minExperience, preferredSkills = [] } = req.body;

    // Fetch all candidates from MongoDB (not just from request body)
    const candidates = await Candidate.find({ experience: { $gte: Number(minExperience) || 0 } });

    if (candidates.length === 0) {
      return res.status(400).json({ success: false, error: 'No candidates meet the minimum experience requirement.' });
    }

    const candidateList = candidates.map((c, i) =>
      `${i + 1}. ${c.name} | Skills: ${c.skills.join(', ')} | Experience: ${c.experience} years | Bio: ${c.bio || 'Not provided'}`
    ).join('\n');

    const prompt = `You are a senior technical recruiter. Analyze and rank these candidates for a job opening.

JOB REQUIREMENTS:
- Required Skills: ${requiredSkills.join(', ')}
- Minimum Experience: ${minExperience} years
- Preferred Skills: ${preferredSkills.length > 0 ? preferredSkills.join(', ') : 'None specified'}

CANDIDATES:
${candidateList}

Tasks:
1. Rank ALL candidates from best fit to least fit.
2. For each candidate, write 1-2 specific sentences about why they are or aren't a good fit.
3. Also generate 3 interview questions tailored to the top-ranked candidate.

Return ONLY valid JSON — no markdown, no preamble, no explanation outside the JSON:
{
  "rankings": [
    {
      "candidateName": "<exact name from list>",
      "rank": 1,
      "explanation": "Specific 1-2 sentence explanation."
    }
  ],
  "interviewQuestions": [
    "Question 1 for the top candidate?",
    "Question 2 for the top candidate?",
    "Question 3 for the top candidate?"
  ],
  "summary": "One concise paragraph summarizing the shortlist quality overall."
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Candidate Shortlisting System'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || 'OpenRouter API error');
    }

    const data = await response.json();
    const raw = data.choices[0].message.content;
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Attach full candidate objects to rankings
    const enriched = parsed.rankings.map(r => ({
      ...r,
      candidate: candidates.find(c => c.name === r.candidateName) || null
    }));

    res.json({
      success: true,
      rankings: enriched,
      interviewQuestions: parsed.interviewQuestions,
      summary: parsed.summary
    });

  } catch (err) {
    console.error('AI shortlist error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
