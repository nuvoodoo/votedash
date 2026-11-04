'use strict';
// News ingest: outlet RSS feeds plus Google News queries. Classifies items as
// call / exitpoll / news, attaches a race where the headline names one, and
// tracks which outlet has called which race.

const { STATES } = require('./civic');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 VoteDash/1.0';

const SOURCES = [
  { outlet: 'NYT', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml' },
  { outlet: 'CNN', url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss' },
  { outlet: 'Fox', url: 'https://moxie.foxnews.com/google-publisher/politics.xml' },
  { outlet: 'NBC', url: 'https://feeds.nbcnews.com/nbcnews/public/politics' },
  { outlet: 'ABC', url: 'https://abcnews.go.com/abcnews/politicsheadlines' },
  { outlet: 'CBS', url: 'https://www.cbsnews.com/latest/rss/politics' },
  { outlet: null, url: 'https://news.google.com/rss/search?q=%22projected%22+OR+%22projects%22+OR+%22calls%22+OR+%22wins%22+senate+OR+governor+OR+house+OR+congressional+when:1d&hl=en-US&gl=US&ceid=US:en', google: true },
  { outlet: null, url: 'https://news.google.com/rss/search?q=%22exit+poll%22+OR+%22exit+polls%22+when:1d&hl=en-US&gl=US&ceid=US:en', google: true },
  { outlet: null, url: 'https://news.google.com/rss/search?q=midterm+election+results+when:1d&hl=en-US&gl=US&ceid=US:en', google: true },
  { outlet: null, url: 'https://news.google.com/rss/search?q=%22AP%22+%22race+call%22+OR+%22Associated+Press%22+projects+when:1d&hl=en-US&gl=US&ceid=US:en', google: true },
];

const OUTLET_MAP = [
  [/associated press|ap news|\bAP\b/i, 'AP'],
  [/nbc/i, 'NBC'],
  [/fox/i, 'Fox'],
  [/cnn/i, 'CNN'],
  [/new york times|nytimes|\bnyt\b/i, 'NYT'],
  [/abc/i, 'ABC'],
  [/cbs/i, 'CBS'],
  [/reuters/i, 'Reuters'],
  [/washington post/i, 'WaPo'],
  [/politico/i, 'Politico'],
  [/decision desk/i, 'DDHQ'],
  [/npr/i, 'NPR'],
  [/bloomberg/i, 'Bloomberg'],
  [/wall street journal|wsj/i, 'WSJ'],
  [/axios/i, 'Axios'],
  [/the hill/i, 'The Hill'],
  [/pbs/i, 'PBS'],
  [/usa today/i, 'USA Today'],
];

const REPUTABLE = new Set(['AP','NBC','Fox','CNN','NYT','ABC','CBS','Reuters','WaPo','Politico','DDHQ','NPR','Bloomberg','WSJ','Axios','The Hill','PBS','USA Today']);
const CALL_RE = /\b(projects?|projected|projection|calls?|called|declares?|declared|wins?|has won|winner|flips?|flipped|defeats?|unseats?|ousts?|re-?elected|elected|holds? (on|off)|holds? seat|retains?|clinch(es)?)\b/i;
const EXIT_RE = /exit poll/i;
const SKIP_RE = /(opinion|how to watch|what to watch|live updates|guide to|explained|podcast)/i;

const STATE_NAME_RE = new RegExp('\\b(' + Object.values(STATES).map((s) => s.replace(/\./g, '\\.')).join('|') + ')\\b', 'i');
const NAME_TO_CODE = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function parseRSS(xml) {
  const items = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    let link = tag(b, 'link');
    if (!link) {
      const lm = b.match(/<link[^>]*href="([^"]+)"/i);
      link = lm ? lm[1] : '';
    }
    const srcM = b.match(/<source[^>]*>([^<]*)<\/source>/i);
    items.push({
      title: tag(b, 'title'),
      url: link.trim(),
      desc: tag(b, 'description') || tag(b, 'summary'),
      date: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'),
      source: srcM ? decode(srcM[1]) : '',
    });
  }
  return items;
}

function parseAPHub(html) {
  const out = [];
  const re = /<a[^>]+href="(https:\/\/apnews\.com\/article\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].split('?')[0];
    const title = decode(m[2]);
    if (!title || title.length < 20 || seen.has(url)) continue;
    seen.add(url);
    out.push({ title, url, desc: '', date: '', source: 'AP News' });
  }
  return out;
}

function outletOf(name, fallback) {
  for (const [re, o] of OUTLET_MAP) if (re.test(name || '')) return o;
  return fallback || (name ? name.slice(0, 24) : 'News');
}

