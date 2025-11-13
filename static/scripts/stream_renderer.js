/*! GAIA V7 — StreamRenderer (client-only typewriter, no backend change)
* API:
* StreamRenderer.render(el, text, {chunk: 'word'|'char', cps: 60})
* StreamRenderer.stop()
*/
(function (window, document) {
const SR = { _timer: null, _stopping: false };


function _split(text, mode){
if (mode === 'char') return Array.from(text);
// default: word mode preserves whitespace as separators
const parts = [];
const re = /(\s+|\S+)/g; let m;
while ((m = re.exec(text)) !== null) parts.push(m[0]);
return parts;
}


function _append(el, html){ el.insertAdjacentHTML('beforeend', html); }


SR.render = function(targetEl, fullText, opts){
if (!targetEl) return;
const o = Object.assign({ chunk: 'word', cps: 80 }, opts||{}); // cps = chunks per second
SR.stop(); // cancel any previous


// Use Markdown+ to convert once up front, then progressively reveal
// Strategy: render into an off-DOM container, then reveal node-by-node
const container = document.createElement('div');
container.innerHTML = (window.GAIA && window.GAIA.mdPlus) ? window.GAIA.mdPlus(fullText) : (fullText||'');


targetEl.innerHTML = '';


// Flatten into an array of HTML chunks at text-node granularity
const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
const chunks = [];
while (walker.nextNode()) {
const txt = walker.currentNode.nodeValue || '';
const parent = walker.currentNode.parentNode;
const split = _split(txt, o.chunk);
// replace text node with empty span and stream into it
const span = document.createElement('span');
parent.replaceChild(span, walker.currentNode);
split.forEach(tok => chunks.push({ el: span, tok }));
}


// Also copy the static HTML structure (without text) to target first
// Attach the prepared container so our <span> refs remain live
targetEl.innerHTML = '';
targetEl.appendChild(container);
// Keep view at bottom while the target updates
try {
  const _mo = new MutationObserver(() => window.scrollToEndSafe?.());
  _mo.observe(targetEl, { childList: true, subtree: true });
  SR.__mo = _mo;
} catch (_) {}


let i = 0; const interval = Math.max(8, Math.floor(1000 / o.cps));
SR._stopping = false;
SR._timer = setInterval(() => {
if (SR._stopping) { clearInterval(SR._timer); SR._timer = null; return; }
if (i >= chunks.length) { clearInterval(SR._timer); SR._timer = null; _postRender(targetEl); return; }
const { el, tok } = chunks[i++];
el.insertAdjacentText('beforeend', tok);
try { window.scrollToEndSafe?.(); } catch(_) {}
}, interval);
};


function _postRender(root){
try {
// Add copy buttons to code blocks if Markdown+ didn’t
root.querySelectorAll('pre > code').forEach(code => {
if (code.parentElement.querySelector('.copy-code-btn')) return;
const btn = document.createElement('button');
btn.className = 'copy-code-btn';
btn.textContent = 'Copy';
btn.addEventListener('click', async () => {
try { await navigator.clipboard.writeText(code.textContent || ''); btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent='Copy', 1200);} catch(_){/*noop*/}
});
code.parentElement.appendChild(btn);
});
} catch(_){}
}


SR.stop = function () {
  SR._stopping = true;
  if (SR._timer) { clearInterval(SR._timer); SR._timer = null; }
  try { SR.__mo?.disconnect(); SR.__mo = null; } catch(_) {}
};



window.StreamRenderer = SR;
})(window, document);