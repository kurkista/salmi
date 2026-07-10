// panels/infoenv.ts — domain 3 (Information Environment) deep-dive: index
// gauge + component breakdown + headlines. Smaller than domain 1's view —
// infoenv never had a map/live-layers card built for it, just the essentials.
import type * as echarts from 'echarts/core';
import type { AppState, IndexSnapshot, Headline } from '../types';
import { t, fmtNum } from '../i18n';
import { makeGauge, setGauge, bindResize } from '../charts';

const COMPONENT_KEYS = ['V', 'T'] as const;
let gauge: echarts.ECharts;

export function init(s: AppState): void {
  gauge = makeGauge(document.getElementById('infoenv-gauge')!);
  renderIndex(s.modules.infoenv.index);
  bindResize(gauge);

  const list = document.getElementById('infoenv-headlines')!;
  list.innerHTML = '';
  if (s.modules.infoenv.headlines.length === 0) {
    list.innerHTML = `<li class="muted">${t('news.empty')}</li>`;
  } else {
    for (const h of s.modules.infoenv.headlines) list.appendChild(headlineLi(h));
  }
}

export function onIndex(snapshot: IndexSnapshot): void {
  renderIndex(snapshot);
}

export function onHeadline(h: Headline): void {
  const list = document.getElementById('infoenv-headlines')!;
  list.querySelector('.muted')?.remove();
  list.prepend(headlineLi(h));
  while (list.children.length > 20) list.lastElementChild!.remove();
}

function renderIndex(snapshot: IndexSnapshot | null): void {
  const bandEl = document.getElementById('infoenv-band')!;
  bandEl.textContent = snapshot
    ? `${t('band.' + snapshot.band)} · ${Math.round(snapshot.value)}`
    : t('status.warming');

  if (snapshot) setGauge(gauge, snapshot.value);

  const list = document.getElementById('infoenv-components')!;
  list.innerHTML = '';
  for (const key of COMPONENT_KEYS) {
    const li = document.createElement('li');
    const c = snapshot?.components[key];
    if (c) {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="val">${fmtNum(c.score, 0)}</span>`;
      li.title = JSON.stringify(c.raw);
    } else {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="stale">${t('comp.stale')}</span>`;
    }
    list.appendChild(li);
  }
}

function headlineLi(h: Headline): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = h.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = h.title;
  const src = document.createElement('span');
  src.className = 'src';
  src.textContent = `${h.source ?? ''} · ${new Date(h.ts).toLocaleString()}`;
  li.append(a, src);
  return li;
}
