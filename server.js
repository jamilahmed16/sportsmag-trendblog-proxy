const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from your GitHub Pages URL and any origin
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'TrendBlog AI Proxy is running',
    version: '1.0.0'
  });
});

// Main proxy endpoint — forwards requests to Anthropic API
app.post('/generate', async (req, res) => {
  try {
    const { prompt, system, model, max_tokens } = req.body;

    // Validate required fields
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body' });
    }

    // API key comes from Render environment variable — never exposed to browser
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error — API key not set' });
    }

    const requestBody = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 4000,
      system: system || 'You are an expert sports journalist and SEO specialist.',
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error ? data.error.message : 'Anthropic API error',
        details: data
      });
    }

    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy server error: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`TrendBlog AI Proxy running on port ${PORT}`);
});
