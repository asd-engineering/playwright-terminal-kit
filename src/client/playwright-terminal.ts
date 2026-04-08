/**
 * Playwright page object for interacting with xterm.js terminals.
 * Provides a high-level API for terminal testing via browser automation.
 *
 * @module client/playwright-terminal
 */

import type { Page, Locator } from "@playwright/test";
import { stripAnsi, normalizeTerminalOutput } from "../util/ansi.js";
import type { PlaywrightTerminalConfig, AuthConfig } from "../config/schema.js";

/** Default terminal configuration */
const DEFAULTS: PlaywrightTerminalConfig = {
  readyTimeoutMs: 15000,
  textTimeoutMs: 10000,
  typeDelayMs: 50,
  xtermSelector: ".xterm, .terminal, [class*='term']",
  xtermInputSelector: ".xterm-helper-textarea",
  xtermScreenSelector: ".xterm-screen",
};

/** Simple sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Build a URL with HTTP Basic Auth credentials embedded.
 */
function buildAuthUrl(baseUrl: string, auth: AuthConfig): string {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(auth.username);
  url.password = encodeURIComponent(auth.password);
  return url.toString();
}

/**
 * Terminal content snapshot.
 */
export interface TerminalContent {
  /** Raw HTML content */
  html: string;
  /** Text content extracted from terminal */
  text: string;
  /** Normalized text for comparison */
  normalized: string;
}

/**
 * Playwright page object for xterm.js terminal interaction.
 *
 * @example
 * ```typescript
 * const terminal = new PlaywrightTerminal(page);
 *
 * await terminal.goto('http://localhost:7681/', {
 *   auth: { username: 'user', password: 'pass' }
 * });
 *
 * await terminal.waitForTerminalReady();
 * await terminal.type('ls -la');
 * await terminal.press('Enter');
 * await terminal.waitForText('total');
 *
 * const content = await terminal.getContent();
 * console.log(content.text);
 * ```
 */
export class PlaywrightTerminal {
  private page: Page;
  private config: PlaywrightTerminalConfig;

