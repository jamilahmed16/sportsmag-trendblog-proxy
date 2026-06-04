const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin:'*', methods:['POST','GET','OPTIONS'], allowedHeaders:['Content-Type','Authorization'] }));
app.use(express.json({ limit:'10mb' }));

app.get('/', (req, res) => {
  res.json({ status:'TrendBlog AI Proxy is running', version:'4.1.0' });
});

/* ================================================================
   ENDPOINT 1 — /trends
   Fetches REAL trending sports topics from Google Trends via SerpAPI
   Falls back to curated World Cup topics if SerpAPI unavailable
   ================================================================ */

app.get('/trends', async (req, res) => {
  const serpKey  = process.env.SERP_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;

  if (!serpKey && !braveKey) {
    return res.json({ source:'fallback', trends: getFallbackTrends() });
  }

  const ts = Date.now();
  let trends = [];
  let source = 'fallback';
  let lastError = '';

  // ── Attempt 1: google_trends_trending_now (realtime sports) ──
  if (serpKey && !trends.length) {
    try {
      const url = 'https://serpapi.com/search.json?engine=google_trends_trending_now'
        + '&frequency=realtime&geo=US&category=15'
        + '&no_cache=true&_=' + ts
        + '&api_key=' + serpKey;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        const items = d.realtime_searches || d.trending_searches || [];
        if (items.length) {
          trends = items.slice(0,15).map(function(item, i) {
            const title   = item.title || item.query || item.topic || 'Trending';
            const traffic = item.formattedTraffic || item.traffic || item.search_volume || '50K+';
            const pct     = item.increase || item.percentage_change || '+500%';
            const vol     = parseInt((traffic+'').replace(/[^0-9]/g,'')) || 0;
            let badge = 'rising';
            if ((pct+'').includes('Breakout') || vol >= 200000) badge = 'breakout';
            else if (vol >= 50000) badge = 'hot';
            return { name:title, vol:typeof traffic==='string'?traffic:Math.round(vol/1000)+'K+', badge, pct:typeof pct==='string'?pct:'+'+pct+'%', started:(i<3?(i+1)*2:(i+1)*3)+'h ago' };
          });
          source = 'Google Trends Realtime';
          console.log('Trends source 1 (realtime): ' + trends.length + ' topics');
        }
      } else { lastError = 'trending_now status ' + r.status; }
    } catch(e) { lastError = 'trending_now: ' + e.message; console.log('Attempt 1 failed:', e.message); }
  }

  // ── Attempt 2: google_trends with sports keywords ──
  if (serpKey && !trends.length) {
    try {
      const sportKws = ['World Cup 2026','football boots 2026','Premier League','Champions League','NFL 2026'];
      const url = 'https://serpapi.com/search.json?engine=google_trends'
        + '&q=' + encodeURIComponent(sportKws.join(','))
        + '&geo=US&data_type=TIMESERIES'
        + '&no_cache=true&_=' + ts
        + '&api_key=' + serpKey;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        const rising = (d.related_queries && d.related_queries.rising) || [];
        if (rising.length) {
          trends = rising.slice(0,15).map(function(item, i) {
            return { name:item.query||'Trending', vol:'50K+', badge:i<3?'breakout':'hot', pct:item.value?'+'+item.value+'%':'+500%', started:(i+1)*2+'h ago' };
          });
          source = 'Google Trends Rising';
          console.log('Trends source 2 (rising): ' + trends.length + ' topics');
        }
      } else { lastError = 'trends status ' + r.status; }
    } catch(e) { lastError = 'trends: ' + e.message; console.log('Attempt 2 failed:', e.message); }
  }

  // ── Attempt 3: Google News sports via SerpAPI ──
  if (serpKey && !trends.length) {
    try {
      const newsUrl = 'https://serpapi.com/search.json?engine=google_news'
        + '&q=football+World+Cup+2026+sports'
        + '&gl=us&hl=en&no_cache=true&_=' + ts
        + '&api_key=' + serpKey;
      const r = await fetch(newsUrl);
      if (r.ok) {
        const d = await r.json();
        const news = d.news_results || [];
        if (news.length) {
          trends = news.slice(0,15).map(function(item, i) {
            return { name:item.title||'Sports News', vol:'100K+', badge:i<3?'breakout':i<7?'hot':'rising', pct:'+500%', started:item.date||((i+1)*2+'h ago') };
          });
          source = 'Google News Sports';
          console.log('Trends source 3 (news): ' + trends.length + ' topics');
        }
      }
    } catch(e) { lastError = 'news: ' + e.message; console.log('Attempt 3 failed:', e.message); }
  }

  // ── Attempt 4: Brave Search for live sports news ──
  if (braveKey && !trends.length) {
    try {
      const braveUrl = 'https://api.search.brave.com/res/v1/news/search?q=football+World+Cup+2026+trending&count=15&country=us&freshness=pd';
      const r = await fetch(braveUrl, { headers:{ 'Accept':'application/json','X-Subscription-Token':braveKey } });
      if (r.ok) {
        const d = await r.json();
        const results = d.results || [];
        if (results.length) {
          trends = results.slice(0,15).map(function(item, i) {
            return { name:item.title||'Sports Trend', vol:'50K+', badge:i<3?'breakout':i<7?'hot':'rising', pct:'+300%', started:item.age||((i+1)*2+'h ago') };
          });
          source = 'Brave News';
          console.log('Trends source 4 (brave): ' + trends.length + ' topics');
        }
      }
    } catch(e) { lastError = 'brave: ' + e.message; console.log('Attempt 4 failed:', e.message); }
  }

  // ── Final fallback ──
  if (!trends.length) {
    console.log('All trend sources failed (' + lastError + ') — using static fallback');
    trends = getFallbackTrends();
    source = 'fallback';
  }

  res.json({ source, trends, lastError:lastError||'' });
});

