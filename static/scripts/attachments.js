// scripts/attachments.js
// GAIA V5 - Attachments Manager (frontend-only)
// Non-breaking: falls back to JSON when there are no files.

export class AttachmentsManager {
  constructor(opts) {
    this.maxFiles = opts?.maxFiles ?? 10;
    this.maxSizeMB = opts?.maxSizeMB ?? 25; // per-file limit
    this.accept = opts?.accept ?? "*/*"; // change if you want to restrict types later
    this.files = []; // { id, file, name, size, type, icon }
    this.ui = {
      panel: document.querySelector("#attachments-panel"),
      input: document.querySelector("#file-input"),
      trigger: document.querySelector("#btn-attach"),
      menu: document.querySelector("#attach-menu"),
      count: document.querySelector("#attachments-count"),
    };
    this.#wire();
  }

  #wire() {
    if (this.ui.input) {
      this.ui.input.setAttribute("accept", this.accept);
      this.ui.input.addEventListener("change", (e) => {
        const picked = Array.from(e.target.files || []);
        if (!picked.length) return;
        this.addFiles(picked);
        e.target.value = ""; // reset for same-file re-pick
      });
    }
    if (this.ui.trigger && this.ui.menu) {
      this.ui.trigger.addEventListener("click", () => {
        this.ui.menu.classList.toggle("open");
      });
      document.addEventListener("click", (ev) => {
        if (!this.ui.menu.contains(ev.target) && ev.target !== this.ui.trigger) {
          this.ui.menu.classList.remove("open");
        }
      });
    }
  }

  addFiles(fileList) {
    for (const f of fileList) {
      if (this.files.length >= this.maxFiles) {
        this.#toast(`Max ${this.maxFiles} files allowed.`);
        break;
      }
      const sizeMB = f.size / (1024 * 1024);
      if (sizeMB > this.maxSizeMB) {
        this.#toast(`"${f.name}" is larger than ${this.maxSizeMB} MB.`);
        continue;
      }
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.files.push({
        id,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        icon: this.#iconFor(f.type, f.name),
      });
    }
    this.render();
  }

  remove(id) {
    this.files = this.files.filter(f => f.id !== id);
    this.render();
  }

  clear() {
    this.files = [];
    this.render();
  }

  count() {
    return this.files.length;
  }

  // If attachments exist → returns FormData
  // Else → returns null (caller sends JSON as usual)
  buildFormDataIfAny(message) {
    if (!this.files.length) return null;
    const fd = new FormData();
    fd.append("message", message);
    this.files.forEach((f, idx) => {
      fd.append("files[]", f.file, f.name);
    });
    // Optional: include a tiny manifest for the server
    fd.append("attachments_meta", JSON.stringify(this.files.map(x => ({
      name: x.name, size: x.size, type: x.type
    }))));
    return fd;
  }

  // UI

  render() {
    if (!this.ui.panel) return;
    this.ui.panel.innerHTML = "";
    if (!this.files.length) {
      this.ui.panel.classList.add("hidden");
      if (this.ui.count) this.ui.count.textContent = "";
      return;
    }
    this.ui.panel.classList.remove("hidden");

    for (const f of this.files) {
      const el = document.createElement("div");
      el.className = "attach-chip";
      el.innerHTML = `
        <span class="chip-icon">${f.icon}</span>
        <span class="chip-name" title="${f.name}">${this.#truncate(f.name, 28)}</span>
        <span class="chip-size">${this.#prettySize(f.size)}</span>
        <button class="chip-x" aria-label="Remove">&times;</button>
      `;
      el.querySelector(".chip-x").addEventListener("click", () => this.remove(f.id));
      this.ui.panel.appendChild(el);
    }

    if (this.ui.count) {
      this.ui.count.textContent = `${this.files.length} file${this.files.length > 1 ? "s" : ""} attached`;
    }
  }

  // Helpers

  #iconFor(mime, name) {
    const lower = (name || "").toLowerCase();
    if (mime.startsWith("image/")) return "🖼️";
    if (mime === "application/pdf" || lower.endsWith(".pdf")) return "📄";
    if (mime.startsWith("text/") || /\.(txt|csv|log|md|json|yaml|yml|xml)$/i.test(lower)) return "📜";
    if (/\.(ppt|pptx)$/i.test(lower)) return "📊";
    if (/\.(xls|xlsx|ods|tsv|csv)$/i.test(lower)) return "📈";
    if (/\.(zip|rar|7z|tar|gz)$/i.test(lower)) return "🗜️";
    return "📎";
  }

  #prettySize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  #truncate(s, n) {
    return s.length > n ? s.slice(0, n - 3) + "…" : s;
  }

  #toast(msg) {
    // super-lightweight inline toast (non-intrusive)
    console.warn("[Attachments]", msg);
    // hook into your existing toast/snackbar if you have one
  }
}