class News {
  constructor(civic, emit) {
    this.civic = civic;
    this.emit = emit;
    this.items = []; // newest first
    this.seen = new Set();
    this.calls = {}; // race_id -> { outlet: {ts,url,title} }
    this.status = { last: null, errors: {} };
  }

  matchRace(text) {
    const t = ` ${text} `;
    let state = null;
    const sm = t.match(STATE_NAME_RE);
    if (sm) state = NAME_TO_CODE[sm[1].toLowerCase()];
    const abbr = t.match(/\b([A-Z]{2})-(\d{1,2}|AL)\b/);
    let district = abbr ? `${abbr[1]}-${abbr[2] === 'AL' ? 'AL' : abbr[2].padStart(2, '0')}` : null;
    if (district) state = state || abbr[1];
    const abbr2 = !state && t.match(/\b([A-Z]{2})[ -](?:Senate|Sen|Governor|Gov|House)\b/);
    if (abbr2 && STATES[abbr2[1]]) state = abbr2[1];
    if (!state) return null;
    let cat = null;
    if (/\b(senate|senator)\b/i.test(t) && !/state senate/i.test(t)) cat = 'senate';
    else if (/\b(governor|gubernatorial)\b/i.test(t)) cat = 'governor';
    else if (/\b(house|congressional|district|congress)\b/i.test(t) && !/state house/i.test(t)) cat = 'house';
    if (!cat && district) cat = 'house';
    if (!cat) return null;
    if (cat === 'house' && !district) {
      const dm = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:congressional\s+)?district/i) || t.match(/district\s+(\d{1,2})/i);
      if (dm) district = `${state}-${dm[1].padStart(2, '0')}`;
      else if (/at-large/i.test(t)) district = `${state}-AL`;
    }
    for (const r of this.civic.races.values()) {
      if (r.cat !== cat || r.state !== state) continue;
      if (cat === 'house' && r.district !== district) continue;
      return r;
    }
    return null;
  }

  classify(it) {
    const text = `${it.title} ${it.desc}`;
    if (EXIT_RE.test(text)) return 'exitpoll';
    if (CALL_RE.test(it.title) && !SKIP_RE.test(it.title)) return 'call';
    return 'news';
  }

  ingest(raw, src) {
    const fresh = [];
    for (const it of raw) {
      if (!it.title || !it.url) continue;
      const key = it.url.replace(/[?#].*$/, '');
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      let outlet = src.outlet || outletOf(it.source, null);
      let title = it.title;
      if (src.google) {
        const m = title.match(/^(.*)\s-\s([^-]+)$/);
        if (m) { title = m[1].trim(); outlet = outletOf(m[2].trim(), outletOf(it.source)); }
      }
      if (src.google && !REPUTABLE.has(outlet)) continue;
      let kind = this.classify({ ...it, title });
      const race = this.matchRace(title);
      if (kind === 'call' && !race) kind = 'news';
      const ts = it.date ? Date.parse(it.date) || Date.now() : Date.now();
      const item = {
        id: key,
        kind,
        outlet,
        title,
        url: it.url,
        ts,
        race_id: race ? race.id : null,
        race_name: race ? race.name : null,
      };
      fresh.push(item);
      if (kind === 'call' && race) {
        const c = (this.calls[race.id] = this.calls[race.id] || {});
        if (!c[outlet]) c[outlet] = { ts, url: it.url, title };
      }
    }
    return fresh;
  }

  async fetchSource(src) {
    const res = await fetch(src.url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': UA, accept: src.html ? 'text/html' : 'application/rss+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    return src.html ? parseAPHub(body) : parseRSS(body);
  }

  async poll() {
    if (!this.civic.races.size) return; // wait for the race index so headlines can be matched
    const results = await Promise.allSettled(SOURCES.map((s) => this.fetchSource(s)));
    let fresh = [];
    results.forEach((r, i) => {
      const src = SOURCES[i];
      const key = src.outlet || src.url.slice(0, 60);
      if (r.status === 'fulfilled') {
        delete this.status.errors[key];
        fresh = fresh.concat(this.ingest(r.value, src));
      } else {
        this.status.errors[key] = r.reason.message;
      }
    });
    this.status.last = new Date().toISOString();
    if (fresh.length) {
      // Only election-relevant items reach the feed.
      const keep = fresh.filter((it) => it.kind !== 'news' || it.race_id || /election|midterm|ballot|senate|governor|house|congress|vote|poll|turnout|results/i.test(it.title));
      keep.sort((a, b) => b.ts - a.ts);
      this.items = keep.concat(this.items).slice(0, 500);
      if (keep.length) this.emit('feed', { items: keep, calls: this.calls });
    }
  }

  start() {
    const run = () => this.poll().catch((e) => console.error('news', e.message));
    run();
    setInterval(run, Number(process.env.POLL_NEWS_MS || 60000));
  }
}

module.exports = { News };
