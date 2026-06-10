const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin:'*', methods:['POST','GET','OPTIONS'], allowedHeaders:['Content-Type','Authorization'] }));
app.use(express.json({ limit:'10mb' }));

app.get('/', (req, res) => {
  res.json({ status:'TrendBlog AI Proxy is running', version:'5.1.0' });
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
  const geo = req.query.geo || 'US';
  const geoParam = (geo === 'GLOBAL') ? '' : ('&geo=' + geo);
  let trends = [];
  let source = 'fallback';
  let lastError = '';

  // ── Attempt 1: google_trends_trending_now (realtime sports) ──
  if (serpKey && !trends.length) {
    try {
      const url = 'https://serpapi.com/search.json?engine=google_trends_trending_now'
        + '&frequency=realtime' + geoParam + '&category=15'
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
        + '&geo=' + geo + '&data_type=TIMESERIES'
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
        + '&gl=' + (geo==='GLOBAL'?'us':geo.toLowerCase()) + '&hl=en&no_cache=true&_=' + ts
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
      +'<div style="font-family:var(--f-m,monospace);font-size:10px;color:#555;padding:4px 0;text-transform:uppercase;letter-spacing:.1em">'+(item.icon||'gear')+'</div>'
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


/* ═══════════════════════════════════════════════════════════════════
   BSM ARTICLE TEMPLATES v5.0
   6 conversion-optimised designs — SEO + AI Search structured
═══════════════════════════════════════════════════════════════════ */

/* ── Shared helpers ── */
function adSlot(label) {
  return '<div style="background:#0d0d0d;border:1px dashed #2E2E2E;text-align:center;font-family:monospace;font-size:9px;color:#333;letter-spacing:.12em;text-transform:uppercase;min-height:90px;display:flex;align-items:center;justify-content:center;margin:28px 0;max-width:720px;"><!-- ADSENSE:' + (label||'728x90') + ':paste code here --></div>';
}

function bsmH2(text) {
  return '<h2 style="font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#FFFFFF;line-height:1;margin:40px 0 16px;padding-left:14px;border-left:3px solid #E8FF00;">' + escHtml(text) + '</h2>';
}

function bsmP(text) {
  return '<p style="font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px;">' + text + '</p>';
}

function faqBlock(faqItems) {
  if (!faqItems || !faqItems.length) return '';
  var items = faqItems.slice(0,7);
  var schema = JSON.stringify({
    '@context':'https://schema.org','@type':'FAQPage',
    'mainEntity': items.map(function(item) {
      return { '@type':'Question','name':(item.q||'').replace(/\*\*/g,'').trim(),
        'acceptedAnswer':{'@type':'Answer','text':(item.a||'').replace(/\*\*/g,'').trim()} };
    })
  });
  var speakable = JSON.stringify({
    '@context':'https://schema.org','@type':'WebPage',
    'speakable':{'@type':'SpeakableSpecification','cssSelector':['.bsm-faq']}
  });
  var itemsHtml = items.map(function(item) {
    return '<div class="bsm-faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">'
      + '<div class="bsm-faq-q" itemprop="name">' + escHtml((item.q||'').replace(/\*\*/g,'').trim()) + '</div>'
      + '<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">'
      + '<div class="bsm-faq-a" itemprop="text">' + escHtml((item.a||'').replace(/\*\*/g,'').trim()) + '</div>'
      + '</div></div>';
  }).join('');
  return '<script type="application/ld+json">' + schema + '<\/script>\n'
    + '<script type="application/ld+json">' + speakable + '<\/script>\n'
    + '<div class="bsm-faq" itemscope itemtype="https://schema.org/FAQPage">'
    + '<div class="bsm-faq-title">Frequently Asked Questions</div>'
    + itemsHtml + '</div>';
}

function articleSchema(parsed, type) {
  var typeMap = { news:'NewsArticle', analysis:'AnalysisNewsArticle', preview:'SportsEvent', guide:'HowTo', listicle:'ItemList', review:'Review' };
  return '<script type="application/ld+json">' + JSON.stringify({
    '@context':'https://schema.org','@type': typeMap[type] || 'BlogPosting',
    'headline': parsed.title, 'description': parsed.meta,
    'author':{'@type':'Organization','name':'BSM Editorial Staff','url':'https://bestsportsmag.com'},
    'publisher':{'@type':'Organization','name':'BestSportsMag','url':'https://bestsportsmag.com','logo':{'@type':'ImageObject','url':'https://bestsportsmag.com/logo.png'}},
    'datePublished': new Date().toISOString(), 'dateModified': new Date().toISOString(),
    'keywords': (parsed.tags||[]).join(', '),
    'mainEntityOfPage':{'@type':'WebPage','@id':'https://bestsportsmag.com/'+parsed.slug}
  }) + '<\/script>\n';
}

var BSM_BASE_CSS = [
  '@import url(\'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Lora:ital,wght@0,400;0,600;1,400;1,500&family=DM+Mono:wght@300;400;500&display=swap\');',
  '.bsm-article{max-width:720px;margin:0 auto;color:#C8C8C8}',
  '.bsm-h2{font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#fff;line-height:1;margin:40px 0 16px;padding-left:14px;border-left:3px solid #E8FF00}',
  '.bsm-p{font-family:\'Lora\',serif;font-size:17px;line-height:1.85;color:#C8C8C8;margin-bottom:22px}',
  '.bsm-faq{border:1px solid #2E2E2E;margin:40px 0;max-width:720px;overflow:hidden}',
  '.bsm-faq-title{font-family:\'Barlow Condensed\',sans-serif;font-size:22px;font-weight:800;text-transform:uppercase;color:#fff;padding:14px 20px;background:#1A1A1A;border-bottom:2px solid #E8FF00}',
  '.bsm-faq-item{border-bottom:1px solid #2E2E2E;padding:16px 20px;background:#111}',
  '.bsm-faq-item:last-child{border-bottom:none}',
  '.bsm-faq-q{font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:700;text-transform:uppercase;color:#E8FF00;margin-bottom:8px}',
  '.bsm-faq-a{font-family:\'Lora\',serif;font-size:15px;color:#C8C8C8;line-height:1.75}',
  '.bsm-disc{font-family:\'DM Mono\',monospace;font-size:10px;color:#444;padding:8px 0;border-top:1px solid #1a1a1a;margin-top:20px}'
].join('\n');

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 1 — BREAKING NEWS
   Goal: AdSense RPM + pageviews
   Schema: NewsArticle + Speakable
──────────────────────────────────────────────────────────────── */
function buildNewsTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var date     = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  var time     = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

  var body = '';

  // Opening section — no H2, just paragraphs
  if (sections[0]) {
    body += sections[0].paragraphs.map(bsmP).join('');
  }

  // Ad slot 1 — top of content
  body += adSlot('728x90:top');

  // Remaining sections
  sections.slice(1).forEach(function(s, i) {
    if (s.heading) body += bsmH2(s.heading);
    body += s.paragraphs.map(bsmP).join('');
    // Ad after section 2
    if (i === 1) body += adSlot('300x250:mid');
  });

  // FAQ
  body += faqBlock(faq);

  // Speakable schema for AI assistants
  var speakable = JSON.stringify({
    '@context':'https://schema.org','@type':'WebPage',
    'speakable':{'@type':'SpeakableSpecification','cssSelector':['.bsm-news-lede','.bsm-faq']}
  });

  return '<style>' + BSM_BASE_CSS + '\n'
    + '.bsm-news-meta{font-family:\'DM Mono\',monospace;font-size:10px;color:#555;letter-spacing:.1em;text-transform:uppercase;margin-bottom:20px;display:flex;gap:16px;flex-wrap:wrap;border-bottom:1px solid #2E2E2E;padding-bottom:12px}'
    + '.bsm-news-lede{font-family:\'Lora\',serif;font-size:19px;font-style:italic;color:#e8e8e8;line-height:1.7;border-left:3px solid #E8FF00;padding-left:16px;margin-bottom:28px}'
    + '.bsm-breaking{display:inline-block;background:#ff4444;color:#fff;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;padding:4px 10px;margin-bottom:12px}'
    + '</style>\n'
    + articleSchema(parsed, 'news')
    + '<script type="application/ld+json">' + speakable + '<\/script>\n'
    + '<div class="bsm-article" itemscope itemtype="https://schema.org/NewsArticle">'
    + '<div class="bsm-breaking">Breaking</div>'
    + '<div class="bsm-news-meta">'
    + '<span itemprop="datePublished" content="' + new Date().toISOString() + '">' + date + ' &mdash; ' + time + '</span>'
    + '<span itemprop="author" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">BSM Editorial Staff</span></span>'
    + '<span>World Cup 2026</span>'
    + '</div>'
    + body
    + '<div class="bsm-disc">This article was researched using live sources via Brave Search and SerpAPI. Affiliate links are marked. &copy; BestSportsMag ' + new Date().getFullYear() + '</div>'
    + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 2 — MATCH PREVIEW
   Goal: Engagement + newsletter + return visits
   Schema: SportsEvent + BreadcrumbList
──────────────────────────────────────────────────────────────── */
function buildPreviewTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var title    = parsed.title || '';

  // Try to detect two teams from title
  var teamMatch = title.match(/(.+?)\s+vs\.?\s+(.+?)(?:\s+\d{4}|\s+Preview|$)/i);
  var team1 = teamMatch ? teamMatch[1].trim() : 'Team A';
  var team2 = teamMatch ? teamMatch[2].trim() : 'Team B';

  var body = '';
  sections.slice(1).forEach(function(s) {
    if (s.heading) body += bsmH2(s.heading);
    body += s.paragraphs.map(bsmP).join('');
  });

  return '<style>' + BSM_BASE_CSS + '\n'
    + '.bsm-matchup{display:flex;align-items:center;justify-content:center;gap:0;background:#111;border:1px solid #2E2E2E;border-top:3px solid #E8FF00;margin-bottom:28px;overflow:hidden;flex-wrap:wrap}'
    + '.bsm-team{flex:1;padding:24px 20px;text-align:center;min-width:140px}'
    + '.bsm-team-name{font-family:\'Barlow Condensed\',sans-serif;font-size:28px;font-weight:900;text-transform:uppercase;color:#fff;letter-spacing:-.5px}'
    + '.bsm-team-label{font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.14em;margin-top:4px}'
    + '.bsm-vs{font-family:\'Barlow Condensed\',sans-serif;font-size:40px;font-weight:900;color:#E8FF00;padding:0 20px;flex-shrink:0}'
    + '.bsm-prediction{background:#1A1A1A;border:1px solid #2E2E2E;border-left:4px solid #E8FF00;padding:16px 20px;margin:28px 0;display:flex;align-items:center;gap:16px;max-width:720px}'
    + '.bsm-prediction-label{font-family:\'DM Mono\',monospace;font-size:9px;color:#E8FF00;text-transform:uppercase;letter-spacing:.14em;margin-bottom:4px}'
    + '.bsm-prediction-score{font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:900;color:#fff}'
    + '.bsm-nl-cta{background:#E8FF00;padding:20px 24px;margin:36px 0;max-width:720px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}'
    + '.bsm-nl-title{font-family:\'Barlow Condensed\',sans-serif;font-size:22px;font-weight:800;text-transform:uppercase;color:#000}'
    + '.bsm-nl-sub{font-family:\'DM Mono\',monospace;font-size:10px;color:rgba(0,0,0,.6);margin-top:4px}'
    + '.bsm-nl-btn{background:#000;color:#E8FF00;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;text-transform:uppercase;padding:12px 24px;text-decoration:none;flex-shrink:0;display:inline-block}'
    + '</style>\n'
    + articleSchema(parsed, 'preview')
    + '<div class="bsm-article">'
    + '<div class="bsm-matchup">'
    + '<div class="bsm-team"><div class="bsm-team-name">' + escHtml(team1) + '</div><div class="bsm-team-label">Home</div></div>'
    + '<div class="bsm-vs">VS</div>'
    + '<div class="bsm-team"><div class="bsm-team-name">' + escHtml(team2) + '</div><div class="bsm-team-label">Away</div></div>'
    + '</div>'
    + (sections[0] ? sections[0].paragraphs.map(bsmP).join('') : '')
    + adSlot('728x90:top')
    + body
    + '<div class="bsm-prediction"><div><div class="bsm-prediction-label">BSM Score Prediction</div><div class="bsm-prediction-score">' + escHtml(team1.split(' ')[0]) + ' 2 &mdash; 1 ' + escHtml(team2.split(' ')[0]) + '</div></div></div>'
    + '<div class="bsm-nl-cta"><div><div class="bsm-nl-title">Get the Result Alert</div><div class="bsm-nl-sub">Free match result delivered to your inbox</div></div><a href="https://bestsportsmag.com/newsletter" class="bsm-nl-btn">Subscribe Free &rarr;</a></div>'
    + faqBlock(faq)
    + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 3 — COMPLETE GUIDE
   Goal: Dwell time + affiliate clicks + internal links
   Schema: HowTo + BreadcrumbList
──────────────────────────────────────────────────────────────── */
function buildGuideTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var aff      = parsed.affiliateItems || [];

  // Build TOC from H2 headings
  var tocItems = sections.filter(function(s) { return s.heading; }).map(function(s, i) {
    var id = 'bsm-section-' + i;
    return { id:id, heading:s.heading };
  });
  var toc = tocItems.length > 1
    ? '<div style="background:#111;border:1px solid #2E2E2E;border-left:3px solid #E8FF00;padding:16px 20px;margin:28px 0;max-width:720px">'
      + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;color:#E8FF00;letter-spacing:.2em;margin-bottom:10px">In This Guide</div>'
      + '<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">'
      + tocItems.map(function(t) {
          return '<li style="font-family:\'DM Mono\',monospace;font-size:11px;color:#C8C8C8"><a href="#' + t.id + '" style="color:#C8C8C8;text-decoration:none">' + escHtml(t.heading) + '</a></li>';
        }).join('')
      + '</ol></div>'
    : '';

  var body = '';
  var headingIdx = 0;
  sections.forEach(function(s, i) {
    if (i === 0) {
      body += s.paragraphs.map(bsmP).join('');
      body += toc;
      body += adSlot('728x90:top');
      return;
    }
    var id = s.heading ? ('bsm-section-' + headingIdx++) : '';
    if (s.heading) body += '<h2 id="' + id + '" style="font-family:\'Barlow Condensed\',sans-serif;font-size:32px;font-weight:800;text-transform:uppercase;color:#fff;line-height:1;margin:40px 0 16px;padding-left:14px;border-left:3px solid #E8FF00;">' + escHtml(s.heading) + '</h2>';
    body += s.paragraphs.map(bsmP).join('');
    if (i === 2 && aff.length > 0) body += buildAffiliateBox(aff);
    if (i === 3) body += adSlot('300x250:mid');
  });

  body += faqBlock(faq);

  return '<style>' + BSM_BASE_CSS + '</style>\n'
    + articleSchema(parsed, 'guide')
    + '<div class="bsm-article">' + body + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 4 — ANALYSIS
   Goal: Authority + trust + repeat traffic + brand building
   Schema: AnalysisNewsArticle + speakable
──────────────────────────────────────────────────────────────── */
function buildAnalysisTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var date     = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  var body = '';
  sections.forEach(function(s, i) {
    if (i === 0) {
      body += s.paragraphs.map(bsmP).join('');
      body += adSlot('728x90:top');
      return;
    }
    if (s.heading) body += bsmH2(s.heading);
    body += s.paragraphs.map(bsmP).join('');

    // Pull quote from first paragraph of section 2
    if (i === 2 && s.paragraphs[0]) {
      var quote = s.paragraphs[0].replace(/<[^>]+>/g,'').slice(0,160);
      body += '<div style="border-left:4px solid #E8FF00;padding:16px 24px;margin:28px 0;background:#111;max-width:600px">'
        + '<div style="font-family:\'Lora\',serif;font-size:21px;font-style:italic;color:#fff;line-height:1.5;margin-bottom:8px">"' + escHtml(quote) + '..."</div>'
        + '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.1em">BSM Analysis</div>'
        + '</div>';
    }
    if (i === 3) body += adSlot('300x250:mid');
  });

  body += faqBlock(faq);

  // Author bio
  body += '<div style="display:flex;gap:16px;align-items:flex-start;background:#111;border:1px solid #2E2E2E;border-left:3px solid #E8FF00;padding:20px;margin-top:36px;max-width:720px">'
    + '<div><div style="font-family:\'DM Mono\',monospace;font-size:8px;color:#E8FF00;text-transform:uppercase;letter-spacing:.2em;margin-bottom:4px">Analysis by</div>'
    + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:800;text-transform:uppercase;color:#fff;margin-bottom:6px">BSM Editorial Staff</div>'
    + '<div style="font-family:\'Lora\',serif;font-size:13px;color:#888;line-height:1.6">The BestSportsMag team covers football, cricket, volleyball, and collectibles. Powered by live data and AI-assisted research.</div>'
    + '</div></div>';

  return '<style>' + BSM_BASE_CSS + '</style>\n'
    + articleSchema(parsed, 'analysis')
    + '<div class="bsm-article">'
    + '<div style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.12em;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2E2E2E">'
    + 'Analysis &mdash; ' + date + ' &mdash; BSM Editorial Staff</div>'
    + body
    + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 5 — BEST OF LIST
   Goal: Maximum affiliate clicks — highest revenue format
   Schema: ItemList + FAQPage
──────────────────────────────────────────────────────────────── */
function buildListicleTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var aff      = parsed.affiliateItems || [];
  var products = parsed.products || [];

  // Build quick comparison table from affiliate items
  var compTable = '';
  if (aff.length > 0) {
    compTable = '<div style="background:#111;border:1px solid #2E2E2E;border-top:2px solid #E8FF00;margin:24px 0;max-width:720px;overflow-x:auto">'
      + '<div style="padding:10px 16px;background:#1A1A1A;border-bottom:1px solid #2E2E2E;font-family:\'Barlow Condensed\',sans-serif;font-size:16px;font-weight:700;text-transform:uppercase;color:#E8FF00">Quick Comparison</div>'
      + '<table style="width:100%;border-collapse:collapse;min-width:480px"><thead>'
      + '<tr style="background:#0d0d0d"><th style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.12em;padding:10px 12px;text-align:left;border-bottom:1px solid #2E2E2E">Product</th>'
      + '<th style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.12em;padding:10px 12px;text-align:left;border-bottom:1px solid #2E2E2E">Brand</th>'
      + '<th style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.12em;padding:10px 12px;text-align:center;border-bottom:1px solid #2E2E2E">Price</th>'
      + '<th style="font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.12em;padding:10px 12px;text-align:center;border-bottom:1px solid #2E2E2E">Get it</th></tr></thead><tbody>'
      + aff.map(function(item, i) {
          return '<tr style="border-bottom:1px solid #1a1a1a;' + (i===0?'background:rgba(232,255,0,.04)':'') + '">'
            + '<td style="padding:10px 12px;font-family:\'Barlow Condensed\',sans-serif;font-size:15px;font-weight:700;color:#fff">' + (i===0?'<span style="background:#E8FF00;color:#000;font-size:9px;font-family:\'DM Mono\',monospace;padding:2px 6px;margin-right:6px;text-transform:uppercase;letter-spacing:.1em">Best</span>':'') + escHtml(item.name) + '</td>'
            + '<td style="padding:10px 12px;font-family:\'DM Mono\',monospace;font-size:10px;color:#E8FF00">' + escHtml(item.brand) + '</td>'
            + '<td style="padding:10px 12px;font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:700;color:#fff;text-align:center">' + escHtml(item.price) + '</td>'
            + '<td style="padding:10px 12px;text-align:center"><a href="#" rel="noopener sponsored" style="background:#E8FF00;color:#000;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:6px 14px;text-decoration:none;display:inline-block">Buy &rarr;</a></td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>';
  }

  // ItemList schema
  var itemListSchema = '';
  if (aff.length > 0) {
    itemListSchema = '<script type="application/ld+json">' + JSON.stringify({
      '@context':'https://schema.org','@type':'ItemList',
      'name': parsed.title,
      'description': parsed.meta,
      'numberOfItems': aff.length,
      'itemListElement': aff.map(function(item, i) {
        return { '@type':'ListItem','position':i+1,'name':item.name,'description':item.brand + ' ' + item.price };
      })
    }) + '<\/script>\n';
  }

  var body = '';
  if (sections[0]) {
    body += sections[0].paragraphs.map(bsmP).join('');
  }
  body += compTable;
  body += adSlot('728x90:top');

  sections.slice(1).forEach(function(s, i) {
    if (s.heading) body += bsmH2(s.heading);
    body += s.paragraphs.map(bsmP).join('');
    if (i === 1 && aff.length > 0) body += buildAffiliateBox(aff);
    if (i === 3) body += adSlot('300x250:mid');
  });

  body += faqBlock(faq);

  return '<style>' + BSM_BASE_CSS + '\n'
    + '.bsm-list-badge{display:inline-block;background:#E8FF00;color:#000;font-family:\'DM Mono\',monospace;font-size:8px;font-weight:700;padding:2px 8px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}'
    + '</style>\n'
    + articleSchema(parsed, 'listicle')
    + itemListSchema
    + '<div class="bsm-article">'
    + '<div class="bsm-list-badge">Ranked List</div>'
    + body
    + '<div class="bsm-disc">*Affiliate disclosure: BestSportsMag earns a commission on qualifying purchases via links on this page at no extra cost to you.</div>'
    + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   TEMPLATE 6 — GEAR REVIEW
   Goal: Single product conversion — highest affiliate intent
   Schema: Review + Product
──────────────────────────────────────────────────────────────── */
function buildReviewTemplate(parsed) {
  var sections = parsed.sections || [];
  var faq      = parsed.faq || [];
  var aff      = parsed.affiliateItems || [];
  var mainItem = aff[0] || { name:'Featured Product', price:'See price', brand:'', icon:'gear' };

  // Verdict score (pulled from content or default)
  var verdictScore = '8.5';
  var scoreMatch = (parsed.raw||'').match(/(\d+(?:\.\d+)?)\s*(?:\/\s*10|out of 10)/i);
  if (scoreMatch) verdictScore = scoreMatch[1];

  // Product schema
  var productSchema = '<script type="application/ld+json">' + JSON.stringify({
    '@context':'https://schema.org','@type':'Product',
    'name': mainItem.name, 'brand':{'@type':'Brand','name':mainItem.brand},
    'offers':{'@type':'Offer','price':mainItem.price.replace(/[^0-9.]/g,''),'priceCurrency':'USD','availability':'https://schema.org/InStock'},
    'review':{'@type':'Review','reviewRating':{'@type':'Rating','ratingValue':verdictScore,'bestRating':'10'},'author':{'@type':'Organization','name':'BestSportsMag'}}
  }) + '<\/script>\n';

  var body = '';
  sections.forEach(function(s, i) {
    if (i === 0) {
      body += s.paragraphs.map(bsmP).join('');
      body += adSlot('728x90:top');
      return;
    }
    if (s.heading) body += bsmH2(s.heading);
    body += s.paragraphs.map(bsmP).join('');
    if (i === 2) body += adSlot('300x250:mid');
    if (i === 3 && aff.length > 1) body += buildAffiliateBox(aff.slice(1));
  });

  body += faqBlock(faq);

  return '<style>' + BSM_BASE_CSS + '\n'
    + '.bsm-review-hero{background:#111;border:1px solid #2E2E2E;border-top:3px solid #E8FF00;padding:24px;margin-bottom:24px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;max-width:720px}'
    + '.bsm-review-info{flex:1;min-width:200px}'
    + '.bsm-review-brand{font-family:\'DM Mono\',monospace;font-size:9px;color:#E8FF00;text-transform:uppercase;letter-spacing:.2em;margin-bottom:6px}'
    + '.bsm-review-name{font-family:\'Barlow Condensed\',sans-serif;font-size:30px;font-weight:900;text-transform:uppercase;color:#fff;line-height:1;margin-bottom:10px}'
    + '.bsm-review-price{font-family:\'Barlow Condensed\',sans-serif;font-size:40px;font-weight:900;color:#fff;line-height:1;margin-bottom:12px}'
    + '.bsm-review-score{display:inline-flex;align-items:center;gap:8px;background:#1A1A1A;border:1px solid #2E2E2E;padding:8px 14px;margin-bottom:14px}'
    + '.bsm-review-score-num{font-family:\'Barlow Condensed\',sans-serif;font-size:28px;font-weight:900;color:#E8FF00}'
    + '.bsm-review-score-label{font-family:\'DM Mono\',monospace;font-size:9px;color:#555;text-transform:uppercase}'
    + '.bsm-review-cta{display:block;background:#E8FF00;color:#000;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:18px;letter-spacing:.1em;text-transform:uppercase;padding:14px 24px;text-decoration:none;text-align:center;width:100%;box-sizing:border-box}'
    + '.bsm-verdict{background:#111;border:1px solid #2E2E2E;border-left:4px solid #E8FF00;padding:20px 24px;margin:28px 0;max-width:720px}'
    + '.bsm-verdict-label{font-family:\'DM Mono\',monospace;font-size:9px;color:#E8FF00;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px}'
    + '.bsm-verdict-text{font-family:\'Lora\',serif;font-size:16px;color:#C8C8C8;line-height:1.7}'
    + '</style>\n'
    + articleSchema(parsed, 'review')
    + productSchema
    + '<div class="bsm-article">'
    + '<div class="bsm-review-hero">'
    + '<div class="bsm-review-info">'
    + '<div class="bsm-review-brand">' + escHtml(mainItem.brand) + '</div>'
    + '<div class="bsm-review-name">' + escHtml(mainItem.name) + '</div>'
    + '<div class="bsm-review-price">' + escHtml(mainItem.price) + '</div>'
    + '<div class="bsm-review-score"><span class="bsm-review-score-num">' + verdictScore + '</span><div class="bsm-review-score-label">BSM<br>Score</div></div>'
    + '<a href="#" class="bsm-review-cta" rel="noopener sponsored">Get Best Price &rarr;</a>'
    + '<div class="bsm-disc" style="margin-top:8px">*Affiliate link &mdash; see price at retailer</div>'
    + '</div></div>'
    + body
    + '<div class="bsm-disc">*Affiliate disclosure: BestSportsMag earns a commission on qualifying purchases at no extra cost to you.</div>'
    + '</div>';
}

/* ────────────────────────────────────────────────────────────────
   ROUTER — picks template by article type
──────────────────────────────────────────────────────────────── */
function buildBSMHtml(parsed, articleType) {
  var type = (articleType || 'news').toLowerCase();
  switch (type) {
    case 'news':     return buildNewsTemplate(parsed);
    case 'preview':  return buildPreviewTemplate(parsed);
    case 'guide':    return buildGuideTemplate(parsed);
    case 'analysis': return buildAnalysisTemplate(parsed);
    case 'listicle': return buildListicleTemplate(parsed);
    case 'review':   return buildReviewTemplate(parsed);
    default:         return buildNewsTemplate(parsed);
  }
}


/* ── Article Parser ── */
function parseArticle(rawText) {
  const result = { title:'',slug:'',meta:'',sections:[],faq:[],tags:[],affiliateItems:[] };
  function cf(val) {
    if (!val) return '';
    return val.trim().replace(/\*\*/g,'').replace(/^[\[#\s\/]+|[\]\s\/]+$/g,'').trim();
  }
  const tM=rawText.match(/TITLE:[\s]*(.+?)(?:\n|$)/); result.title=cf(tM?tM[1]:'');
  const mM=rawText.match(/META:[\s]*(.+?)(?:\n|$)/);  result.meta=cf(mM?mM[1]:'');
  const sM=rawText.match(/SLUG:[\s]*(.+?)(?:\n|$)/);
  var rawSlug = cf(sM?sM[1]:'');
  result.slug = rawSlug.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,80);
  if (!result.slug || result.slug.length < 3) {
    result.slug = result.title.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'-').slice(0,80);
  }
  const cM=rawText.match(/CONTENT:\s*([\s\S]+)/);
  const content=cM?cM[1].trim():rawText;

  // FAQ — robust multi-format parser
  // Handles: **Q:**/**A:**, Q:/A:, plain Q/A, with or without ## heading
  function parseFaqs(text) {
    var faqs = [];

    // Strategy 1: **Q:** ... **A:** format (most common Claude output)
    var chunks = text.split(/\*\*Q:\*\*/i).filter(function(s){ return s.trim(); });
    chunks.forEach(function(chunk) {
      var aIdx = chunk.search(/\*\*A:\*\*/i);
      if (aIdx === -1) return;
      var q = chunk.slice(0, aIdx).replace(/\*\*/g,'').replace(/^[?:\s]+/,'').trim();
      var a = chunk.slice(aIdx).replace(/^\*\*A:\*\*/i,'').replace(/\*\*Q:[\s\S]*/i,'').replace(/\*\*/g,'').trim().replace(/\n/g,' ').replace(/\s+/g,' ');
      if (q && a && q.length > 3 && a.length > 10) faqs.push({q:q, a:a});
    });
    if (faqs.length >= 2) return faqs;

    // Strategy 2: Q: ... A: format (no bold markers)
    var matches2 = [...text.matchAll(/(?:^|\n)\s*Q[:\.]\s*(.+?)\n+\s*A[:\.]\s*([\s\S]+?)(?=\n\s*Q[:\.\s]|\n##|$)/gi)];
    matches2.forEach(function(m) {
      var q = m[1].replace(/\*\*/g,'').trim();
      var a = m[2].replace(/\*\*/g,'').trim().replace(/\n/g,' ').replace(/\s+/g,' ');
      if (q && a && q.length > 3 && a.length > 10) faqs.push({q:q, a:a});
    });
    if (faqs.length >= 2) return faqs;

    // Strategy 3: numbered Q&A blocks
    var matches3 = [...text.matchAll(/\d+\.\s+\*{0,2}(.+?)\*{0,2}\n+([\s\S]+?)(?=\n\d+\.|\n##|$)/gi)];
    matches3.forEach(function(m) {
      var q = m[1].replace(/\*\*/g,'').replace(/^Q[:\s]+/i,'').trim();
      var a = m[2].replace(/\*\*/g,'').trim().replace(/\n/g,' ').replace(/\s+/g,' ');
      if (q && q.endsWith('?') && a && a.length > 15) faqs.push({q:q, a:a});
    });
    return faqs;
  }

  // Find FAQ section — try with heading first, then scan entire content
  var faqBlock = '';
  var faqHeadingMatch = content.match(/##\s*(?:Frequently Asked Questions|FAQ)[\s\S]+?(?=\n##\s|$)/i);
  if (faqHeadingMatch) {
    faqBlock = faqHeadingMatch[0];
  } else {
    // No heading — scan entire content for Q/A patterns
    faqBlock = content;
  }

  result.faq = parseFaqs(faqBlock);

  // Ensure minimum of 1 FAQ before giving up
  if (!result.faq.length && faqHeadingMatch) {
    result.faq = parseFaqs(content);
  }

  const noFaq=content.replace(/##\s*Frequently Asked Questions[\s\S]+?(?=\n##\s|$)/i,'');

  // Affiliates
  const icons=['boot','ball','gear','kit','glove','card']; let ai=0;
  for (const m of content.matchAll(/\[AFFILIATE:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]—]*[\s—]*([^\]]*)\]/gi)) {
    const brand=m[3].trim().replace(/via Impact\.com/i,'').trim()||'Brand';
    result.affiliateItems.push({name:m[1].trim(),price:m[2].trim(),brand,icon:icons[ai%icons.length]}); ai++;
    if (result.affiliateItems.length>=3) break;
  }
  for (const m of content.matchAll(/\[AMAZON:\s*([^\]—]+?)[\s—]+(\$[\d,]+)[^\]]*\]/gi)) {
    if (result.affiliateItems.length>=3) break;
    result.affiliateItems.push({name:m[1].trim(),price:m[2].trim(),brand:'Amazon',icon:icons[ai%icons.length]}); ai++;
  }
  const defs=[{name:'Adidas Predator 30 Elite FG',price:'$229',brand:'Adidas',icon:'boot'},{name:'Puma Future 7 Pro WC Edition',price:'$189',brand:'Puma',icon:'ball'},{name:'Oakley Meta Football Visor',price:'$149',brand:'Oakley',icon:'gear'}];
  while (result.affiliateItems.length<3) result.affiliateItems.push(defs[result.affiliateItems.length]);

  // Tags
  const tagM=rawText.match(/TAGS?:\s*(.+?)(?:\n|$)/i);
  result.tags=tagM?tagM[1].split(',').map(t=>t.trim()).filter(Boolean).slice(0,8):['World Cup 2026','Football','FIFA'];

  // Sections
  noFaq.split(/^## /m).forEach(function(part,i) {
    if (!part.trim()) return;
    let heading='',text=part;
    if (i>0) { const nl=part.indexOf('\n'); if(nl>-1){heading=part.slice(0,nl).trim().replace(/\*\*/g,'').replace(/^#+\s*/,'');text=part.slice(nl+1);}else{heading=part.trim().replace(/\*\*/g,'').replace(/^#+\s*/,'');text='';} }
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
      paaCtx = '\n\n=== PEOPLE ALSO ASK — use EXACTLY these as your FAQ questions ===\n'
        + paaData.map(function(p,i){ return (i+1)+'. Q: '+p.q+(p.a?'\n   A hint: '+p.a.slice(0,200):''); }).join('\n')
        + '\n=== END PAA ==='
        + '\n\nFAQ FORMAT RULES (non-negotiable):'
        + '\n- Write 4-7 FAQ items using the PAA questions above'
        + '\n- Use this exact format for every FAQ:'
        + '\n  **Q:** [question text]?'
        + '\n  **A:** [answer — 2-4 sentences, specific and factual]'
        + '\n- Do NOT use numbered lists or any other format'
        + '\n- FAQ section must start with: ## Frequently Asked Questions';
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
      body:JSON.stringify({ model:model||'claude-sonnet-4-20250514', max_tokens:max_tokens||8000, system:sys, messages:[{role:'user',content:prompt}] })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error:data.error?data.error.message:'API error', details:data });

    const rawText = data.content[0].text;
    const parsed  = parseArticle(rawText);
    const articleType = req.body.articleType || req.body.art_type || 'news';
    const bsmHtml = buildBSMHtml(parsed, articleType);

    res.json({
      content:[{type:'text',text:rawText}],
      bsm:{ title:parsed.title, slug:parsed.slug, meta:parsed.meta, html:bsmHtml, raw:rawText, tags:parsed.tags, faq:parsed.faq, faqCount:parsed.faq.length, sectionCount:parsed.sections.length, articleType:articleType, searchSource:search.source, searchResults:search.resultsCount }
    });

  } catch(error) {
    console.error('v4.1 error:',error);
    res.status(500).json({ error:'Proxy error: '+error.message });
  }
});

app.listen(PORT, () => console.log('TrendBlog AI Proxy v5.1 running on port ' + PORT));
