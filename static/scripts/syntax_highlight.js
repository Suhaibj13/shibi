/*! GAIA V7 — ultra-light syntax highlight (JS/CSS/HTML/Python)
 *  No deps. Safe: only runs inside #messages, once per block.
 *  Exposes: window.GAIA.highlight(root?)
 */
(function (w, d) {
  const GAIA = (w.GAIA = w.GAIA || {});
  const SEL = 'pre > code';

  const langs = {
    js: /^(js|javascript|jsx|ts|tsx)$/i,
    css: /^css$/i,
    html: /^(html|xml|svg)$/i,
    py: /^(py|python)$/i,
  };

  function esc(s = '') {
    return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  // very small tokenizers (order matters; non-overlapping best-effort)
  function tintJS(src) {
    src = src
      .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="tok-com">$1</span>')               // comments
      .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g, '<span class="tok-str">$&</span>')             // strings
      .replace(/\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$&</span>')        // numbers
      .replace(/\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|super|import|from|export|default|async|await|yield|in|of|this|delete|typeof|instanceof|void)\b/g, '<span class="tok-kw">$&</span>') // keywords
      .replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, '<span class="tok-fn">$1</span>');                   // functions
    return src;
  }

  function tintCSS(src) {
    src = src
      .replace(/\/\*[\s\S]*?\*\//g, '<span class="tok-com">$&</span>')                            // comments
      .replace(/(:\s*)([^;{}]+)/g, (m, p1, p2) => p1 + '<span class="tok-str">' + p2 + '</span>') // values
      .replace(/([#.]?[A-Za-z_-][\w-]*)(?=\s*\{)/g, '<span class="tok-kw">$1</span>')             // selectors
      .replace(/([A-Za-z-]+)(?=\s*:)/g, '<span class="tok-attr">$1</span>');                      // properties
    return src;
  }

  function tintHTML(src) {
    // tags + attrs
    src = src
      .replace(/<!--[\s\S]*?-->/g, '<span class="tok-com">$&</span>')
      .replace(/(&lt;\/?)([A-Za-z][\w:-]*)([^&]*?)(&gt;)/g, (m, open, tag, rest, close) => {
        rest = rest
          .replace(/([A-Za-z_:][-A-Za-z0-9_:.]*)(=)/g, '<span class="tok-attr">$1</span>$2')
          .replace(/=(".*?"|'.*?')/g, '=<span class="tok-str">$1</span>');
        return open + '<span class="tok-tag">' + tag + '</span>' + rest + close;
      });
    return src;
  }

  function tintPY(src) {
    src = src
      .replace(/(#.*)$/gm, '<span class="tok-com">$1</span>')
      .replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g, '<span class="tok-str">$1</span>')
      .replace(/\b\d+(?:\.\d+)?\b/g, '<span class="tok-num">$&</span>')
      .replace(/\b(?:def|class|return|if|elif|else|for|while|try|except|finally|raise|with|as|lambda|import|from|pass|break|continue|yield|global|nonlocal|assert|del|in|is|not|and|or)\b/g, '<span class="tok-kw">$&</span>')
      .replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, '<span class="tok-fn">$1</span>');
    return src;
  }

  function paint(codeEl) {
    if (!codeEl || codeEl.dataset.hl === '1') return;
    const langCls = (codeEl.className || '').toLowerCase(); // e.g., lang-js
    const lang = (langCls.match(/lang-([\w-]+)/) || [,''])[1];

    let src = codeEl.textContent || '';
    src = esc(src);

    if (langs.js.test(lang))   src = tintJS(src);
    else if (langs.css.test(lang))  src = tintCSS(src);
    else if (langs.html.test(lang)) src = tintHTML(src);
    else if (langs.py.test(lang))   src = tintPY(src);
    // unknown: still gets nice code block styling without colors

    codeEl.innerHTML = src;
    codeEl.dataset.hl = '1';
  }

  function highlight(root) {
    const scope = root || d;
    scope.querySelectorAll(SEL).forEach(paint);
  }

  // run now + observe future message inserts
  d.addEventListener('DOMContentLoaded', () => {
    highlight();
    const host = d.body;
    if (!w.MutationObserver || !host) return;
    const mo = new MutationObserver((muts) => {
      muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n => {
        if (n.nodeType === 1) highlight(n);
      }));
    });
    mo.observe(host, { childList: true, subtree: true });
  });

  GAIA.highlight = highlight;
})(window, document);
