// @ts-check
// rss.js — a minimal RSS/Atom <item>/<entry> extractor, shared by any poller
// that reads a plain XML feed (NCSC-FI, CERT-EU). No XML dependency in this
// project (see package.json) — hand-rolled regex extraction is proportionate
// for well-formed government/EU feeds, not a general-purpose XML parser.

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

// JS Date.parse doesn't understand non-US timezone abbreviations (e.g.
// CERT-EU's RSS uses "CEST"/"CET") and silently returns NaN — swap in a
// numeric offset first so real pubDates parse instead of falling back to
// "now".
const TZ_OFFSETS = { CEST: '+0200', CET: '+0100', BST: '+0100', GMT: '+0000', UTC: '+0000' };
function parseDate(s) {
  if (!s) return NaN;
  const withOffset = s.replace(/\s([A-Z]{2,4})$/, (m, abbr) => (TZ_OFFSETS[abbr] ? ` ${TZ_OFFSETS[abbr]}` : m));
  return Date.parse(withOffset);
}

/**
 * @param {string} xml
 * @returns {Array<{title: string, url: string, ts: number}>}
 */
export function parseRssItems(xml) {
  const blocks = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || xml.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi) || [];
  return blocks
    .map((block) => {
      const title = tag(block, 'title');
      const link = tag(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || null;
      const pubDate = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
      const ts = parseDate(pubDate);
      return title && link ? { title, url: link, ts: Number.isFinite(ts) ? ts : Date.now() } : null;
    })
    .filter((x) => x !== null);
}
