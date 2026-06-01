const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'TrendBlog AI Proxy is running', version: '3.2.0' });
});

/* ================================================================
   BSM HTML BUILDER v3.1
   FIXES:
   1. Removed Share/Author/Tags — Themer layout already outputs these
   2. Fixed FAQ regex to match Claude's actual output format
   3. Fixed affiliate box — use table layout instead of CSS grid
      (grid fails in some WordPress contexts)
   ================================================================ */

function buildBSMHtml(parsed) {
  const { sections, faq, affiliateItems } = parsed;

  // ── Article body ──
  let bodyHtml = '';
  sections.forEach(function(section, i) {
    if (i === 0) {
      bodyHtml += section.paragraphs.map(p => '<p style="font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px;">' + p + '</p>').join('\n');
      // Mid-ad slot
      bodyHtml += '\n<div style="background:#111111;border:1px dashed #2E2E2E;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:9px;color:#444;letter-spacing:.12em;text-transform:uppercase;min-height:90px;margin:36px 0;max-width:720px;"><!-- ADSENSE: paste 300x250 code here --> Advertisement</div>\n';
    } else {
      bodyHtml += '\n<h2 style="font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#FFFFFF;line-height:1;margin:40px 0 16px;padding-left:14px;border-left:3px solid #E8FF00;">' + escHtml(section.heading) + '</h2>\n';
      bodyHtml += section.paragraphs.map(p => '<p style="font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px;">' + p + '</p>').join('\n');
      // Affiliate box after section 2
      if (i === 2 && affiliateItems.length > 0) {
        bodyHtml += buildAffiliateBox(affiliateItems);
      }
    }
  });

  // ── FAQ ──
  const faqHtml = buildFaqHtml(faq);

  // ── Assemble — NO share/author/tags (Themer handles those) ──
  return '<!-- BSM Article Content v3.1 -->\n<div class="bsm-generated-content">\n' + bodyHtml + '\n' + faqHtml + '\n</div>\n<!-- /BSM Article Content v3.1 -->';
}

/* ── Escape HTML ── */
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Affiliate Box — table layout for WordPress compatibility ── */
function buildAffiliateBox(items) {
  const cells = items.slice(0,3).map(function(item) {
    return '<td style="width:33.33%;padding:16px;border-right:1px solid #2E2E2E;vertical-align:top;text-align:center;">'
      + '<div style="font-size:32px;padding:8px 0;">' + (item.icon || '⚽') + '</div>'
      + '<div style="font-family:\'DM Mono\',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:#E8FF00;margin-bottom:6px;">' + escHtml(item.brand) + '</div>'
      + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.1;margin-bottom:8px;">' + escHtml(item.name) + '</div>'
      + '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:#555555;margin-bottom:10px;">From <strong style="color:#FFFFFF;">' + escHtml(item.price) + '</strong></div>'
      + '<a href="#" style="display:block;background:#E8FF00;color:#000000;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 12px;text-decoration:none;" target="_blank" rel="noopener sponsored">Shop Now &rarr;</a>'
      + '</td>';
  }).join('');

  return '\n<div style="background:#111111;border:1px solid #2E2E2E;border-top:3px solid #E8FF00;margin:36px 0;max-width:720px;overflow:hidden;">'
    + '<div style="padding:10px 18px;background:#1A1A1A;border-bottom:1px solid #2E2E2E;">'
    + '<span style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#E8FF00;">&#9889; Trending Gear &mdash; via Impact.com</span>'
    + '<span style="font-family:\'DM Mono\',monospace;font-size:8px;color:#2E2E2E;float:right;">*Affiliate links</span>'
    + '</div>'
    + '<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr>' + cells + '</tr></tbody></table>'
    + '</div>\n';
}

