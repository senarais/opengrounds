import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/inter';
import './style.css';
import './visuals.css';
import { slides, sources } from './content';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="toolbar"><a class="brand" href="#slide-1"><img src="/assets/og-logo.png" alt=""/><b>Open Grounds</b><span>Pitch deck</span></a><div class="tools"><button id="replay" title="Replay slide animation (R)">Replay ↻</button><button id="sources">Sources</button><button id="notes" aria-pressed="false">Speaker notes</button><button id="overview" aria-pressed="false">Overview</button><button id="export">Export PDF</button><button id="present" class="primary">Present ↗</button></div></header>
  <main id="stage" class="stage" aria-label="Pitch presentation">${slides.map((s, i) => `<section class="frame" id="slide-${i + 1}" aria-label="Slide ${i + 1}: ${s.title}"><div class="slide ${s.className ?? ''}"><div class="slide-header"><span><img src="/assets/og-logo.png" alt=""/>Open Grounds</span><span>${s.chapter}</span></div><div class="slide-content">${s.body}</div><footer class="slide-footer"><span>${s.source}</span><b>${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</b></footer></div></section>`).join('')}</main>
  <aside id="notes-panel" class="notes-panel" hidden aria-label="Speaker notes"><div><b id="notes-title"></b><span id="notes-time"></span></div><p id="notes-text" lang="id"></p></aside>
  <nav class="navigation" aria-label="Slide navigation"><button id="prev" aria-label="Previous slide">←</button><span id="counter" aria-live="polite"></span><div class="dots">${slides.map((s, i) => `<button aria-label="Go to slide ${i + 1}: ${s.title}" data-index="${i}">${i + 1}</button>`).join('')}</div><button id="next" aria-label="Next slide">→</button><span class="key-hint">← → navigate · F fullscreen · R replay · N notes</span></nav>
  <dialog id="source-dialog"><div class="dialog-heading"><div><span>Research & attribution</span><h2>The evidence behind the deck.</h2></div><button id="close-sources" aria-label="Close sources">×</button></div><p>Verified 10 October 2026. Research figures are distinct from product assumptions and demo data.</p>${sources.map(s => `<article><a href="${s.url}" target="_blank" rel="noopener noreferrer">[${s.id}] ${s.title} ↗</a><p>${s.detail}</p></article>`).join('')}</dialog>
  <div id="toast" role="status" hidden></div>`;

let current = Math.max(0, Math.min(slides.length - 1, Number(location.hash.match(/slide-(\d+)/)?.[1] ?? 1) - 1));
let overview = false;
let notes = false;
let presenting = false;
const frames = [...document.querySelectorAll<HTMLElement>('.frame')];
const stage = document.querySelector<HTMLElement>('#stage')!;
const notePanel = document.querySelector<HTMLElement>('#notes-panel')!;
const sourceDialog = document.querySelector<HTMLDialogElement>('#source-dialog')!;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

function resize() {
  for (const frame of frames) frame.style.setProperty('--scale', String(frame.clientWidth / 1600));
}
new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);

const countFrames = new Map<Element, number>();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function formatCount(element: HTMLElement | SVGElement, value: number) {
  element.textContent = Math.round(value).toLocaleString('en-US') + (element.dataset.suffix ?? '');
}
function settleCounts() {
  countFrames.forEach(id => cancelAnimationFrame(id));
  countFrames.clear();
  document.querySelectorAll<HTMLElement | SVGElement>('[data-count]').forEach(el => formatCount(el, Number(el.dataset.count)));
}
function animateCounts(frame: HTMLElement) {
  settleCounts();
  if (reducedMotion.matches) return;
  frame.querySelectorAll<HTMLElement | SVGElement>('[data-count]').forEach((el, index) => {
    const target = Number(el.dataset.count);
    const start = performance.now() + 160 + index * 100;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 1100));
      formatCount(el, target * (1 - (1 - progress) ** 3));
      if (progress < 1) countFrames.set(el, requestAnimationFrame(tick));
      else countFrames.delete(el);
    };
    countFrames.set(el, requestAnimationFrame(tick));
  });
}
window.addEventListener('beforeprint', settleCounts);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settleCounts(); });
// Automation can request final values before inspecting the printable layout.
Object.assign(window, { finishDeckAnimations: settleCounts });

function render(replay = false) {
  document.body.classList.toggle('is-overview', overview);
  document.body.classList.toggle('is-presenting', presenting);
  document.body.classList.toggle('has-notes', notes && !overview);
  frames.forEach((frame, i) => {
    const wasActive = frame.classList.contains('active');
    frame.classList.toggle('active', current === i);
    if (overview || current !== i) frame.classList.remove('entering');
    if (current === i && !overview && (replay || !wasActive || !frame.classList.contains('entering'))) {
      frame.classList.remove('entering');
      void frame.offsetWidth;
      frame.classList.add('entering');
      animateCounts(frame);
    }
    frame.setAttribute('aria-current', current === i ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-index]').forEach((dot, i) => dot.setAttribute('aria-current', current === i ? 'true' : 'false'));
  document.querySelector('#counter')!.textContent = `${current + 1} / ${slides.length}`;
  button('prev').disabled = current === 0;
  button('next').disabled = current === slides.length - 1;
  button('overview').setAttribute('aria-pressed', String(overview));
  button('notes').setAttribute('aria-pressed', String(notes));
  notePanel.hidden = !notes || overview;
  document.querySelector('#notes-title')!.textContent = `${current + 1}. ${slides[current].title}`;
  document.querySelector('#notes-time')!.textContent = `≈${slides[current].seconds}s · Total pitch ≈3m 10s`;
  document.querySelector('#notes-text')!.textContent = slides[current].notes;
  resize();
}
function go(index: number) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  history.replaceState(null, '', `#slide-${current + 1}`);
  render();
}
button('replay').onclick = () => render(true);
button('prev').onclick = () => go(current - 1);
button('next').onclick = () => go(current + 1);
document.querySelectorAll<HTMLButtonElement>('[data-index]').forEach(dot => dot.onclick = () => go(Number(dot.dataset.index)));
frames.forEach((frame, i) => frame.onclick = () => { if (overview) { overview = false; go(i); } });
button('overview').onclick = () => { overview = !overview; render(); };
button('notes').onclick = () => { notes = !notes; render(); };
button('sources').onclick = () => sourceDialog.showModal();
button('close-sources').onclick = () => sourceDialog.close();
sourceDialog.addEventListener('click', e => { if (e.target === sourceDialog) { const r = sourceDialog.getBoundingClientRect(); const m = e as MouseEvent; if (m.clientX < r.left || m.clientX > r.right || m.clientY < r.top || m.clientY > r.bottom) sourceDialog.close(); } });
async function present() {
  overview = false;
  presenting = !presenting;
  render();
  try {
    if (presenting && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!presenting && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* Presentation layout remains available when fullscreen is unsupported. */ }
}
button('present').onclick = present;
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { presenting = false; render(); } });
button('export').onclick = async () => {
  sourceDialog.close();
  await document.fonts.ready;
  await Promise.all([...document.images].map(img => img.decode().catch(() => undefined)));
  window.print();
};
document.addEventListener('keydown', e => {
  if (sourceDialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !(e.target instanceof HTMLButtonElement))) { e.preventDefault(); go(current + 1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(slides.length - 1);
  if (e.key.toLowerCase() === 'r') render(true);
  if (e.key.toLowerCase() === 'n') { notes = !notes; render(); }
  if (e.key.toLowerCase() === 'o') { overview = !overview; render(); }
  if (e.key.toLowerCase() === 'f') void present();
  if (e.key === 'Escape') { presenting = false; overview = false; render(); }
});
window.addEventListener('hashchange', () => go(Number(location.hash.match(/slide-(\d+)/)?.[1] ?? 1) - 1));
render();
