// panels/welcome.ts — first-visit explainer dialog: what salmi is, and which
// data is solid vs editorial vs best-effort. Reopenable via the header ⓘ.
import { t } from '../i18n';

const FLAG = 'salmi-welcome-v1';

export function init(): void {
  const dialog = document.getElementById('welcome-dialog') as HTMLDialogElement;
  const infoBtn = document.getElementById('info-btn')!;
  const dontShow = document.getElementById('welcome-dontshow')!;

  infoBtn.title = t('welcome.title');
  infoBtn.setAttribute('aria-label', t('welcome.title'));
  infoBtn.addEventListener('click', () => dialog.showModal());
  dontShow.addEventListener('click', () => {
    localStorage.setItem(FLAG, '1');
    dialog.close();
  });

  if (!localStorage.getItem(FLAG)) dialog.showModal();
}
