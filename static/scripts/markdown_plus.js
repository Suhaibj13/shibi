/*! GAIA V7 — Markdown+ (tiny, dependency-free) */
(function (window) {
function esc(s=''){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }


// --- REPLACE fencedCodeBlocks + mdPlus in markdown_plus.js ---

// Minimal, safe auto-fencing for common languages.
// Only runs if there are no existing ``` fences.
function autoFenceCode(text) {
  if (!text) return text;
  if (/```/.test(text)) return text;         // already fenced

  const t = text.trim();

  // JSON
  if ((t.startsWith("{") || t.startsWith("[")) && /":\s*/.test(t)) {
    return "```json\n" + t + "\n```";
  }

  // HTML / XML
  if (/<!doctype html>|<html[\s>]|<\/\w+>|<\w+[^>]*>/i.test(t)) {
    return "```html\n" + t + "\n```";
  }

  // SQL
  if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|GROUP BY|ORDER BY|LIMIT)\b/i.test(t)) {
    return "```sql\n" + t + "\n```";
  }

  // Python
  if (/\b(def|class|import|from|with|except|elif|self)\b/.test(t) || /^>>> /m.test(t)) {
    return "```python\n" + t + "\n```";
  }

  // JS / TS
  if (/\b(const|let|var|function|=>|import\s+.*from|export\s+(default|const|function)|console\.log)\b/.test(t)) {
    return "```javascript\n" + t + "\n```";
  }

  // Bash / Shell
  if (/^#!\/bin\/bash/m.test(t) || /^\$\s+\w+/m.test(t)) {
    return "```bash\n" + t + "\n```";
  }

  // CSS
  if (/\b\w+\s*\{[^}]*\}/.test(t) && /[;:{}]/.test(t) && !/<\w/.test(t)) {
    return "```css\n" + t + "\n```";
  }

  // YAML
  if (/^\s*\w[\w-]*:\s+.+/m.test(t) && !/[{}]/.test(t)) {
    return "```yaml\n" + t + "\n```";
  }

  return text; // default: leave as-is
}

// 1) Lift fenced code blocks into placeholders and keep their HTML safe.
function fencedCodeBlocks_lift(source) {
  const blocks = [];
  const text = String(source || "");

  // ```lang\n ... \n```
  const lifted = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => {
    const i = blocks.length;
    const safeCode = esc(code);                  // escape code content ONLY
    const klass = `lang-${esc(lang || "")}`;     // lang class for highlighter
    const html = `\n<pre><code class="${klass}">${safeCode}</code></pre>\n`;
    blocks.push(html);
    return `\uE000BLOCK${i}\uE000`;              // unique placeholder
  });

  return { lifted, blocks };
}

// 2) Put placeholders back into the string.
function fencedCodeBlocks_restore(text, blocks) {
  return String(text || "").replace(/\uE000BLOCK(\d+)\uE000/g, (_, n) => blocks[Number(n)] || "");
}
function inlineCode(s){ return s.replace(/`([^`]+)`/g, (m, x)=>`<code>${esc(x)}</code>`); }
function boldItalics(s){
s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
s = s.replace(/__([^_]+)__/g, '<b>$1</b>');
s = s.replace(/_([^_]+)_/g, '<i>$1</i>');
return s;
}
function headings(s){ return s.replace(/^\s{0,3}(#{1,6})\s+(.+)$/gm, (m, h, t)=>`<h${h.length}>${t}</h${h.length}>`); }
function lists(s){
// unordered
s = s.replace(/(^|\n)(?:\s*)([-*])\s+(.+)(?=\n|$)/g, (m, p, b, t)=>`${p}<li>${t}</li>`);
s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, m=>`<ul>\n${m}\n</ul>`);
// ordered (simple)
s = s.replace(/(^|\n)(\d+)\.\s+(.+)(?=\n|$)/g, (m,p,i,t)=>`${p}<li>${t}</li>`);
s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, m=>m.includes('<ul>')?m:`<ul>\n${m}\n</ul>`);
return s;
}
function tables(s){
// pipe tables (very small parser)
const lines = s.split(/\n/);
const out = [];
for (let i=0; i<lines.length; i++){
const row = lines[i];
if (/^\|.+\|$/.test(row) && i+1<lines.length && /^\|?\s*[:-]+\s*(\|\s*[:-]+\s*)+\|?$/.test(lines[i+1])){
const head = row; const sep = lines[++i];
const cells = head.slice(1,-1).split('|').map(c=>c.trim());
const body = [];
while (i+1<lines.length && /^\|.+\|$/.test(lines[i+1])){
const r = lines[++i];
body.push('<tr>'+r.slice(1,-1).split('|').map(c=>`<td>${esc(c.trim())}</td>`).join('')+'</tr>');
}
out.push('<table>');
out.push('<thead><tr>'+cells.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr></thead>');
if (body.length) out.push('<tbody>'+body.join('')+'</tbody>');
out.push('</table>');
} else out.push(row);
}
return out.join('\n');
}
function links(s){
return s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (m, txt, href, title)=>{
const t = title?` title="${esc(title)}"`:''; return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${t}>${esc(txt)}</a>`;
});
}


function mdPlus(s = "") {
  // A) Lift code blocks first
  const lifted = fencedCodeBlocks_lift(s);
  let x = lifted.lifted;

  // B) Now safely escape the remaining text (NOT the code blocks)
  x = esc(x);

  // C) Inline formatting on the escaped text
  x = x.replace(/`([^`]+)`/g, (m, t) => `<code>${esc(t)}</code>`);           // inline code
  x = x.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");                            // bold
  x = x.replace(/\*([^*]+)\*/g, "<i>$1</i>");                                // italics
  x = x.replace(/__([^_]+)__/g, "<b>$1</b>").replace(/_([^_]+)_/g, "<i>$1</i>");

  // D) Headings, tables, lists, links
  x = x.replace(/^\s{0,3}(#{1,6})\s+(.+)$/gm, (m, h, t) => `<h${h.length}>${t}</h${h.length}>`);

  // tiny pipe-table parser (unchanged from your version but on escaped text)
  (function tables() {
    const lines = x.split(/\n/); const out = [];
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i];
      if (/^\|.+\|$/.test(row) && i + 1 < lines.length && /^\|?\s*[:-]+\s*(\|\s*[:-]+\s*)+\|?$/.test(lines[i + 1])) {
        const head = row; i++;
        const body = [];
        while (i + 1 < lines.length && /^\|.+\|$/.test(lines[i + 1])) {
          const r = lines[++i];
          body.push("<tr>" + r.slice(1, -1).split("|").map(c => `<td>${esc(c.trim())}</td>`).join("") + "</tr>");
        }
        const cells = head.slice(1, -1).split("|").map(c => c.trim());
        out.push("<table>");
        out.push("<thead><tr>" + cells.map(c => `<th>${esc(c)}</th>`).join("") + "</tr></thead>");
        if (body.length) out.push("<tbody>" + body.join("") + "</tbody>");
        out.push("</table>");
      } else out.push(row);
    }
    x = out.join("\n");
  })();

  // unordered + ordered lists (same logic as before)
  x = x.replace(/(^|\n)(?:\s*)([-*])\s+(.+)(?=\n|$)/g, (m, p, b, t) => `${p}<li>${t}</li>`);
  x = x.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>\n${m}\n</ul>`);
  x = x.replace(/(^|\n)(\d+)\.\s+(.+)(?=\n|$)/g, (m, p, i, t) => `${p}<li>${t}</li>`);
  x = x.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, m => m.includes("<ul>") ? m : `<ul>\n${m}\n</ul>`);

  // links
  x = x.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (m, txt, href, title) => {
    const t = title ? ` title="${esc(title)}"` : "";
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${t}>${esc(txt)}</a>`;
  });

  // E) Restore code blocks (already safe & unescaped)
  x = x.replace(/\n{2,}/g, "\n\n").replace(/\n/g, "<br>");

  // E2) Trim stray <br> around block elements to avoid big gaps
  x = x
    // drop <br> right before any block tag
    .replace(/(?:<br>\s*)+(?=(<\/?(?:ul|ol|li|pre|table|thead|tbody|tr|th|td|h[1-6]|p)\b))/gi, '')
    // drop <br> right after block tags
    .replace(/((?:<\/?(?:ul|ol|li|pre|table|thead|tbody|tr|th|td|h[1-6]|p)\b[^>]*>)+)\s*(?:<br>\s*)+/gi, '$1')
    // collapse 3+ <br> to just two
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>');

  // F) Line breaks
  x = fencedCodeBlocks_restore(x, lifted.blocks);
  return x;
}

// expose (leave this in your file)
window.GAIA = window.GAIA || {};
window.GAIA.mdPlus = mdPlus;
// tell the app we're ready (helps the "first paint" race)
if (!window.GAIA._mdReadyFired) {
  window.GAIA._mdReadyFired = true;
  document.dispatchEvent(new CustomEvent('gaia:mdplus-ready'));
}
})(window);