/* ── FAQ — schema markup, always visible (no JS accordion needed) ── */
function buildFaqHtml(faqItems) {
  if (!faqItems || faqItems.length === 0) return '';

  const items = faqItems.map(function(item) {
    return '<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="border-bottom:1px solid #2E2E2E;">'
      + '<div style="padding:16px 20px;background:#111111;">'
      + '<strong style="font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:700;text-transform:uppercase;color:#E8FF00;display:block;margin-bottom:10px;" itemprop="name">' + escHtml(item.q) + '</strong>'
      + '<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">'
      + '<span itemprop="text" style="font-family:\'Lora\',serif;font-size:15px;color:#C8C8C8;line-height:1.75;">' + escHtml(item.a) + '</span>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  return '\n<div itemscope itemtype="https://schema.org/FAQPage" style="max-width:720px;margin:40px 0;border:1px solid #2E2E2E;overflow:hidden;">'
    + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:22px;font-weight:800;text-transform:uppercase;color:#FFFFFF;padding:16px 20px;background:#1A1A1A;border-bottom:2px solid #E8FF00;">Frequently Asked Questions</div>'
    + items
    + '</div>\n';
}

/* ================================================================
   ARTICLE PARSER v3.1
   More robust FAQ extraction — handles multiple Claude output formats
   ================================================================ */
function parseArticle(rawText) {
  const result = {
    title: '', slug: '', meta: '',
    sections: [], faq: [], tags: [], affiliateItems: []
  };

  // Header fields
  const titleM = rawText.match(/TITLE:\s*(.+?)(?:\n|$)/);
  const slugM  = rawText.match(/SLUG:\s*(.+?)(?:\n|$)/);
  const metaM  = rawText.match(/META:\s*(.+?)(?:\n|$)/);
  result.title = titleM ? titleM[1].trim() : '';
  result.slug  = slugM  ? slugM[1].trim().replace(/[^a-z0-9-]/g,'') : '';
  result.meta  = metaM  ? metaM[1].trim() : '';

  // Content block
  const contentM = rawText.match(/CONTENT:\s*([\s\S]+)/);
  const content  = contentM ? contentM[1].trim() : rawText;

  // ── FAQ extraction — try multiple patterns ──
  // Pattern 1: **Q:** ... **A:** ...
  const faqBlockM = content.match(/##\s*Frequently Asked Questions\s*([\s\S]+?)(?=\n##\s|$)/i);
  if (faqBlockM) {
    const block = faqBlockM[1];
    // Try bold Q/A format
    const boldPairs = [...block.matchAll(/\*\*Q:\*\*\s*(.+?)\n+\*\*A:\*\*\s*([\s\S]+?)(?=\*\*Q:\*\*|\n##|$)/gi)];
    if (boldPairs.length > 0) {
      boldPairs.forEach(m => {
        result.faq.push({ q: m[1].trim(), a: m[2].trim().replace(/\n/g,' ') });
      });
    } else {
      // Try Q: / A: format without bold
      const simplePairs = [...block.matchAll(/Q:\s*(.+?)\n+A:\s*([\s\S]+?)(?=Q:|\n##|$)/gi)];
      simplePairs.forEach(m => {
        result.faq.push({ q: m[1].trim(), a: m[2].trim().replace(/\n/g,' ') });
      });
    }
    // Fallback: split by numbered questions
    if (result.faq.length === 0) {
      const numberedPairs = [...block.matchAll(/\d+\.\s+\*\*(.+?)\*\*\s*\n+([\s\S]+?)(?=\d+\.|$)/gi)];
      numberedPairs.forEach(m => {
        result.faq.push({ q: m[1].trim(), a: m[2].trim().replace(/\n/g,' ') });
      });
    }
  }

  // Remove FAQ block from content before section parsing
  const contentNoFaq = content.replace(/##\s*Frequently Asked Questions[\s\S]+?(?=\n##\s|$)/i, '');

  // ── Affiliate extraction ──
  const affIcons = ['👟','⚽','🕶️','🏃','🧤','🃏'];
  let affIdx = 0;

  // Try em-dash format: [AFFILIATE: Name — $Price — Brand]
  const affRe = /\[AFFILIATE:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]—]*[\s—]*([^\]]*)\]/gi;
  for (const m of content.matchAll(affRe)) {
    const brand = m[3].trim().replace(/via Impact\.com/i,'').trim() || 'Brand';
    result.affiliateItems.push({ name:m[1].trim(), price:m[2].trim(), brand, icon:affIcons[affIdx%affIcons.length] });
    affIdx++;
    if (result.affiliateItems.length >= 3) break;
  }

  // Amazon
  for (const m of content.matchAll(/\[AMAZON:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]]*\]/gi)) {
    if (result.affiliateItems.length >= 3) break;
    result.affiliateItems.push({ name:m[1].trim(), price:m[2].trim(), brand:'Amazon', icon:affIcons[affIdx%affIcons.length] });
    affIdx++;
  }

  // Fill to 3
  const defaults = [
    { name:'Adidas Predator 30 Elite FG', price:'$229', brand:'Adidas', icon:'👟' },
    { name:'Puma Future 7 Pro WC Edition', price:'$189', brand:'Puma',   icon:'⚽' },
    { name:'Oakley Meta Football Visor',   price:'$149', brand:'Oakley', icon:'🕶️' }
  ];
  while (result.affiliateItems.length < 3) {
    result.affiliateItems.push(defaults[result.affiliateItems.length]);
  }

  // Tags
  const tagLineM = rawText.match(/TAGS?:\s*(.+?)(?:\n|$)/i);
  if (tagLineM) {
    result.tags = tagLineM[1].split(',').map(t=>t.trim()).filter(Boolean).slice(0,8);
  }
  if (result.tags.length === 0) result.tags = ['World Cup 2026','Football','FIFA'];

  // ── Section parsing ──
  const parts = contentNoFaq.split(/^## /m);
  parts.forEach(function(part, i) {
    if (!part.trim()) return;
    let heading = '', text = part;
    if (i > 0) {
      const nl = part.indexOf('\n');
      if (nl > -1) { heading = part.slice(0,nl).trim(); text = part.slice(nl+1); }
      else { heading = part.trim(); text = ''; }
    }
    // Clean placeholders
    text = text
      .replace(/\[AFFILIATE:[^\]]+\]/gi,'')
      .replace(/\[AMAZON:[^\]]+\]/gi,'')
      .replace(/\[INTERNAL:\s*([^\]]+)\]/gi,'<a href="#" style="color:#E8FF00;text-decoration:underline;">$1</a>')
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#FFFFFF;font-weight:600;">$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/^> (.+)$/gm,'<blockquote style="margin:36px 0;padding:24px 28px;background:#111111;border:1px solid #2E2E2E;border-left:4px solid #E8FF00;"><p style="font-size:18px;font-style:italic;color:#FFFFFF;line-height:1.55;margin:0;">$1</p></blockquote>');

    const paragraphs = text.split(/\n\n+/)
      .map(p=>p.trim())
      .filter(p=>p && !p.startsWith('#') && p.length > 20)
      .map(p=>p.replace(/\n/g,' '));

    if (paragraphs.length > 0 || heading) {
      result.sections.push({ heading, paragraphs });
    }
  });

  if (result.sections.length === 0) {
    const paras = content.split(/\n\n+/).filter(p=>p.trim().length>20).map(p=>p.trim());
    result.sections.push({ heading:'', paragraphs:paras });
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
        messages: [{ role:'user', content:prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ? data.error.message : 'API error', details: data });
    }

    const rawText = data.content[0].text;
    const parsed  = parseArticle(rawText);
    const bsmHtml = buildBSMHtml(parsed);

    res.json({
      content: [{ type:'text', text:rawText }],
      bsm: {
        title:        parsed.title,
        slug:         parsed.slug,
        meta:         parsed.meta,
        html:         bsmHtml,
        raw:          rawText,
        tags:         parsed.tags,
        faqCount:     parsed.faq.length,
        sectionCount: parsed.sections.length
      }
    });

  } catch (error) {
    console.error('Proxy v3.2 error:', error);
    res.status(500).json({ error: 'Proxy error: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log('TrendBlog AI Proxy v3.2 running on port ' + PORT);
});
