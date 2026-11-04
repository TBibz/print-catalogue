// Finds web links in plain text (http://, https:// and www. addresses), for
// showing notepad lines with clickable links. Only http and https links are
// ever made clickable (never javascript: or anything else).

export type TextPart = { text: string; href?: string };

const LINK = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

// "See https://example.com/a." → [{text: "See "}, {text: "https://example.com/a", href}, {text: "."}]
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    let link = match[0];
    // Full stops, commas etc. straight after a link belong to the sentence,
    // and so does a closing bracket the link didn't open.
    const count = (c: string) => link.split(c).length - 1;
    while (/[.,;:!?'"\]}]$/.test(link) || (link.endsWith(")") && count(")") > count("("))) {
      link = link.slice(0, -1);
    }
    const href = safeHref(link);
    if (!href) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: link, href });
    last = start + link.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// The address to open, or null if it isn't a proper http/https link.
function safeHref(link: string) {
  try {
    const url = new URL(/^www\./i.test(link) ? `https://${link}` : link);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// A link as shown on a one-line note: no "https://" or "www.", and a long
// address cut after its first part, e.g. "ats-uk.net/products/…".
export function shortLink(href: string, max = 32) {
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./i, "");
  const rest = `${url.pathname}${url.search}${url.hash}`.replace(/^\/$/, "");
  if (!rest) return host;
  const full = `${host}${rest}`;
  if (full.length <= max) return full;
  const first = url.pathname.split("/").filter(Boolean)[0];
  return first && first.length <= 24 ? `${host}/${first}/…` : `${host}/…`;
}