function getFallbackTrends() {
  return [
    { name:'FIFA World Cup 2026 host cities guide',    vol:'500K+', badge:'breakout', pct:'+1,000%', started:'2h ago' },
    { name:'World Cup 2026 group stage draw results',  vol:'200K+', badge:'breakout', pct:'+1,000%', started:'4h ago' },
    { name:'Messi World Cup 2026 Argentina squad',     vol:'200K+', badge:'breakout', pct:'+1,000%', started:'3h ago' },
    { name:'World Cup 2026 schedule fixtures dates',   vol:'200K+', badge:'hot',      pct:'+800%',   started:'6h ago' },
    { name:'USA World Cup 2026 squad roster',          vol:'100K+', badge:'hot',      pct:'+650%',   started:'5h ago' },
    { name:'World Cup 2026 tickets how to buy',        vol:'100K+', badge:'hot',      pct:'+500%',   started:'11h ago' },
    { name:'England World Cup 2026 squad news',        vol:'100K+', badge:'hot',      pct:'+450%',   started:'8h ago' },
    { name:'Brazil World Cup 2026 lineup prediction',  vol:'100K+', badge:'hot',      pct:'+600%',   started:'7h ago' },
    { name:'France World Cup 2026 team preview',       vol:'100K+', badge:'rising',   pct:'+400%',   started:'9h ago' },
    { name:'World Cup 2026 bracket predictions',       vol:'50K+',  badge:'rising',   pct:'+400%',   started:'13h ago' },
    { name:'World Cup 2026 best football boots',       vol:'50K+',  badge:'rising',   pct:'+300%',   started:'16h ago' },
    { name:'Topps Chrome World Cup 2026 cards',        vol:'50K+',  badge:'rising',   pct:'+500%',   started:'14h ago' }
  ];
}

/* ================================================================
   ENDPOINT 1b — /serp — SERP analysis with PAA for any keyword
   ================================================================ */
