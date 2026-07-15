// Chess Review — LLM Proxy Server
// Tiny Express backend that holds the OpenRouter API key and calls DeepSeek

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'running', model: process.env.MODEL_NAME || 'deepseek/deepseek-chat' });
});

// POST /api/explain — Generate a natural language explanation for a chess move
// Body: { fen, move, bestMove, classification }
app.post('/api/explain', async (req, res) => {
  const { move, bestMove, classification } = req.body;

  if (!move || !classification) {
    return res.status(400).json({ error: 'Missing required fields: move, classification' });
  }

  // Check if this classification should be explained
  const explainMistakes = process.env.EXPLAIN_MISTAKES !== 'false';
  if (classification === 'mistake' && !explainMistakes) {
    return res.json({ explanation: '' });
  }

  // Only generate for blunders and mistakes
  if (classification !== 'blunder' && classification !== 'mistake') {
    return res.json({ explanation: '' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  const modelName = process.env.MODEL_NAME || 'deepseek/deepseek-chat';

  let moveInfo = `Move: ${move}`;
  if (bestMove) {
    moveInfo += ` | Better was: ${bestMove}`;
  }

  const prompt = `You are a chess coach. Explain this ${classification} in 1-2 concise, matter-of-fact sentences.

${moveInfo}

Explain why it's a ${classification} and what the player should have done instead. Keep it brief.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return res.status(502).json({ error: 'LLM API request failed', details: errorText });
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content?.trim() || '';

    res.json({ explanation });
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Internal proxy error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Chess Review proxy running on http://localhost:${PORT}`);
  console.log(`Model: ${process.env.MODEL_NAME || 'deepseek/deepseek-chat'}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('WARNING: OPENROUTER_API_KEY not set. Set it in server/.env');
  }
});