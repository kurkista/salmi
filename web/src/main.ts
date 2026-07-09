import './styles.css';
import { initI18n } from './i18n';
import { getState } from './api';
import { connectSSE } from './sse';
import { initMap, updateVessels } from './map';
import * as status from './panels/status';
import * as markets from './panels/markets';
import * as hilkka from './panels/hilkka';
import { initMethodology } from './panels/methodology';

async function boot() {
  await initI18n();
  const state = await getState();

  initMap(document.getElementById('map')!, state.vessels);
  await status.init(state);
  await markets.init(state);
  await hilkka.init();
  initMethodology();

  connectSSE({
    vessels: updateVessels,
    transit: status.onTransit,
    hpi: status.onHpi,
    metric: (m) => { markets.onMetric(m); hilkka.onMetric(m); },
    headline: markets.onHeadline,
  });
}

boot().catch((err) => {
  console.error('boot failed', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div style="position:fixed;inset:auto 12px 12px;background:#d03b3b;color:#fff;padding:10px 14px;border-radius:8px">salmi failed to load — is the server running?</div>',
  );
});