app.post('/serp', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.status(400).json({ error:'Missing keyword' });
  try {
    const serpKey  = process.env.SERP_API_KEY;
    const braveKey = process.env.BRAVE_API_KEY;
    const results = []; let paa = [], related = [], source = 'none';
    if (serpKey) {
      const url = 'https://serpapi.com/search.json?engine=google&q='
        + encodeURIComponent(keyword)
        + '&num=10&gl=us&hl=en&no_cache=true&api_key=' + serpKey;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        source = 'SerpAPI';
        (d.organic_results||[]).slice(0,8).forEach(function(item) {
          results.push({ title:item.title||'', url:item.link||'', description:item.snippet||'', position:item.position||0 });
        });
        paa     = (d.related_questions||[]).slice(0,7).map(function(q){ return { q:q.question||'', a:q.answer||q.snippet||'' }; });
        related = (d.related_searches||[]).slice(0,6).map(function(s){ return s.query||''; });
      }
    }
    if (!results.length && braveKey) {
      const braveRes = await searchBrave(keyword);
      source = 'Brave';
      braveRes.forEach(function(item) { results.push({ title:item.title, url:item.url, description:item.description, position:0 }); });
    }
    res.json({ keyword, results, paa, related, source, total:results.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

/* ================================================================
   ENDPOINT 2 — /generate
   Flow: extract topic → Brave Search (facts) → SerpAPI fallback
         → inject context into Claude → parse → build BSM HTML
   ================================================================ */

/* ── Web Search: Brave primary, SerpAPI fallback ── */
async function searchBrave(query) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('No Brave API key');
  const url = 'https://api.search.brave.com/res/v1/web/search?q='
    + encodeURIComponent(query) + '&count=5&search_lang=en&country=us&freshness=pd';
  const r = await fetch(url, {
    headers: { 'Accept':'application/json', 'Accept-Encoding':'gzip', 'X-Subscription-Token':key }
  });
  if (!r.ok) throw new Error('Brave failed: ' + r.status);
  const data = await r.json();
  return ((data.web && data.web.results) ? data.web.results : []).slice(0,5).map(function(item) {
    return { title:item.title||'', url:item.url||'', description:item.description||'', age:item.age||'' };
  });
}

async function searchSerp(query) {
  const key = process.env.SERP_API_KEY;
  if (!key) throw new Error('No SerpAPI key');
  const url = 'https://serpapi.com/search.json?engine=google&q='
    + encodeURIComponent(query) + '&num=5&gl=us&hl=en&tbs=qdr:d&api_key=' + key;
  const r = await fetch(url);
  if (!r.ok) throw new Error('SerpAPI failed: ' + r.status);
  const data = await r.json();
  return (data.organic_results||[]).slice(0,5).map(function(item) {
    return { title:item.title||'', url:item.link||'', description:item.snippet||'', age:item.date||'' };
  });
}

async function getSearchContext(query) {
  let results = [], source = 'none';
  try {
    results = await searchBrave(query);
    source  = 'Brave Search';
    console.log('Brave: ' + results.length + ' results for: ' + query);
  } catch(e) {
    console.log('Brave failed (' + e.message + '), trying SerpAPI...');
    try {
      results = await searchSerp(query);
      source  = 'SerpAPI';
      console.log('SerpAPI: ' + results.length + ' results for: ' + query);
    } catch(e2) {
      console.log('Both search APIs failed: ' + e2.message);
    }
  }
  if (!results.length) return { context:'', source:'none', resultsCount:0 };
  const context = results.map(function(r,i) {
    return 'Source '+(i+1)+': '+r.title+'\nURL: '+r.url+'\n'+(r.age?'Date: '+r.age+'\n':'')+'Summary: '+r.description;
  }).join('\n\n');
  return { context, source, resultsCount:results.length };
}

/* ── HTML Helpers ── */
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildAffiliateBox(items) {
  const cells = items.slice(0,3).map(function(item) {
    return '<td style="width:33.33%;padding:16px;border-right:1px solid #2E2E2E;vertical-align:top;text-align:center;">'
      +'<div style="font-size:32px;padding:8px 0;">'+(item.icon||'⚽')+'</div>'
      +'<div style="font-family:\'DM Mono\',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:#E8FF00;margin-bottom:6px;">'+escHtml(item.brand)+'</div>'
      +'<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;color:#FFFFFF;line-height:1.1;margin-bottom:8px;">'+escHtml(item.name)+'</div>'
      +'<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:#555555;margin-bottom:10px;">From <strong style="color:#FFFFFF;">'+escHtml(item.price)+'</strong></div>'
      +'<a href="#" style="display:block;background:#E8FF00;color:#000000;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 12px;text-decoration:none;" rel="noopener sponsored">Shop Now &rarr;</a>'
      +'</td>';
  }).join('');
  return '\n<div style="background:#111111;border:1px solid #2E2E2E;border-top:3px solid #E8FF00;margin:36px 0;max-width:720px;overflow:hidden;">'
    +'<div style="padding:10px 18px;background:#1A1A1A;border-bottom:1px solid #2E2E2E;">'
    +'<span style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#E8FF00;">&#9889; Trending Gear &mdash; via Impact.com</span>'
    +'<span style="font-family:\'DM Mono\',monospace;font-size:8px;color:#2E2E2E;float:right;">*Affiliate links</span>'
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr>'+cells+'</tr></tbody></table>'
    +'</div>\n';
}

function buildFaqHtml(faqItems) {
  if (!faqItems || !faqItems.length) return '';
  var showItems = faqItems.slice(0, 7);
  var itemsHtml = showItems.map(function(item) {
    var q = (item.q||'').replace(/\*\*/g,'').trim();
    var a = (item.a||'').replace(/\*\*/g,'').trim();
    return '<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" style="border-bottom:1px solid #2E2E2E;">'
      + '<div style="padding:16px 20px;background:#111111;">'
      + '<strong style="font-size:17px;font-weight:700;text-transform:uppercase;color:#E8FF00;display:block;margin-bottom:10px;" itemprop="name">' + escHtml(q) + '</strong>'
      + '<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">'
      + '<div itemprop="text" style="font-size:15px;color:#C8C8C8;line-height:1.75;">' + escHtml(a) + '</div>'
      + '</div></div></div>';
  }).join('');
  var schemaData = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    'mainEntity': showItems.map(function(item) {
      return { '@type':'Question', 'name':(item.q||'').replace(/\*\*/g,'').trim(),
        'acceptedAnswer':{'@type':'Answer','text':(item.a||'').replace(/\*\*/g,'').trim()} };
    })
  };
  var speakableData = {
    '@context':'https://schema.org','@type':'WebPage',
    'speakable':{'@type':'SpeakableSpecification','cssSelector':['.bsm-faq-wrap']}
  };
  return '\n<script type="application/ld+json">' + JSON.stringify(schemaData) + '<\/script>'
    + '<script type="application/ld+json">' + JSON.stringify(speakableData) + '<\/script>'
    + '<div class="bsm-faq-wrap" itemscope itemtype="https://schema.org/FAQPage" style="max-width:720px;margin:40px 0;border:1px solid #2E2E2E;overflow:hidden;">'
    + '<div style="font-size:22px;font-weight:800;text-transform:uppercase;color:#FFFFFF;padding:16px 20px;background:#1A1A1A;border-bottom:2px solid #E8FF00;">Frequently Asked Questions</div>'
    + itemsHtml + '</div>\n';
}

function buildBSMHtml(parsed) {
  const { sections, faq, affiliateItems } = parsed;
  let body = '';
  sections.forEach(function(s, i) {
    if (i === 0) {
      body += s.paragraphs.map(p=>'<p style="font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px;">'+p+'</p>').join('\n');
      body += '\n<div style="background:#111111;border:1px dashed #2E2E2E;text-align:center;font-family:monospace;font-size:9px;color:#444;letter-spacing:.12em;text-transform:uppercase;min-height:90px;line-height:90px;margin:36px 0;max-width:720px;"><!-- ADSENSE: paste code here --> Advertisement</div>\n';
    } else {
      body += '\n<h2 style="font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#FFFFFF;line-height:1;margin:40px 0 16px;padding-left:14px;border-left:3px solid #E8FF00;">'+escHtml(s.heading)+'</h2>\n';
      body += s.paragraphs.map(p=>'<p style="font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px;">'+p+'</p>').join('\n');
      if (i===2 && affiliateItems.length>0) body += buildAffiliateBox(affiliateItems);
    }
  });
  return '<!-- BSM v4.1 -->\n<div class="bsm-generated-content">\n'+body+'\n'+buildFaqHtml(faq)+'\n</div>';
}

/* ── Article Parser ── */
function parseArticle(rawText) {
  const result = { title:'',slug:'',meta:'',sections:[],faq:[],tags:[],affiliateItems:[] };
  const tM=rawText.match(/TITLE:\s*(.+?)(?:\n|$)/); result.title=tM?tM[1].trim():'';
  const sM=rawText.match(/SLUG:\s*(.+?)(?:\n|$)/);  result.slug=sM?sM[1].trim().replace(/[^a-z0-9-]/g,''):'';
  const mM=rawText.match(/META:\s*(.+?)(?:\n|$)/);  result.meta=mM?mM[1].trim():'';
  const cM=rawText.match(/CONTENT:\s*([\s\S]+)/);
  const content=cM?cM[1].trim():rawText;

  // FAQ
  const faqBM=content.match(/##\s*Frequently Asked Questions\s*([\s\S]+?)(?=\n##\s|$)/i);
  if (faqBM) {
    const block=faqBM[1];
    const chunks=block.split(/\*\*Q:\*\*/i).filter(s=>s.trim());
    chunks.forEach(function(chunk) {
      const aIdx=chunk.search(/\*\*A:\*\*/i);
      if (aIdx===-1) return;
      let q=chunk.slice(0,aIdx).replace(/\*\*/g,'').replace(/^[:\s]+/,'').trim();
      let a=chunk.slice(aIdx).replace(/^\*\*A:\*\*/i,'').replace(/\*\*Q:[\s\S]*/i,'').replace(/\*\*/g,'').replace(/\*By BSM[^*]*\*/i,'').trim().replace(/\n/g,' ').replace(/\s+/g,' ');
      if (q&&a&&q.length>3) result.faq.push({q,a});
    });
    if (!result.faq.length) {
      [...block.matchAll(/Q:\s*(.+?)\n+A:\s*([\s\S]+?)(?=Q:|\n##|$)/gi)].forEach(m=>result.faq.push({q:m[1].trim(),a:m[2].trim().replace(/\n/g,' ')}));
    }
  }

  const noFaq=content.replace(/##\s*Frequently Asked Questions[\s\S]+?(?=\n##\s|$)/i,'');

  // Affiliates
  const icons=['👟','⚽','🕶️','🏃','🧤','🃏']; let ai=0;
  for (const m of content.matchAll(/\[AFFILIATE:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]—]*[\s—]*([^\]]*)\]/gi)) {
    const brand=m[3].trim().replace(/via Impact\.com/i,'').trim()||'Brand';
    result.affiliateItems.push({name:m[1].trim(),price:m[2].trim(),brand,icon:icons[ai%icons.length]}); ai++;
    if (result.affiliateItems.length>=3) break;
  }
  for (const m of content.matchAll(/\[AMAZON:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]]*\]/gi)) {
    if (result.affiliateItems.length>=3) break;
    result.affiliateItems.push({name:m[1].trim(),price:m[2].trim(),brand:'Amazon',icon:icons[ai%icons.length]}); ai++;
  }
  const defs=[{name:'Adidas Predator 30 Elite FG',price:'$229',brand:'Adidas',icon:'👟'},{name:'Puma Future 7 Pro WC Edition',price:'$189',brand:'Puma',icon:'⚽'},{name:'Oakley Meta Football Visor',price:'$149',brand:'Oakley',icon:'🕶️'}];
  while (result.affiliateItems.length<3) result.affiliateItems.push(defs[result.affiliateItems.length]);

  // Tags
  const tagM=rawText.match(/TAGS?:\s*(.+?)(?:\n|$)/i);
  result.tags=tagM?tagM[1].split(',').map(t=>t.trim()).filter(Boolean).slice(0,8):['World Cup 2026','Football','FIFA'];

  // Sections
  noFaq.split(/^## /m).forEach(function(part,i) {
    if (!part.trim()) return;
    let heading='',text=part;
    if (i>0) { const nl=part.indexOf('\n'); if(nl>-1){heading=part.slice(0,nl).trim();text=part.slice(nl+1);}else{heading=part.trim();text='';} }
    text=text
      .replace(/\[AFFILIATE:[^\]]+\]/gi,'').replace(/\[AMAZON:[^\]]+\]/gi,'')
      .replace(/\[INTERNAL:\s*([^\]]+)\]/gi,'<a href="#" style="color:#E8FF00;text-decoration:underline;">$1</a>')
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#FFFFFF;font-weight:600;">$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');
    const paragraphs=text.split(/\n\n+/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')&&p.length>20).map(p=>p.replace(/\n/g,' '));
    if (paragraphs.length>0||heading) result.sections.push({heading,paragraphs});
  });
  if (!result.sections.length) {
    result.sections.push({heading:'',paragraphs:content.split(/\n\n+/).filter(p=>p.trim().length>20).map(p=>p.trim())});
  }
  return result;
}

