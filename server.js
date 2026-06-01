const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'TrendBlog AI Proxy is running', version: '3.0.0' });
});

/* ================================================================
   BSM HTML BUILDER
   Converts Claude's markdown output into full BSM-styled HTML
   matching the single post preview design exactly
   ================================================================ */

function buildBSMHtml(parsed) {
  const { title, slug, meta, sections, faq, tags, affiliateItems, audience } = parsed;

  // ── Article body sections ──
  let bodyHtml = '';
  sections.forEach(function(section, i) {
    if (i === 0) {
      // First section: opening paragraphs with no H2
      bodyHtml += section.paragraphs.map(p => `<p>${p}</p>`).join('\n');

      // Insert mid-ad after opening paragraphs
      bodyHtml += `
<div class="bsm-art-ad-mid" style="background:var(--bsm-black-r,#111);border:1px dashed var(--bsm-dg,#2E2E2E);display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:9px;color:#555;letter-spacing:.12em;text-transform:uppercase;min-height:250px;margin:36px 0;max-width:720px;">
  <!-- ADSENSE: paste 300x250 code here -->
  AdSense · Mid Content · 300×250
</div>`;
    } else {
      // Subsequent sections: H2 + paragraphs
      bodyHtml += `\n<h2 style="font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#FFFFFF;line-height:1;margin:40px 0 16px;letter-spacing:-.3px;padding-left:14px;border-left:3px solid #E8FF00;">${section.heading}</h2>\n`;
      bodyHtml += section.paragraphs.map(p => `<p>${p}</p>`).join('\n');

      // Insert affiliate box after 2nd section
      if (i === 2 && affiliateItems.length > 0) {
        bodyHtml += buildAffiliateBox(affiliateItems);
      }
    }
  });

  // ── FAQ section ──
  const faqHtml = buildFaqHtml(faq);

  // ── Tags ──
  const tagsHtml = tags.length > 0
    ? tags.map(t => `<a href="/tag/${t.toLowerCase().replace(/\s+/g,'-')}/" style="font-family:'DM Mono',monospace;font-size:9px;color:#555555;border:1px solid #2E2E2E;padding:4px 10px;letter-spacing:.08em;text-decoration:none;transition:.18s;">${t}</a>`).join('\n')
    : '';

  // ── Share bar ──
  const shareHtml = `
<div style="display:flex;align-items:center;gap:8px;margin:24px 0;padding:16px 20px;background:#111111;border:1px solid #2E2E2E;max-width:720px;flex-wrap:wrap;">
  <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#555555;margin-right:4px;">Share</span>
  <a href="https://www.facebook.com/sharer/sharer.php?u=POSTURL" style="display:inline-flex;align-items:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;background:#1877f2;color:#fff;text-decoration:none;" target="_blank" rel="noopener">Facebook</a>
  <a href="https://twitter.com/intent/tweet?url=POSTURL&text=POSTTITLE" style="display:inline-flex;align-items:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;background:#000;color:#fff;text-decoration:none;" target="_blank" rel="noopener">X</a>
  <a href="https://wa.me/?text=POSTTITLE%20POSTURL" style="display:inline-flex;align-items:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;background:#25d366;color:#fff;text-decoration:none;" target="_blank" rel="noopener">WhatsApp</a>
  <a href="https://www.linkedin.com/shareArticle?mini=true&url=POSTURL" style="display:inline-flex;align-items:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;background:#0a66c2;color:#fff;text-decoration:none;" target="_blank" rel="noopener">LinkedIn</a>
</div>`;

  // ── Author box ──
  const authorHtml = `
<div style="display:flex;gap:20px;align-items:flex-start;padding:24px;background:#111111;border:1px solid #2E2E2E;border-left:3px solid #E8FF00;margin:36px 0;max-width:720px;">
  <div style="width:56px;height:56px;background:#2E2E2E;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">✍️</div>
  <div>
    <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:#E8FF00;margin-bottom:4px;">Written by</div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;text-transform:uppercase;color:#FFFFFF;margin-bottom:6px;line-height:1;">BSM Editorial Staff</div>
    <p style="font-family:'Lora',serif;font-size:13px;color:#555555;line-height:1.65;margin:0;">The BestSportsMag editorial team covers trending sports stories across football, cricket, volleyball, and collectibles — powered by real-time Google Trends data and AI-assisted research.</p>
  </div>
</div>`;

  // ── Tags section ──
  const tagsSection = tagsHtml ? `
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:36px 0 0;padding-top:24px;border-top:1px solid #2E2E2E;max-width:720px;">
  <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#555555;margin-right:4px;">Tags:</span>
  ${tagsHtml}
</div>` : '';

  // ── Assemble full post content ──
  const fullContent = `
<!-- BSM Article Content v3 -->
<div class="bsm-generated-content" style="font-family:'Lora',serif;font-size:17px;line-height:1.85;color:#C8C8C8;max-width:720px;">

${bodyHtml}

${faqHtml}

${shareHtml}

${authorHtml}

${tagsSection}

</div>
<!-- /BSM Article Content v3 -->
`;

  return fullContent;
}

