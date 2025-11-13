/*!
 * GAIA V5 — Spaces (folder-type) with per-space setting (SOP)
 * Non-breaking add-on. Include AFTER app.js.
 * - Sidebar: "Spaces" (with nested chats) + "Chats" (unassigned) sections.
 * - Space Home (main area): SOP card + Settings/Edit setting + New chat.
 * - Payload: Prepends {role:"system", content:<spaceSetting>} to /ask history for chats in that space.
 */
(function (window, document) {
    // ---- Storage keys ----
    const LS_SPACES = "gaia_spaces_v1";
    const LS_CHAT_SPACE = "gaia_chat_space_v1"; // map: chatId -> spaceId
    const LS_CHATS = "gaia_chats_v2";           // existing chats storage in app.js
    const LS_COLLAPSE = "gaia_spaces_collapse_v1"; // spaceId -> true (collapsed)

    const loadCollapse = () => { try { return JSON.parse(localStorage.getItem(LS_COLLAPSE)) || {}; } catch { return {}; } };
    const saveCollapse = (m) => localStorage.setItem(LS_COLLAPSE, JSON.stringify(m || {}));

    // ---- Dom helpers ----
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  
    // ---- Spaces model ----
    const loadSpaces = () => { try { return JSON.parse(localStorage.getItem(LS_SPACES)) || []; } catch { return []; } };
    const saveSpaces = (x) => localStorage.setItem(LS_SPACES, JSON.stringify(x || []));
    const loadMap    = () => { try { return JSON.parse(localStorage.getItem(LS_CHAT_SPACE)) || {}; } catch { return {}; } };
    const saveMap    = (m) => localStorage.setItem(LS_CHAT_SPACE, JSON.stringify(m || {}));
    const loadChats  = () => { try { return JSON.parse(localStorage.getItem(LS_CHATS)) || []; } catch { return []; } };
  
    const getSpace   = (id) => loadSpaces().find(s => s.id === id) || null;
    const setSetting = (id, text) => { const xs = loadSpaces().map(s => s.id===id ? {...s, setting: text||""} : s); saveSpaces(xs); };
    const createSpace = (name="New space") => {
      const xs = loadSpaces();
      const id = "sp_" + Date.now();
      xs.push({ id, name, setting: "" });
      saveSpaces(xs);
      return id;
    };
    const assignChat = (chatId, spaceId) => { const map = loadMap(); map[String(chatId)] = spaceId || null; saveMap(map); };
    const spaceOf    = (chatId) => (loadMap()[String(chatId)] || null);
    function renameSpace(id, name) {
    const nm = String(name || '').trim() || 'Untitled space';
    const xs = loadSpaces().map(s => s.id === id ? { ...s, name: nm } : s);
    saveSpaces(xs);
    }

    function deleteSpace(id) {
    // remove the space
    saveSpaces(loadSpaces().filter(s => s.id !== id));
    // detach chats from this space
    const map = loadMap();
    Object.keys(map).forEach(k => { if (map[k] === id) delete map[k]; });
    saveMap(map);
    // if this space is open, close its card
    const open = document.querySelector('#space-home');
    if (open && open.dataset.spaceId === id) closeSpaceHome();
    }

    function toggleCollapse(id, container) {
    const state = loadCollapse();
    const willCollapse = !container.classList.contains('collapsed');
    if (willCollapse) {
        container.classList.add('collapsed');
        state[id] = true;
    } else {
        container.classList.remove('collapsed');
        delete state[id];
    }
    saveCollapse(state);
    }
  
    // ---- Sidebar sections ----
    function ensureSidebarSections() {
      const sidebar = $('.sidebar');
      if (!sidebar) return {};
  
      // Spaces section (top)
      let spacesSec = sidebar.querySelector('.spaces-section');
      if (!spacesSec) {
        spacesSec = document.createElement('div');
        spacesSec.className = 'spaces-section';
        spacesSec.innerHTML = `
          <div class="sidebar-head">
            <div class="sidebar-title">Spaces</div>
            <button class="btn ghost" id="spaces-add">+ New space</button>
          </div>
          <div class="spaces-list" id="spaces-list"></div>
        `;
        // insert before the existing chat list section
        const chatList = $('#chat-list');
        sidebar.insertBefore(spacesSec, chatList?.parentElement?.classList.contains('chats-section') ? chatList.parentElement : chatList);
      }
  
      // Wrap the existing chat list as its own "Chats" section (if not already)
      let chatsWrap = sidebar.querySelector('.chats-section');
      const chatList = $('#chat-list');
      if (chatList && !chatsWrap) {
        chatsWrap = document.createElement('div');
        chatsWrap.className = 'chats-section';
        chatsWrap.innerHTML = `
          <div class="sidebar-head">
            <div class="sidebar-title">Chats</div>
          </div>
        `;
        chatList.parentElement.insertBefore(chatsWrap, chatList);
        chatsWrap.appendChild(chatList); // move list inside section
      }
  
      // New space button
      spacesSec.querySelector('#spaces-add').onclick = () => {
        const name = prompt('Space name:', 'New space');
        if (name === null) return;                    // ← cancel: do nothing
        const id = createSpace((name || '').trim() || 'New space');
        renderSpaces();
        openSpaceHome(id);
      };
      // V6: place "New chat" and "Clear all" UNDER the Chats header (above the list)
      {
        // clean up any older placement we might have added
        const oldQuick = document.querySelector('.rail-quick');
        if (oldQuick) oldQuick.remove();

        const sidebar = $('.sidebar');
        const newBtn = document.getElementById('new-chat');
        const clrBtn = document.getElementById('clear-all');

        if (sidebar && (newBtn || clrBtn)) {
          // Ensure Chats section wrapper exists (we already wrap #chat-list earlier)
          let chatsWrap = sidebar.querySelector('.chats-section');
          const chatList = $('#chat-list');

          if (chatList && !chatsWrap) {
            chatsWrap = document.createElement('div');
            chatsWrap.className = 'chats-section';
            chatsWrap.innerHTML = `
              <div class="sidebar-head">
                <div class="sidebar-title">Chats</div>
              </div>
            `;
            chatList.parentElement.insertBefore(chatsWrap, chatList);
            chatsWrap.appendChild(chatList);
          }

          // Inject an actions row right under the Chats header
          if (chatsWrap) {
            let actions = chatsWrap.querySelector('.chats-actions');
            if (!actions) {
              actions = document.createElement('div');
              actions.className = 'chats-actions';
              const head = chatsWrap.querySelector('.sidebar-head');
              if (head && head.nextSibling) {
                chatsWrap.insertBefore(actions, head.nextSibling);
              } else {
                chatsWrap.appendChild(actions);
              }
            }
            if (newBtn && !actions.contains(newBtn)) actions.appendChild(newBtn);
            if (clrBtn && !actions.contains(clrBtn)) actions.appendChild(clrBtn);
          }
        }
      }


      return { spacesSec, chatsWrap, chatList };
    }
  
    // Build nested chat list for a space
    function renderSpaceItem(space, chats, map) {
      const container = document.createElement('div');
      container.className = 'space-item';
      container.dataset.id = space.id;
  
      // header row
      const header = document.createElement('div');
      header.className = 'space-row';
      const collapsed = !!loadCollapse()[space.id];

        header.innerHTML = `
          <span class="folder-ico" aria-label="Toggle"></span>
          <span class="space-name" title="${esc(space.name)}">${esc(space.name)}</span>

          <span class="space-actions">
            <button class="icon-ghost space-rename" aria-label="Rename" title="Rename">✎</button>
            <button class="icon-ghost space-delete" aria-label="Delete" title="Delete">🗑</button>
          </span>
        `;
        if (collapsed) container.classList.add('collapsed');


        // caret toggles expand/collapse (doesn’t open the space card)
        header.querySelector('.folder-ico').onclick = (e) => {
          e.stopPropagation();
          toggleCollapse(space.id, container);
        };

        // clicking the name opens the Space SOP card
        header.querySelector('.space-name').onclick = (e) => {
        e.stopPropagation();
        openSpaceHome(space.id);
        };

        // rename
        header.querySelector('.space-rename').onclick = (e) => {
          e.stopPropagation();
          const current = getSpace(space.id)?.name || 'New space';
          const nm = prompt('Rename space:', current);
          if (nm === null) return;                      // ← cancel: do nothing
          renameSpace(space.id, nm);
          renderSpaces();
        };


        // delete
        header.querySelector('.space-delete').onclick = (e) => {
        e.stopPropagation();
        const nm = getSpace(space.id)?.name || 'this space';
        if (confirm(`Delete "${nm}"? Chats will stay under Chats (unassigned).`)) {
            deleteSpace(space.id);
            renderSpaces();
        }
    };

  
      // nested list (chats inside this space)
      const list = document.createElement('div');
      list.className = 'space-chats';
      const spaceChats = chats.filter(c => map[c.id] === space.id);
  
      list.innerHTML = spaceChats.map((c) => `
        <div class="chat-item" data-chat-id="${esc(c.id)}">
            <div class="chat-name">${esc(c.name || 'Untitled')}</div>
            <div class="item-actions">
            <button class="icon-ghost chat-rename" title="Rename" aria-label="Rename">✎</button>
            <button class="icon-ghost chat-delete" title="Delete" aria-label="Delete">🗑</button>
            </div>
        </div>
        `).join('') || `<div class="space-empty">No chats in this space.</div>`;

  
      // clicking a nested chat should open the real chat in the app
      list.addEventListener('click', (e) => {
        // 1) Rename inside space
        const rnBtn = e.target.closest('.chat-rename');
        if (rnBtn) {
            e.stopPropagation();
            const item = rnBtn.closest('.chat-item');
            const chatId = item?.getAttribute('data-chat-id');
            const all = loadChats();
            const idx = all.findIndex(c => c.id === chatId);
            const original = $('#chat-list');
            if (idx >= 0 && original) {
            const row = original.querySelector(`.chat-item:nth-child(${idx+1})`);
            row?.querySelector('.item-actions button[title="Rename"]')?.click();
            }
            return;
        }

        // 2) Delete inside space
        const delBtn = e.target.closest('.chat-delete');
        if (delBtn) {
            e.stopPropagation();
            const item = delBtn.closest('.chat-item');
            const chatId = item?.getAttribute('data-chat-id');
            const all = loadChats();
            const idx = all.findIndex(c => c.id === chatId);
            const original = $('#chat-list');
            if (idx >= 0 && original) {
            const row = original.querySelector(`.chat-item:nth-child(${idx+1})`);
            row?.querySelector('.item-actions button[title="Delete"]')?.click();
            }
            return;
        }

        // 3) Otherwise: open the chat (and close Space Home)
        const container = e.target.closest('.chat-item');
        if (!container) return;
        const chatId = container.getAttribute('data-chat-id');
        const all = loadChats();
        const idx = all.findIndex(c => c.id === chatId);
        const original = $('#chat-list');
        if (idx >= 0 && original) {
            const row = original.querySelector(`.chat-item:nth-child(${idx+1})`);
            row?.click();
        }
        // If you added this helper earlier, keep it
        if (typeof closeSpaceHome === 'function') closeSpaceHome();
        });
  
      container.appendChild(header);
      container.appendChild(list);
      return container;
    }
  
    function renderSpaces() {
      const { spacesSec } = ensureSidebarSections();
      const listEl = spacesSec?.querySelector('#spaces-list');
      if (!listEl) return;
  
      const spaces = loadSpaces();
      const chats  = loadChats();
      const map    = loadMap();
  
      listEl.innerHTML = "";
      spaces.forEach(sp => listEl.appendChild(renderSpaceItem(sp, chats, map)));
  
      // After rendering spaces, hide assigned chats in the original chat list (so "Chats" below only shows unassigned)
      hideAssignedInChatList();
    }
  
    function hideAssignedInChatList() {
      const original = $('#chat-list');
      if (!original) return;
      const all = loadChats();
      const map = loadMap();
      const rows = $$('.chat-item', original); // same order as loadAll()
      rows.forEach((row, i) => {
        const c = all[i];
        const assigned = !!map[c.id];
        row.style.display = assigned ? 'none' : ''; // only unassigned remain visible
      });
    }
  
    // ---- Space Home (SOP + buttons) in main column ----
    function openSpaceHome(spaceId) {
      const sp = getSpace(spaceId);
      if (!sp) return;
  
      const chatCol = $('.chat-column');
      if (!chatCol) return;
  
      let home = $('#space-home', chatCol);
      if (!home) {
        home = document.createElement('div');
        home.id = 'space-home';
        home.className = 'space-home';
        chatCol.appendChild(home);
      }
      home.dataset.spaceId = spaceId; // ← always update to current
  
      // Hide messages & composer while space-home is visible
      const msg = $('#messages', chatCol);
      const comp = $('.composer', chatCol);
      if (msg) msg.style.display = 'none';
      if (comp) comp.style.display = 'none';
  
      home.innerHTML = `
        <div class="sop-card">
          <div class="sop-title">${esc(sp.name)} — Space SOP</div>
          <div class="sop-body">${sp.setting ? mdLite(sp.setting) : '<em>No setting yet. Click Settings to add one.</em>'}</div>
          <div class="sop-actions">
            <button id="space-setting" class="btn">${sp.setting ? 'Edit setting' : 'Settings'}</button>
            <button id="space-newchat" class="btn">New chat</button>
          </div>
        </div>
      `;
  
      $('#space-setting', home).onclick = () => {
        const current = getSpace(spaceId)?.setting || '';
        const val = prompt('Space setting (applies to all chats in this space):', current);
        if (val === null) return; // canceled
        setSetting(spaceId, val);
        renderSpaces();           // refresh badges
        openSpaceHome(spaceId);   // re-render card
      };
  
      $('#space-newchat', home).onclick = () => {
        // record count before
        const before = loadChats().length;

        // let the host create the chat (this will prompt; your app.js now guards Cancel)
        $('#new-chat')?.click();

        // after host handles it, only assign if a new chat exists
        setTimeout(() => {
          try {
            const after = loadChats().length;
            if (after > before) {                     // ← only when a new chat was created
              const newest = loadChats()[0];          // newest first
              if (newest) assignChat(newest.id, spaceId);
              renderSpaces();
            }
            closeSpaceHome();
          } catch(_) { closeSpaceHome(); }
        }, 0);
      };

    }
  
    function closeSpaceHome() {
      const chatCol = $('.chat-column');
      if (!chatCol) return;
      $('#space-home', chatCol)?.remove();
      $('#messages', chatCol)?.style.removeProperty('display');
      $('.composer', chatCol)?.style.removeProperty('display');
    }
  
    // ---- Inject per-space system prompt into /ask ----
    // V6: inject Space SOP into /ask WITHOUT breaking file uploads
    const _fetch = window.fetch.bind(window);
    window.fetch = async function(url, opts) {
      try {
        if (typeof url === 'string' && url.includes('/ask') && opts && opts.body) {
          // resolve active space setting
          let chatId = null;
          if (opts.body instanceof FormData) {
            chatId = String(opts.body.get('chatId') || '') || null;
          } else {
            let bodyObj = opts.body;
            if (typeof bodyObj === 'string') { try { bodyObj = JSON.parse(bodyObj); } catch {} }
            chatId = bodyObj?.chatId || null;
          }
          if (!chatId) {
            // fallback to your current best-guess
            const all = loadChats();
            const current = all.find(c => c.history && c.history.length && c.history[c.history.length - 1].role) || all[0];
            chatId = current?.id || null;
          }
          const spId = chatId ? spaceOf(chatId) : null;
          const setting = spId ? (getSpace(spId)?.setting || '') : '';
          // (keep your existing JSON/FormData history-prepend logic below)
          // resolve active space setting
          const all = loadChats();
          let current = all.find(c => c.history && c.history.length && c.history[c.history.length - 1].role) || all[0];

          if (setting) {
            const sys = { role: 'system', content: String(setting) };

            // ---- A) Multipart path (FormData with files): DO NOT stringify ----
            if (opts.body instanceof FormData) {
              const fd = opts.body;

              // read existing history (added by app.js), prepend system, write back
              let raw = fd.get('history') || '[]';
              let hist = [];
              try { hist = JSON.parse(raw); } catch {}
              hist = [sys, ...hist];

              fd.delete('history');
              fd.append('history', JSON.stringify(hist));

              // leave opts.body as FormData (files stay intact)
            }
            // ---- B) JSON path (no files): safely inject into JSON body ----
            else {
              let body = opts.body;
              if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
              if (body && typeof body === 'object') {
                const hist = Array.isArray(body.history) ? body.history : [];
                body.history = [sys, ...hist];
                opts.body = JSON.stringify(body);
                // headers left as-is (host likely already sets Content-Type)
              }
            }
          }
        }
      } catch (_) { /* fail open */ }

      return _fetch(url, opts);
    };

  
    // ---- Observe #chat-list to stay in sync with host renderSidebar ----
    function observeChatList() {
      const list = $('#chat-list');
      if (!list || !window.MutationObserver) return;
      const obs = new MutationObserver(() => {
        // Whenever app.js re-renders chats, re-hide assigned ones
        hideAssignedInChatList();
        renderSpaces();
      });
      obs.observe(list, { childList: true });
    }
  
    // ---- Small utils ----
    const esc = (s='') => s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const mdLite = (s='') => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/\n/g,'<br>');
  
    // ---- Boot ----
    document.addEventListener('DOMContentLoaded', () => {
      ensureSidebarSections();
      renderSpaces();
      observeChatList();
  
      // If user clicks any chat (original list), ensure the space-home is hidden
      document.addEventListener('click', (e) => {
        if (e.target.closest('#chat-list .chat-item')) closeSpaceHome();
      });
    });
  
    // Optional API
    window.Spaces = {
        createSpace, setSetting, assignChat, spaceOf, getSpace, renderSpaces,
        closeSpaceHome, renameSpace, deleteSpace, toggleCollapse
    };
    window.Spaces.closeSpaceHome = closeSpaceHome;  // ← add this line
  })(window, document);
  