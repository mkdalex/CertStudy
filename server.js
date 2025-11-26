// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const { OpenAI } = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// Basic sanity check before even starting server
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[WARN] OPENAI_API_KEY is not set. Requests to /api/generate-quiz will fail."
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Helper: build a nice debug message for OpenAI / network errors.
 */
function buildErrorDebugInfo(err) {
  // Missing key
  if (!process.env.OPENAI_API_KEY) {
    return "Missing OPENAI_API_KEY in .env. Set it and restart the server.";
  }

  // OpenAI library error with HTTP response (e.g. 401, 429, 500...)
  if (err && err.status) {
    let base = `OpenAI API error (status ${err.status}).`;

    if (err.status === 401) {
      return base + " Authentication failed. Check your API key.";
    }
    if (err.status === 429) {
      return base + " Rate limit or quota exceeded.";
    }
    if (err.status >= 500) {
      return base + " OpenAI server side error, try again.";
    }

    return base + " Check server logs for more details.";
  }

  // Network-level error
  if (err && err.code) {
    if (
      ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(
        err.code
      )
    ) {
      return `Network error (${err.code}) while contacting OpenAI. Check your internet connection or firewall.`;
    }
  }

  // Fallback
  if (err && err.message) {
    return `Unexpected error: ${err.message}`;
  }

  return "Unknown error occurred while calling OpenAI.";
}

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic, count, difficulty } = req.body;

    const numQuestions = Math.min(Math.max(parseInt(count) || 5, 1), 15); // clamp 1–15
    const safeTopic = (topic || "AZ-900 (Microsoft Azure Fundamentals)").slice(
      0,
      80
    );

    const difficultyMap = {
      beginner: "beginner",
      intermediate: "intermediate",
      expert: "expert",
    };
    const safeDifficulty =
      difficultyMap[(difficulty || "").toLowerCase()] || "beginner";

    const difficultyDescription =
      safeDifficulty === "beginner"
        ? "Focus on fundamentals, clear definitions, and simple scenarios."
        : safeDifficulty === "intermediate"
        ? "Focus on applied scenarios, comparisons between services, and realistic use-cases."
        : "Focus on deeper scenarios, trade-offs, and multi-step reasoning similar to harder exam questions. Avoid obscure trivia.";

const requestCount = Math.min(numQuestions + 3, 20); // ask for a few extra

