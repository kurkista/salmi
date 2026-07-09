// i18n.ts — tiny bilingual layer: flat key→string dicts, EN default.
// Static DOM text is tagged with data-i18n; dynamic strings go through t().
// Switching language stores the choice and reloads (boring and reliable).
let dict: Record<string, string> = {};
let fallback: Record<string, string> = {};
let lang: 'en' | 'fi' = 'en';

export function getLang() {
  return lang;
}

export async function initI18n(): Promise<void> {
  const stored = localStorage.getItem('salmi-lang');
  lang = stored === 'fi' ? 'fi' : 'en';
  fallback = await (await fetch('/locales/en.json')).json();
  dict = lang === 'en' ? fallback : await (await fetch(`/locales/${lang}.json`)).json();
  document.documentElement.lang = lang;

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  }
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = lang === 'en' ? 'FI' : 'EN';
    toggle.addEventListener('click', () => {
      localStorage.setItem('salmi-lang', lang === 'en' ? 'fi' : 'en');
      location.reload();
    });
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export const fmtNum = (n: number, digits = 1) =>
  new Intl.NumberFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { maximumFractionDigits: digits }).format(n);

export const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(ts);

export const fmtDate = (ts: number) =>
  new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'short' }).format(ts);
