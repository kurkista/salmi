// panels/methodology.ts — renders METHODOLOGY.md (served by the API from the
// same file GitHub shows) into a <dialog>. Same source of truth everywhere.
import { marked } from 'marked';
import { getMethodology } from '../api';

export function initMethodology(): void {
  const link = document.getElementById('methodology-link')!;
  const dialog = document.getElementById('methodology-dialog') as HTMLDialogElement;
  const body = document.getElementById('methodology-body')!;

  link.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!body.childElementCount) {
      const md = await getMethodology();
      body.innerHTML = await marked.parse(md);
    }
    dialog.showModal();
  });
}