const prompt = `
You are an expert exam tutor.

Create ${requestCount} multiple-choice questions for the topic: "${safeTopic}".

Difficulty: ${safeDifficulty.toUpperCase()}
${difficultyDescription}

Requirements:
- Questions should be realistic, practical, and similar to real certification/exam style.
- Each question must have exactly 4 options.
- Only ONE option is correct.
- Questions should be clear and not trick questions.
- DO NOT always use the same correct option. Distribute correctOption fairly across A, B, C, and D within this set.
- Options must NOT include the "A. / B. / C. / D." prefix. Just plain text like "Use Azure Functions for serverless code".

Output strictly as valid JSON like this:

[
  {
    "id": "q1",
    "question": "Question text here...",
    "options": [
      "Option text 1",
      "Option text 2",
      "Option text 3",
      "Option text 4"
    ],
    "correctOption": "A",
    "explanation": "Short explanation of why A is correct."
  }
]

Do not include any text before or after the JSON.
`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-5-mini", // ✅ default model you’re using
        messages: [
          {
            role: "system",
            content:
              "You generate exam-style multiple-choice questions in clean JSON.",
          },
          { role: "user", content: prompt },
        ],
        // ❌ no temperature here because this model doesn’t support custom temp
      });
    } catch (openAiErr) {
      console.error("[OpenAI ERROR]", openAiErr);
      const debug = buildErrorDebugInfo(openAiErr);
      return res.status(500).json({
        error: "Failed to call OpenAI API.",
        debug,
      });
    }

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[JSON PARSE ERROR] Could not parse AI output as JSON.");
      console.error("Raw content from OpenAI:\n", raw);

      return res.status(500).json({
        error: "Failed to parse questions from AI (invalid JSON).",
        debug:
          "The model did not return valid JSON. Check the prompt or inspect server logs to see the raw output.",
      });
    }

    // Basic validation / cleanup
    const cleaned = (questions || [])
      .filter(
        (q) =>
          q && q.question && Array.isArray(q.options) && q.options.length === 4
      )
      .map((q, idx) => ({
        id: q.id || `q${idx + 1}`,
        question: String(q.question),
        options: q.options.map(String),
        correctOption: ["A", "B", "C", "D"].includes(q.correctOption)
          ? q.correctOption
          : "A",
        explanation: q.explanation ? String(q.explanation) : "",
      }));

    if (!cleaned.length) {
      console.error("[VALIDATION ERROR] No valid questions after cleaning.", {
        originalLength: Array.isArray(questions) ? questions.length : null,
      });
      return res.status(500).json({
        error: "No valid questions generated from AI.",
        debug:
          "The AI response did not contain properly formatted questions. Try again or adjust the prompt.",
      });
    }

    // 🔢 Cost estimation based on usage + GPT-5 mini pricing
    const usage = completion.usage || {};
    const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const completionTokens =
      usage.completion_tokens ?? usage.output_tokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    // GPT-5 mini: input $0.25/M, output $2.00/M
    const INPUT_PRICE_PER_M = 0.25;
    const OUTPUT_PRICE_PER_M = 2.0;

    const costUsd =
      (promptTokens * INPUT_PRICE_PER_M +
        completionTokens * OUTPUT_PRICE_PER_M) /
      1_000_000;

    res.json({
      topic: safeTopic,
      difficulty: safeDifficulty,
      questions: cleaned,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: Number(costUsd.toFixed(6)),
      },
    });
  } catch (err) {
    console.error("[UNHANDLED ERROR in /api/generate-quiz]", err);
    const debug = buildErrorDebugInfo(err);
    res.status(500).json({
      error: "Internal server error.",
      debug,
    });
  }
});

app.post('/api/explain', async (req, res) => {
  try {
    const { topic, text, difficulty } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided to explain.' });
    }

    const safeTopic =
      (topic || 'AZ-900 (Microsoft Azure Fundamentals)').slice(0, 80);
    const safeText = text.slice(0, 500); // don’t let people paste a whole book

    const difficultyLabel = (difficulty || 'beginner').toLowerCase();
    const level =
      difficultyLabel === 'expert'
        ? 'advanced (assume some prior Azure knowledge, focus on depth)'
        : difficultyLabel === 'intermediate'
        ? 'intermediate (mix of plain language and technical detail)'
        : 'beginner (plain language, minimal jargon)';

    const prompt = `
You are an certification tutor.

Topic / exam: "${safeTopic}"
Student level: ${level}

Explain the following term or phrase in a way that helps someone studying for this topic/certification/exam so they can understand the concept clearly.:

"${safeText}"

Formatting (Markdown):
- Start with one line: **Summary:** short one-sentence definition.
- Then one short paragraph (2–3 sentences) under **In simple terms:** explaining it like you would to a junior student.
- Then at most 3 bullet points under **Why it matters for the exam:**.
- Use **bold** for key service names or concepts.
- You may use _italics_ for short clarifications.
- No code blocks.
- Keep the whole answer under about 150–180 words.

Focus:
- Keep it focused on what the term is, when/why it's used, and how it relates to the topic on hand.
- Avoid long lists or deep implementation detail.
`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: 'You explain cloud/IT concepts clearly for exam students.'
          },
          { role: 'user', content: prompt }
        ]
      });
    } catch (openAiErr) {
      console.error('[OpenAI ERROR /api/explain]', openAiErr);
      const debug = buildErrorDebugInfo(openAiErr);
      return res.status(500).json({
        error: 'Failed to call OpenAI API for explanation.',
        debug
      });
    }

    const explanation =
      completion.choices[0]?.message?.content?.trim() ||
      'Sorry, I could not generate an explanation.';

    res.json({ topic: safeTopic, explanation });
  } catch (err) {
    console.error('[UNHANDLED ERROR in /api/explain]', err);
    const debug = buildErrorDebugInfo(err);
    res.status(500).json({
      error: 'Internal server error.',
      debug
    });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
