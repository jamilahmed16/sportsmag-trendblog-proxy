const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'TrendBlog AI Proxy is running', version: '2.0.0' });
});

// Convert markdown-style content to BSM-styled HTML
function convertToBSMHtml(text) {
  let html = text;

  // Remove any TITLE/SLUG/META lines if accidentally included in content
  html = html.replace(/^TITLE:.*$/gm, '');
  html = html.replace(/^SLUG:.*$/gm, '');
  html = html.replace(/^META:.*$/gm, '');
  html = html.replace(/^CONTENT:\s*/gm, '');

  // FAQ section — convert Q&A pairs to styled HTML
  html = html.replace(
    /## Frequently Asked Questions\s*([\s\S]*?)(?=##|$)/gi,
    function(match, faqContent) {
      let faqHtml = '<div class="bsm-faq-wrap"><h2 class="bsm-faq-heading">Frequently Asked Questions</h2>';
      
      // Match each Q&A pair
      const pairs = faqContent.match(/\*\*Q:\*\*\s*(.+?)\s*\*\*A:\*\*\s*([\s\S]+?)(?=\*\*Q:\*\*|$)/gi);
      
      if (pairs) {
        pairs.forEach(function(pair, index) {
          const qMatch = pair.match(/\*\*Q:\*\*\s*(.+?)(?=\*\*A:\*\*)/i);
          const aMatch = pair.match(/\*\*A:\*\*\s*([\s\S]+?)$/i);
          if (qMatch && aMatch) {
            const question = qMatch[1].trim();
            const answer = aMatch[1].trim();
            faqHtml += '<div class="bsm-faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">';
            faqHtml += '<div class="bsm-faq-question" itemprop="name">' + question + '</div>';
            faqHtml += '<div class="bsm-faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">';
            faqHtml += '<div itemprop="text">' + answer + '</div>';
            faqHtml += '</div></div>';
          }
        });
      }
      
      faqHtml += '</div>';
      return faqHtml;
    }
  );

  // H2 headings — add BSM accent border class
  html = html.replace(/^## (.+)$/gm, '<h2 class="bsm-post-h2">$1</h2>');

  // H3 headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="bsm-post-h3">$1</h3>');

  // Bold text
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic text
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote class="bsm-post-quote">$1</blockquote>');

  // Affiliate placeholders — convert to styled affiliate link box
  html = html.replace(
    /\[AFFILIATE:\s*([^—]+)—\s*(\$[\d,]+)[^—]*—\s*([^\]]+)\]/gi,
    function(match, product, price, brand) {
      product = product.trim();
      price = price.trim();
      brand = brand.trim().replace(/via Impact\.com/i, '').trim();
      return '<span class="bsm-inline-aff"><strong class="bsm-inline-aff__brand">' + brand + '</strong> — <a href="#" rel="sponsored noopener" class="bsm-inline-aff__link" target="_blank">' + product + ' ' + price + ' →</a><small class="bsm-inline-aff__disc"> (affiliate link via Impact.com)</small></span>';
    }
  );

  // Amazon placeholders
  html = html.replace(
    /\[AMAZON:\s*([^—]+)—\s*(\$[\d,]+)[^\]]*\]/gi,
    function(match, product, price) {
      product = product.trim();
      price = price.trim();
      return '<span class="bsm-inline-aff"><a href="#" rel="sponsored noopener" class="bsm-inline-aff__link" target="_blank">' + product + ' ' + price + ' →</a><small class="bsm-inline-aff__disc"> (Amazon affiliate link)</small></span>';
    }
  );

  // Internal link placeholders — convert to styled suggestion
  html = html.replace(
    /\[INTERNAL:\s*([^\]]+)\]/gi,
    function(match, topic) {
      return '<a href="#" class="bsm-internal-link">' + topic.trim() + '</a>';
    }
  );

  // Unordered lists
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
    return '<ul class="bsm-post-list">' + match + '</ul>';
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="bsm-post-divider">');

  // Paragraphs — wrap blocks of text not already wrapped in HTML tags
  const lines = html.split('\n');
  const processed = [];
  let inBlock = false;
  let currentParagraph = [];

  lines.forEach(function(line) {
    const trimmed = line.trim();
    
    // Skip empty lines — close paragraph if open
    if (!trimmed) {
      if (currentParagraph.length > 0) {
        processed.push('<p>' + currentParagraph.join(' ') + '</p>');
        currentParagraph = [];
      }
      return;
    }

    // If line starts with HTML tag — output as-is
    if (trimmed.startsWith('<')) {
      if (currentParagraph.length > 0) {
        processed.push('<p>' + currentParagraph.join(' ') + '</p>');
        currentParagraph = [];
      }
      processed.push(trimmed);
      return;
    }

    // Otherwise accumulate into paragraph
    currentParagraph.push(trimmed);
  });

  // Flush remaining paragraph
  if (currentParagraph.length > 0) {
    processed.push('<p>' + currentParagraph.join(' ') + '</p>');
  }

  html = processed.join('\n');

  // Wrap the whole article in BSM article body class
  html = '<div class="bsm-generated-content">' + html + '</div>';

  return html;
}

// Main proxy endpoint
app.post('/generate', async (req, res) => {
  try {
    const { prompt, system, model, max_tokens } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error — API key not set' });
    }

    const requestBody = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 4000,
      system: system || 'You are an expert sports journalist and SEO specialist.',
      messages: [{ role: 'user', content: prompt }]
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

    // Get raw text
    const rawText = data.content[0].text;

    // Extract structured sections
    const titleMatch = rawText.match(/TITLE:\s*(.+?)(?:\n|$)/);
    const slugMatch  = rawText.match(/SLUG:\s*(.+?)(?:\n|$)/);
    const metaMatch  = rawText.match(/META:\s*(.+?)(?:\n|$)/);
    const contentMatch = rawText.match(/CONTENT:\s*([\s\S]+)/);

    const title   = titleMatch ? titleMatch[1].trim() : '';
    const slug    = slugMatch  ? slugMatch[1].trim().replace(/[^a-z0-9-]/g, '') : '';
    const meta    = metaMatch  ? metaMatch[1].trim() : '';
    const rawContent = contentMatch ? contentMatch[1].trim() : rawText;

    // Convert content to BSM-styled HTML
    const styledHtml = convertToBSMHtml(rawContent);

    // Return both raw text (for display in tool) and styled HTML (for WordPress)
    res.json({
      content: [{ type: 'text', text: rawText }],
      bsm: {
        title: title,
        slug: slug,
        meta: meta,
        html: styledHtml,
        raw: rawContent
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy server error: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log('TrendBlog AI Proxy v2.0 running on port ' + PORT);
});
