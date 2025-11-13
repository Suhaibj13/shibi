import time
from pathlib import Path
from typing import List, Dict, Optional
from playwright.sync_api import sync_playwright, BrowserContext, Page

Message = Dict[str, str]

class ChatGPTBrowserProvider:
    """
    Automates ChatGPT Web with Playwright.
    ⚠️ Experimental; may violate ToS and is fragile to UI changes.
    """

    def __init__(self, storage_state_path: str = "storage_state.json", headless: bool = True, timeout_ms: int = 60_000):
        self.state = storage_state_path
        self.headless = headless
        self.timeout_ms = timeout_ms

    def initial_login(self):
        """Run once interactively, log in manually, then press ENTER to save session."""
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False, slow_mo=200)
            context = browser.new_context()
            page = context.new_page()
            page.goto("https://chat.openai.com/", timeout=120_000)
            print("👉 Log in manually. When chats are visible, press ENTER here.")
            input()
            context.storage_state(path=self.state)
            browser.close()
        print(f"✅ Session saved to {self.state}")

    def _launch(self):
        if not Path(self.state).exists():
            raise RuntimeError("No storage_state.json. Run initial_login() first (headless=False).")
        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=self.headless)
        context: BrowserContext = browser.new_context(storage_state=self.state)
        page = context.new_page()
        return pw, browser, context, page

    def _new_chat(self, page: Page):
        page.goto("https://chat.openai.com/", timeout=self.timeout_ms)
        page.wait_for_load_state("networkidle", timeout=self.timeout_ms)
        btn = page.locator("button:has-text('New chat')")
        if btn.count() > 0:
            btn.first.click()

    def _send_and_wait(self, page: Page, text: str) -> str:
        box = page.get_by_role("textbox")
        box.fill(text)
        box.press("Enter")

        last_len, stable = 0, 0
        content = ""
        start = time.time()
        while time.time() - start < 60:
            bubbles = page.locator('[data-message-author-role="assistant"]')
            if bubbles.count() > 0:
                last = bubbles.nth(bubbles.count() - 1)
                try:
                    content = last.inner_text(timeout=5_000)
                except Exception:
                    pass
                if len(content) == last_len:
                    stable += 1
                else:
                    stable = 0
                    last_len = len(content)
                if stable >= 3:
                    break
            time.sleep(0.3)
        return content.strip()

    def chat(self, messages: List[Message], model: Optional[str] = None) -> str:
        # Build a compact prompt (web UI doesn't accept JSON history)
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        lines = []
        for m in messages:
            if m["role"] == "user":
                lines.append(f"User: {m['content']}")
            elif m["role"] == "assistant":
                lines.append(f"Assistant: {m['content']}")
        current = lines[-1] if lines else "User: Hello"
        prior = "\n".join(lines[:-1])[-1500:]
        compiled = ""
        if system: compiled += f"(System)\n{system}\n\n"
        if prior:  compiled += f"(Brief context)\n{prior}\n\n"
        compiled += f"(Current)\n{current}"

        pw, browser, context, page = self._launch()
        try:
            self._new_chat(page)
            page.wait_for_load_state("networkidle", timeout=self.timeout_ms)
            reply = self._send_and_wait(page, compiled)
            try: context.storage_state(path=self.state)
            except Exception: pass
            return reply
        finally:
            browser.close()
            pw.stop()