  constructor(page: Page, config: Partial<PlaywrightTerminalConfig> = {}) {
    this.page = page;
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Navigate to a ttyd URL.
   *
   * @param url - ttyd server URL
   * @param options - Navigation options
   */
  async goto(
    url: string,
    options?: {
      auth?: AuthConfig;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    }
  ): Promise<void> {
    const { auth, waitUntil = "domcontentloaded" } = options || {};

    const targetUrl = auth ? buildAuthUrl(url, auth) : url;
    await this.page.goto(targetUrl, { waitUntil });
  }

  /**
   * Wait for the xterm.js terminal to be fully initialized.
   */
  async waitForTerminalReady(): Promise<void> {
    // Wait for terminal container
    const terminal = this.page.locator(this.config.xtermSelector);
    await terminal.first().waitFor({
      state: "visible",
      timeout: this.config.readyTimeoutMs,
    });

    // Wait for screen element
    const screen = this.page.locator(this.config.xtermScreenSelector);
    await screen.waitFor({
      state: "visible",
      timeout: this.config.readyTimeoutMs,
    });

    // Wait for input element (indicates WebSocket is connected)
    const input = this.page.locator(this.config.xtermInputSelector);
    await input.waitFor({
      state: "attached",
      timeout: this.config.readyTimeoutMs,
    });

    // Additional delay for WebSocket connection to stabilize
    await sleep(500);
  }

  /**
   * Type text into the terminal.
   *
   * @param text - Text to type
   */
  async type(text: string): Promise<void> {
    await this.page.keyboard.type(text, { delay: this.config.typeDelayMs });
  }

  /**
   * Press a key or key combination.
   *
   * @param key - Key to press (e.g., "Enter", "Tab", "Control+c")
   */
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * Send a sequence of keys.
   *
   * @param keys - Array of keys to press
   * @param delayMs - Delay between keys (default: 100ms)
   */
  async sendKeys(keys: string[], delayMs = 100): Promise<void> {
    for (const key of keys) {
      await this.press(key);
      await sleep(delayMs);
    }
  }

  /**
   * Type a command and press Enter.
   *
   * @param command - Command to run
   */
  async runCommand(command: string): Promise<void> {
    await this.type(command);
    await this.press("Enter");
  }

  /**
   * Get the current terminal content.
   * Automatically falls back to xterm.js buffer API when DOM text is empty
   * (common with WebGL canvas-rendered terminals like ttyd).
   */
  async getContent(): Promise<TerminalContent> {
    const screen = this.page.locator(this.config.xtermScreenSelector);

    // Get inner text (browser strips most formatting)
    let text = await screen.innerText();
    let html = await screen.innerHTML();

    // If DOM text is empty/whitespace, fall back to xterm.js buffer API
    if (!text.trim()) {
      text = await this.readFromXtermBuffer();
      html = "";
    }

    // Normalize for comparison
    const normalized = normalizeTerminalOutput(text);

    return { html, text, normalized };
  }

  /**
   * Read terminal content from xterm.js buffer API.
   * Tries `window.term` (ttyd) first, then `element._terminal` (generic xterm.js).
   */
  private async readFromXtermBuffer(): Promise<string> {
    try {
      return await this.page.evaluate(() => {
        // Try ttyd's window.term first
        const windowTerm = (window as any).term;
        const buf = windowTerm?.buffer?.active;
        if (buf) {
          const lines: string[] = [];
          for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i);
            if (line) lines.push(line.translateToString(true));
          }
          return lines.join("\n");
        }

        // Fall back to element._terminal (generic xterm.js pattern)
        const terminals = document.querySelectorAll(".xterm");
        for (const el of terminals) {
          const term = (el as any)._terminal;
          const elBuf = term?.buffer?.active;
          if (elBuf) {
            const lines: string[] = [];
            for (let i = 0; i < elBuf.length; i++) {
              const line = elBuf.getLine(i);
              if (line) lines.push(line.translateToString(true));
            }
            return lines.join("\n");
          }
        }

        return "";
      });
    } catch {
      return "";
    }
  }

  /**
   * Wait for specific text to appear in the terminal.
   *
   * @param pattern - String or regex to match
   * @param options - Wait options
   */
  async waitForText(
    pattern: string | RegExp,
    options?: { timeout?: number; stripAnsi?: boolean }
  ): Promise<void> {
    const { timeout = this.config.textTimeoutMs, stripAnsi: strip = true } = options || {};

    const deadline = Date.now() + timeout;
    const regex = typeof pattern === "string" ? null : pattern;
    const needle = typeof pattern === "string" ? pattern : null;

    while (Date.now() < deadline) {
      const { text } = await this.getContent();
      const content = strip ? stripAnsi(text) : text;

      if (regex) {
        if (regex.test(content)) return;
      } else if (needle) {
        if (content.includes(needle)) return;
      }

      await sleep(100);
    }

    throw new Error(
      `Timeout waiting for text: ${pattern instanceof RegExp ? pattern.source : pattern}`
    );
  }

  /**
   * Wait for the terminal to be idle (no changes for a period).
   *
   * @param stableMs - Time with no changes to consider idle
   * @param timeoutMs - Maximum wait time
   */
  async waitForIdle(stableMs = 500, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastContent = "";
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      const { text } = await this.getContent();

      if (text !== lastContent) {
        lastContent = text;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= stableMs) {
        return;
      }

      await sleep(50);
    }

    throw new Error("Timeout waiting for terminal to become idle");
  }

  /**
   * Take a screenshot of the terminal area.
   *
   * @param options - Screenshot options
   */
  async screenshot(options?: { path?: string }): Promise<Buffer> {
    const terminal = this.page.locator(this.config.xtermSelector).first();
    return terminal.screenshot(options);
  }

  /**
   * Take a full page screenshot.
   *
   * @param options - Screenshot options
   */
  async fullScreenshot(options?: { path?: string }): Promise<Buffer> {
    return this.page.screenshot(options);
  }

  /**
   * Focus the terminal input.
   */
  async focus(): Promise<void> {
    const terminal = this.page.locator(this.config.xtermSelector).first();
    await terminal.click();
  }

  /**
   * Clear the terminal (Ctrl+L).
   */
  async clear(): Promise<void> {
    await this.press("Control+l");
    await sleep(100);
  }

  /**
   * Get the underlying Playwright page.
   */
  getPage(): Page {
    return this.page;
  }

  /**
   * Get the terminal container locator.
   */
  getTerminalLocator(): Locator {
    return this.page.locator(this.config.xtermSelector).first();
  }

  /**
   * Get the terminal screen locator.
   */
  getScreenLocator(): Locator {
    return this.page.locator(this.config.xtermScreenSelector);
  }

  /**
   * Check if terminal is visible and ready.
   */
  async isReady(): Promise<boolean> {
    try {
      const terminal = this.page.locator(this.config.xtermSelector).first();
      const input = this.page.locator(this.config.xtermInputSelector);

      const terminalVisible = await terminal.isVisible();
      const inputAttached = (await input.count()) > 0;

      return terminalVisible && inputAttached;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate JavaScript in the terminal context.
   * Useful for accessing xterm.js Terminal API directly.
   *
   * @param script - Script to evaluate
   */
  async evaluate<T>(script: string): Promise<T> {
    return this.page.evaluate(script) as Promise<T>;
  }

  /**
   * Get terminal dimensions from xterm.js if available.
   */
  async getDimensions(): Promise<{ cols: number; rows: number } | null> {
    try {
      return await this.page.evaluate(() => {
        // Try to access xterm.js Terminal instance
        const terminals = document.querySelectorAll(".xterm");
        for (const el of terminals) {
          // xterm.js stores terminal instance on element
          const term = (el as HTMLElement & { _terminal?: { cols: number; rows: number } })
            ._terminal;
          if (term) {
            return { cols: term.cols, rows: term.rows };
          }
        }
        return null;
      });
    } catch {
      return null;
    }
  }
}
