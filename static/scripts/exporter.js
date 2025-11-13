/*! GAIA V7 — Exporter (JSON, Markdown, Share link) */
(function (window, document) {
const LS_CHATS = 'gaia_chats_v2';


function loadChats(){ try { return JSON.parse(localStorage.getItem(LS_CHATS))||[]; } catch { return []; } }
function getCurrentId(){
// Prefer app globals if present
if (window.currentId) return window.currentId;
// Fallback: active row index in #chat-list
const rows = Array.from(document.querySelectorAll('#chat-list .chat-item'));
const idx = rows.findIndex(r => r.classList.contains('active') || r.getAttribute('aria-current')==='true');
const all = loadChats();
return (idx>=0 && all[idx]) ? all[idx].id : (all[0]?.id || null);
}
function getChatById(id){ return loadChats().find(c => String(c.id)===String(id)); }


function toMarkdown(chat){
const lines = [];
const title = chat.name || 'Untitled chat';
lines.push(`# ${title}`);
(chat.history||[]).forEach(m => {
const role = m.role==='user' ? 'You' : (m.role==='assistant'?'GAIA':m.role);
const ts = m.time ? new Date(m.time).toLocaleString() : '';
lines.push(`\n---\n**${role}** ${ts ? ` _(${ts})_` : ''}\n\n${m.content||''}`);
});
return lines.join('\n');
}


function download(filename, text, type='text/plain'){
const blob = new Blob([text], { type });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = filename; a.click();
setTimeout(()=>URL.revokeObjectURL(url), 1500);
}


async function copyShareLink(chat){
// Encode chat JSON into a shareable blob URL
const data = JSON.stringify(chat);
const blob = new Blob([data], { type: 'application/json' });
const url = URL.createObjectURL(blob);
try { await navigator.clipboard.writeText(url); toast('Share link copied'); } catch(_) { prompt('Copy link:', url); }
}


function toast(msg){ console.log('[Export]', msg); }


function ensureButtons(){
const bar = document.querySelector('.topbar');
if (!bar) return;
if (bar.querySelector('#btn-export-json')) return; // already added
const wrap = document.createElement('div');
wrap.className = 'toolbar';
wrap.innerHTML = `
<button class="btn compact ghost" id="btn-export-json" title="Export JSON">Export JSON</button>
<button class="btn compact ghost" id="btn-export-md" title="Export Markdown">Export MD</button>
<button class="btn compact ghost" id="btn-share-chat" title="Copy share link">Share</button>
`;
bar.appendChild(wrap);


wrap.querySelector('#btn-export-json').onclick = () => {
const id = getCurrentId(); const chat = id && getChatById(id); if (!chat) return;
download((chat.name||'chat') + '.json', JSON.stringify(chat, null, 2), 'application/json');
};
wrap.querySelector('#btn-export-md').onclick = () => {
const id = getCurrentId(); const chat = id && getChatById(id); if (!chat) return;
download((chat.name||'chat') + '.md', toMarkdown(chat), 'text/markdown');
};
wrap.querySelector('#btn-share-chat').onclick = async () => {
const id = getCurrentId(); const chat = id && getChatById(id); if (!chat) return; await copyShareLink(chat);
};
}


document.addEventListener('DOMContentLoaded', ensureButtons);
})(window, document);