/* ── Affiliate Box ── */
function buildAffiliateBox(items) {
  const products = items.map(item => `
    <a href="#" style="display:flex;flex-direction:column;padding:16px;border-right:1px solid #2E2E2E;text-decoration:none;gap:8px;" target="_blank" rel="noopener sponsored">
      <div style="font-size:32px;text-align:center;padding:8px 0;">${item.icon || '⚽'}</div>
      <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:#E8FF00;">${item.brand || 'Brand'}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.1;flex:1;">${item.name || 'Product Name'}</div>
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:#555555;">From <strong style="color:#FFFFFF;">${item.price || '$0'}</strong></div>
      <div style="display:inline-block;background:#E8FF00;color:#000000;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:7px 12px;text-align:center;">Shop Now →</div>
    </a>`).join('');

  return `
<div style="background:#111111;border:1px solid #2E2E2E;border-top:3px solid #E8FF00;margin:36px 0;max-width:720px;overflow:hidden;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:#1A1A1A;border-bottom:1px solid #2E2E2E;">
    <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#E8FF00;">⚡ Trending Gear — via Impact.com</div>
    <div style="font-family:'DM Mono',monospace;font-size:8px;color:#2E2E2E;">*Affiliate links</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);">
    ${products}
  </div>
</div>`;
}

/* ── FAQ HTML ── */
function buildFaqHtml(faqItems) {
  if (!faqItems || faqItems.length === 0) return '';

  const items = faqItems.map((item, i) => `
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="border-bottom:1px solid #2E2E2E;overflow:hidden;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#111111;gap:16px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.2;flex:1;" itemprop="name">${item.q}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:#E8FF00;flex-shrink:0;line-height:1;width:24px;text-align:center;">+</div>
    </div>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer" style="padding:16px 20px 20px;background:#0A0A0A;font-family:'Lora',serif;font-size:15px;color:#C8C8C8;line-height:1.75;">
      <span itemprop="text">${item.a}</span>
    </div>
  </div>`).join('');

  return `
<div itemscope itemtype="https://schema.org/FAQPage" style="max-width:720px;margin:40px 0;border:1px solid #2E2E2E;overflow:hidden;">
  <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;text-transform:uppercase;color:#FFFFFF;padding:16px 20px;background:#1A1A1A;border-bottom:2px solid #E8FF00;">Frequently Asked Questions</div>
  ${items}
</div>`;
}

/* ================================================================
   ARTICLE PARSER
   Extracts structured data from Claude's text output
   ================================================================ */
