/* CA slot: inert unless the register says stated. The build renders the markup; this wires copy only. */
function initCA() {
  const bar = $('.ca-bar'); if (!bar) return;
  const rec = REG.ca;
  if (!isStated(rec) || !BASE58.test(rec.value || '')) return; /* inert: no handler attached at all */
  const btn = $('.ca-v', bar), cp = $('.ca-copy', bar);
  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(rec.value); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea'); ta.value = rec.value; ta.style.position = 'fixed'; ta.style.opacity = 0;
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e2) {}
    }
    if (ok) {
      bar.classList.add('copied'); cp.textContent = 'copied ✓'; toast('Contract address copied');
      setTimeout(() => { bar.classList.remove('copied'); cp.textContent = 'copy'; }, 1600);
    } else toast('Copy blocked: select the address instead');
  };
  btn.addEventListener('click', copy); cp.addEventListener('click', copy);
}