/* ── Main generate endpoint ── */
app.post('/generate', async (req, res) => {
  try {
    const { prompt, system, model, max_tokens } = req.body;
    if (!prompt) return res.status(400).json({ error:'Missing prompt' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error:'API key not set' });

    // Extract topic
    const topicM = prompt.match(/about:\s*"([^"]+)"/i) || prompt.match(/"([^"]{10,80})"/);
    const topic  = topicM ? topicM[1] : prompt.slice(0,80);

    // Search for current facts + PAA questions in parallel
    const [search, paaData] = await Promise.all([
      getSearchContext(topic),
      (async function() {
        const sk = process.env.SERP_API_KEY;
        if (!sk) return [];
        try {
          const r = await fetch('https://serpapi.com/search.json?engine=google&q='
            + encodeURIComponent(topic)
            + '&num=5&gl=us&hl=en&no_cache=true&api_key=' + sk);
          if (!r.ok) return [];
          const d = await r.json();
          return (d.related_questions||[]).slice(0,7).map(function(q){ return { q:q.question||'', a:q.answer||q.snippet||'' }; });
        } catch(e) { return []; }
      })()
    ]);
    console.log('PAA questions: ' + paaData.length);

    // Build enriched system prompt
    let sys = system || 'You are an expert sports journalist and SEO specialist.';

    // Add PAA context so Claude uses real FAQ questions
    let paaCtx = '';
    if (paaData && paaData.length > 0) {
      paaCtx = '\n\n=== PEOPLE ALSO ASK — use these as FAQ questions (4-7 required) ===\n'
        + paaData.map(function(p,i){ return (i+1)+'. Q: '+p.q+(p.a?'\n   A hint: '+p.a.slice(0,200):''); }).join('\n')
        + '\n=== END PAA ===';
    }
    if (search.resultsCount > 0) {
      sys += paaCtx;
      sys += '\n\n=== CURRENT NEWS CONTEXT (from '+search.source+') ===\n\n'
        + search.context
        + '\n\n=== END CONTEXT ===\n\n'
        + 'RULES:\n'
        + '1. Use the context above as your PRIMARY factual source\n'
        + '2. Only include facts present in the context — do not invent statistics, squad names, scores or quotes\n'
        + '3. Write around any missing detail rather than fabricating it\n'
        + '4. Current date: ' + new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    } else {
      sys += paaCtx;
      sys += '\n\nCurrent date: ' + new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})
        + '\nNote: live search unavailable — use training knowledge carefully and avoid fabricating specifics.';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body:JSON.stringify({ model:model||'claude-sonnet-4-20250514', max_tokens:max_tokens||4000, system:sys, messages:[{role:'user',content:prompt}] })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error:data.error?data.error.message:'API error', details:data });

    const rawText = data.content[0].text;
    const parsed  = parseArticle(rawText);
    const bsmHtml = buildBSMHtml(parsed);

    res.json({
      content:[{type:'text',text:rawText}],
      bsm:{ title:parsed.title, slug:parsed.slug, meta:parsed.meta, html:bsmHtml, raw:rawText, tags:parsed.tags, faqCount:parsed.faq.length, sectionCount:parsed.sections.length, searchSource:search.source, searchResults:search.resultsCount }
    });

  } catch(error) {
    console.error('v4.1 error:',error);
    res.status(500).json({ error:'Proxy error: '+error.message });
  }
});

app.listen(PORT, () => console.log('TrendBlog AI Proxy v4.3 running on port ' + PORT));