function parseArticle(rawText) {
  const result = {
    title: '',
    slug: '',
    meta: '',
    sections: [],
    faq: [],
    tags: [],
    affiliateItems: []
  };

  // Extract header fields
  const titleMatch = rawText.match(/TITLE:\s*(.+?)(?:\n|$)/);
  const slugMatch  = rawText.match(/SLUG:\s*(.+?)(?:\n|$)/);
  const metaMatch  = rawText.match(/META:\s*(.+?)(?:\n|$)/);

  result.title = titleMatch ? titleMatch[1].trim() : '';
  result.slug  = slugMatch  ? slugMatch[1].trim().replace(/[^a-z0-9-]/g, '') : '';
  result.meta  = metaMatch  ? metaMatch[1].trim() : '';

  // Extract content block
  const contentMatch = rawText.match(/CONTENT:\s*([\s\S]+)/);
  const content = contentMatch ? contentMatch[1].trim() : rawText;

  // Extract FAQ before processing sections
  const faqMatch = content.match(/## Frequently Asked Questions\s*([\s\S]+?)(?=##|$)/i);
  if (faqMatch) {
    const faqText = faqMatch[1];
    const qaPairs = faqText.match(/\*\*Q:\*\*\s*(.+?)\s*\*\*A:\*\*\s*([\s\S]+?)(?=\*\*Q:\*\*|$)/gi);
    if (qaPairs) {
      qaPairs.forEach(pair => {
        const qM = pair.match(/\*\*Q:\*\*\s*(.+?)(?=\*\*A:\*\*)/i);
        const aM = pair.match(/\*\*A:\*\*\s*([\s\S]+?)$/i);
        if (qM && aM) {
          result.faq.push({ q: qM[1].trim(), a: aM[1].trim() });
        }
      });
    }
  }

  // Remove FAQ from content for section parsing
  const contentWithoutFaq = content.replace(/## Frequently Asked Questions[\s\S]+?(?=##|$)/i, '');

  // Extract affiliate placeholders
  const affMatches = content.matchAll(/\[AFFILIATE:\s*([^—\]]+)—\s*(\$[\d,]+)[^—\]]*—?\s*([^\]]*)\]/gi);
  const affIcons = ['👟', '⚽', '🕶️', '🏃', '🧤', '🃏'];
  let affIdx = 0;
  for (const m of affMatches) {
    const name   = m[1].trim();
    const price  = m[2].trim();
    const brand  = m[3].trim().replace(/via Impact\.com/i,'').trim() || 'Brand';
    result.affiliateItems.push({ name, price, brand, icon: affIcons[affIdx % affIcons.length] });
    affIdx++;
    if (result.affiliateItems.length >= 3) break;
  }

  // Amazon placeholders
  if (result.affiliateItems.length < 3) {
    const amzMatches = content.matchAll(/\[AMAZON:\s*([^—\]]+)—\s*(\$[\d,]+)[^\]]*\]/gi);
    for (const m of amzMatches) {
      result.affiliateItems.push({ name: m[1].trim(), price: m[2].trim(), brand: 'Amazon', icon: affIcons[affIdx % affIcons.length] });
      affIdx++;
      if (result.affiliateItems.length >= 3) break;
    }
  }

  // Fill affiliate items to 3 if needed
  const defaults = [
    { name:'Adidas Predator 30 Elite FG', price:'$229', brand:'Adidas', icon:'👟' },
    { name:'Puma Future 7 Pro WC Edition', price:'$189', brand:'Puma', icon:'⚽' },
    { name:'Oakley Meta Football Visor', price:'$149', brand:'Oakley', icon:'🕶️' }
  ];
  while (result.affiliateItems.length < 3) {
    result.affiliateItems.push(defaults[result.affiliateItems.length]);
  }

  // Extract tags from content
  const tagLine = rawText.match(/TAGS?:\s*(.+?)(?:\n|$)/i);
  if (tagLine) {
    result.tags = tagLine[1].split(',').map(t => t.trim()).filter(Boolean).slice(0, 8);
  }
  // Auto-generate tags from title if none found
  if (result.tags.length === 0 && result.title) {
    result.tags = ['World Cup 2026', 'Football', 'FIFA'];
  }

  // Split into sections by ## headings
  const sectionParts = contentWithoutFaq.split(/^## /gm);

  sectionParts.forEach((part, i) => {
    if (!part.trim()) return;

    let heading = '';
    let text = part;

    if (i > 0) {
      // Has a heading
      const nlIdx = part.indexOf('\n');
      if (nlIdx > -1) {
        heading = part.substring(0, nlIdx).trim();
        text = part.substring(nlIdx + 1);
      } else {
        heading = part.trim();
        text = '';
      }
    }

    // Clean text — remove affiliate/internal/amazon placeholders
    text = text
      .replace(/\[AFFILIATE:[^\]]+\]/gi, '')
      .replace(/\[AMAZON:[^\]]+\]/gi, '')
      .replace(/\[INTERNAL:\s*([^\]]+)\]/gi, '<a href="#" style="color:#E8FF00;text-decoration:underline;">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#FFFFFF;font-weight:600;">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote style="margin:36px 0;padding:24px 28px;background:#111111;border:1px solid #2E2E2E;border-left:4px solid #E8FF00;"><p style="font-family:\'Lora\',serif;font-size:20px;font-style:italic;color:#FFFFFF;line-height:1.55;margin:0;">$1</p></blockquote>');

    // Extract paragraphs
    const paragraphs = text.split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p && !p.startsWith('#') && !p.startsWith('*') && p.length > 20)
      .map(p => p.replace(/\n/g, ' '));

    if (paragraphs.length > 0 || heading) {
      result.sections.push({ heading, paragraphs });
    }
  });

  // Ensure we have at least one section
  if (result.sections.length === 0) {
    const paras = content.split(/\n\n+/).filter(p => p.trim().length > 20).map(p => p.trim());
    result.sections.push({ heading: '', paragraphs: paras });
  }

  return result;
}

/* ================================================================
   MAIN PROXY ENDPOINT
   ================================================================ */
app.post('/generate', async (req, res) => {
  try {
    const { prompt, system, model, max_tokens } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not set on server' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 4000,
        system: system || 'You are an expert sports journalist and SEO specialist.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error ? data.error.message : 'Anthropic API error',
        details: data
      });
    }

    const rawText = data.content[0].text;

    // Parse and build BSM HTML
    const parsed  = parseArticle(rawText);
    const bsmHtml = buildBSMHtml(parsed);

    res.json({
      content: [{ type: 'text', text: rawText }],
      bsm: {
        title:   parsed.title,
        slug:    parsed.slug,
        meta:    parsed.meta,
        html:    bsmHtml,
        raw:     rawText,
        tags:    parsed.tags,
        faqCount: parsed.faq.length,
        sectionCount: parsed.sections.length
      }
    });

  } catch (error) {
    console.error('Proxy v3 error:', error);
    res.status(500).json({ error: 'Proxy error: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log('TrendBlog AI Proxy v3.0 running on port ' + PORT);
});
