// panels/dashboard.ts — home view: a synthesis strip (honest about partial
// coverage, never a fabricated combined score) and six clickable domain-block
// cards. Clicking a card navigates via location.hash — see main.ts's router.
import type { AppState } from '../types';
import { t } from '../i18n';

interface DomainMeta {
  n: number;
  nameKey: string;
  summaryKey: string;
  live: boolean;
}

const DOMAINS: DomainMeta[] = [
  { n: 1, nameKey: 'domain.1.name', summaryKey: 'domain.1.summary', live: true },
  { n: 2, nameKey: 'domain.2.name', summaryKey: 'domain.2.summary', live: false },
  { n: 3, nameKey: 'domain.3.name', summaryKey: 'domain.3.summary', live: true },
  { n: 4, nameKey: 'domain.4.name', summaryKey: 'domain.4.summary', live: false },
  { n: 5, nameKey: 'domain.5.name', summaryKey: 'domain.5.summary', live: false },
  { n: 6, nameKey: 'domain.6.name', summaryKey: 'domain.6.summary', live: false },
];

export function init(state: AppState): void {
  renderSynthesis(state);
  renderCards(state);
}

function renderSynthesis(state: AppState): void {
  const liveCount = DOMAINS.filter((d) => d.live).length;
  const parts: string[] = [];
  const nordic = state.modules.nordic.index;
  const infoenv = state.modules.infoenv.index;
  if (nordic) parts.push(`${t('domain.1.name')}: ${t('band.' + nordic.band)}`);
  if (infoenv) parts.push(`${t('domain.3.name')}: ${t('band.' + infoenv.band)}`);

  const el = document.getElementById('synthesis-coverage')!;
  el.textContent = t('dashboard.coverage', { n: liveCount, total: DOMAINS.length }) +
    (parts.length ? ' — ' + parts.join(' · ') : '');
}

function renderCards(state: AppState): void {
  const grid = document.getElementById('domain-cards')!;
  grid.innerHTML = '';
  for (const d of DOMAINS) {
    const btn = document.createElement('button');
    btn.className = 'domain-card';
    btn.dataset.domain = String(d.n);

    let summary = t(d.summaryKey);
    if (d.n === 1 && state.modules.nordic.index) summary = t('band.' + state.modules.nordic.index.band);
    if (d.n === 3 && state.modules.infoenv.index) summary = t('band.' + state.modules.infoenv.index.band);

    const statusLabel = d.live ? t('domain.status.live') : t('domain.status.scouted');
    btn.innerHTML = `
      <div class="domain-card-top">
        <span class="domain-num">${t('dashboard.domainLabel', { n: d.n })}</span>
        <span class="domain-status domain-status-${d.live ? 'live' : 'scouted'}">${statusLabel}</span>
      </div>
      <p class="domain-name">${t(d.nameKey)}</p>
      <p class="domain-summary">${summary}</p>
    `;
    btn.addEventListener('click', () => { location.hash = `#domain/${d.n}`; });
    grid.appendChild(btn);
  }
}
