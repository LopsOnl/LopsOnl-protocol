/* hero terminal: typewriter, 28-58ms per character */
let demoRun = 0;
async function playDemo() {
  const el = $('#demo'); if (!el) return;
  const run = ++demoRun; el.textContent = '';
  const add = h => { el.insertAdjacentHTML('beforeend', h); };
  const type = async t => {
    const s = document.createElement('span'); el.appendChild(s);
    for (const ch of t) { if (run !== demoRun) throw 0; s.textContent += ch; if (!REDUCED) await sleep(28 + Math.random() * 30); }
  };
  const pause = ms => REDUCED ? Promise.resolve() : sleep(ms);
  try {
    add('<span class="c-acc">$ </span>'); await type('lops wake'); add('\n'); await pause(300);
    add('<span class="c-ok">✓</span> awake <span class="c-dim">· blocks aligned</span>\n\n'); await pause(450);
    add('<span class="c-dim">› scanning your habits…</span>\n'); await pause(500);
    add('<span class="c-dim">› three notes filed</span>\n\n'); await pause(450);
    add('<span class="c-acc">  ■ _ ■</span>\n\n'); await pause(400);
    add('<span class="c-acc">  ✦ noted:</span> summaries first, details after <span class="c-dim">+1</span>\n\n'); await pause(600);
    add('<span class="c-dim">› drafting tomorrow\'s checklist…</span>\n'); await pause(600);
    add('<span class="c-ok">✓</span> done. idle time: <b>none</b>\n\n');
    add('<span class="c-acc">$ </span><span class="caret"></span>');
  } catch (e) {}
}
function initDemo() {
  const el = $('#demo'); if (!el) return;
  const r = $('#replay'); if (r) r.addEventListener('click', playDemo);
  if (REDUCED || !('IntersectionObserver' in window)) { playDemo(); return; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); playDemo(); } }, { threshold: 0.2 });
  io.observe(el);
}
