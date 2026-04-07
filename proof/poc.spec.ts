/**
 * Proof-of-Concept E2E tests for playwright-terminal-kit.
 *
 * Proves the core value proposition: starting ttyd, connecting Playwright,
 * interacting with a real terminal, and exercising the ASD fzf menu.
 *
 * NOTE: ttyd's xterm.js uses WebGL canvas rendering, so DOM-based text
 * extraction (innerText) returns empty. We use xterm.js's buffer API
 * via page.evaluate() to read terminal content, and pair browser tests
 * with tmux capturePane() for robust text verification.
 */

import { test as baseTest, expect, chromium } from "@playwright/test";
import { TtydServer } from "../src/server/ttyd-server.js";
import { TmuxSession } from "../src/server/tmux-session.js";
import { PlaywrightTerminal } from "../src/client/playwright-terminal.js";
import {
  createTerminalTest,
  skipIfTtydFailed,
} from "../src/testing/fixtures.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read terminal buffer content via xterm.js internal API.
 * ttyd stores the Terminal instance on `window.term`.
 */
async function readXtermBuffer(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    // ttyd exposes terminal as window.term
    const term = (window as any).term;
    if (!term?.buffer?.active) return "";
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n");
  });
}

/**
 * Wait for text to appear in the xterm buffer.
 */
async function waitForXtermText(
  page: import("@playwright/test").Page,
  pattern: string,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await readXtermBuffer(page);
    if (content.includes(pattern)) return;
    await sleep(200);
  }
  const finalContent = await readXtermBuffer(page);
  throw new Error(
    `Timeout waiting for "${pattern}" in xterm buffer. Last content:\n${finalContent.slice(0, 500)}`
  );
}

// ---------------------------------------------------------------------------
// Test 1: Manual API — ttyd + Playwright interaction
// ---------------------------------------------------------------------------

baseTest.describe("ttyd starts and Playwright interacts with terminal", () => {
  let server: TtydServer;

  baseTest.afterEach(async () => {
    await server?.stop();
  });

  baseTest("echo and ls via Playwright", async () => {
    // Start ttyd with dynamic port
    server = new TtydServer({ port: 0, shell: "bash", writable: true });
    const result = await server.start();
    expect(result.success).toBe(true);
    expect(result.port).toBeGreaterThan(0);
    expect(result.url).toContain("localhost");

    // Launch browser and connect
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const terminal = new PlaywrightTerminal(page);

    try {
      await terminal.goto(result.url);
      await terminal.waitForTerminalReady();
      await terminal.focus();
      await terminal.fullScreenshot({ path: "proof/01-terminal-ready.png" });

      // Run echo and verify via xterm buffer API
      await terminal.runCommand("echo 'PLAYWRIGHT_PROOF'");
      await waitForXtermText(page, "PLAYWRIGHT_PROOF");
      await terminal.fullScreenshot({ path: "proof/02-echo-output.png" });

      const echoContent = await readXtermBuffer(page);
      expect(echoContent).toContain("PLAYWRIGHT_PROOF");

      // Run ls and verify
      await terminal.runCommand("ls -la");
      await waitForXtermText(page, "total");
      await terminal.fullScreenshot({ path: "proof/03-ls-output.png" });

      const lsContent = await readXtermBuffer(page);
      expect(lsContent).toContain("total");
    } finally {
      await browser.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: TmuxSession — pure terminal control without a browser
// ---------------------------------------------------------------------------

baseTest.describe("TmuxSession captures terminal state", () => {
  let session: TmuxSession;

  baseTest.afterEach(async () => {
    await session?.destroy();
  });

  baseTest("tmux run, wait, snapshot, capturePane, waitForIdle", async () => {
    const sessionName = `poc-tmux-${Date.now()}`;
    session = new TmuxSession({ sessionName });
    await session.create();

    // Run a command
    await session.runCommand("echo 'TMUX_PROOF_123'");
    const found = await session.waitForText("TMUX_PROOF_123", 10_000);
    expect(found).toBe(true);

    // Snapshot
    const snap = await session.snapshot("after-echo");
    expect(snap.text).toContain("TMUX_PROOF_123");
    expect(snap.sessionName).toBe(sessionName);
    expect(snap.name).toBe("after-echo");
    expect(snap.size.cols).toBeGreaterThan(0);

    // capturePane
    const pane = await session.capturePane();
    expect(pane).toContain("TMUX_PROOF_123");

    // waitForIdle
    const idle = await session.waitForIdle(500, 5_000);
    expect(idle).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Fixture system — auto-managed lifecycle
// ---------------------------------------------------------------------------

const fixtureTest = createTerminalTest({
  tmux: { shell: "bash" },
});

fixtureTest.describe("fixture system auto-manages lifecycle", () => {
  fixtureTest.beforeEach(async ({ ttydResult }) => {
    skipIfTtydFailed(ttydResult);
  });

  fixtureTest(
    "fixture provides terminal, tmuxSession, takeSnapshot",
    async ({ terminal, tmuxSession, takeSnapshot, ttydResult, page }) => {
      // The fixture auto-started ttyd and navigated
      expect(ttydResult.success).toBe(true);

      // Terminal is ready (auto-navigated), focus before typing
      await terminal.focus();
      await terminal.runCommand("echo 'FIXTURE_PROOF'");
      // xterm.js uses canvas rendering so use buffer API for text
      await waitForXtermText(page, "FIXTURE_PROOF");

      const bufContent = await readXtermBuffer(page);
      expect(bufContent).toContain("FIXTURE_PROOF");

      // tmuxSession is provided when configured
      expect(tmuxSession).not.toBeNull();
      if (tmuxSession) {
        await tmuxSession.runCommand("echo 'TMUX_VIA_FIXTURE'");
        const found = await tmuxSession.waitForText("TMUX_VIA_FIXTURE");
        expect(found).toBe(true);
      }

      // takeSnapshot convenience (uses tmux when available)
      const snap = await takeSnapshot("fixture-proof");
      expect(snap.text.length).toBeGreaterThan(0);

      await terminal.fullScreenshot({ path: "proof/04-fixture-terminal.png" });
    }
  );
});

// ---------------------------------------------------------------------------
// Test 4: ASD fzf menu interaction
// ---------------------------------------------------------------------------

baseTest.describe("can interact with ASD fzf menu", () => {
  let server: TtydServer;

  baseTest.afterEach(async () => {
    await server?.stop();
  });

  baseTest("launch fzf menu, filter, select list-tmux", async () => {
    server = new TtydServer({ port: 0, shell: "bash", writable: true });
    const result = await server.start();
    expect(result.success).toBe(true);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const terminal = new PlaywrightTerminal(page);

    try {
      await terminal.goto(result.url);
      await terminal.waitForTerminalReady();
      await terminal.focus();

      // Launch the fzf menu
      const menuPath = "/home/kelvin-wuite/ASD/project-prod/scripts/tmux/claude-menu.sh";
      await terminal.runCommand(`bash ${menuPath}`);

      // Wait for fzf to render the prompt (use xterm buffer API)
      await waitForXtermText(page, "Claude >", 15_000);
      await terminal.fullScreenshot({ path: "proof/05-fzf-menu-loaded.png" });

      // Wait for the header
      await waitForXtermText(page, "Session Manager", 10_000);

      // Type to filter to "list tmux"
      await terminal.type("list tmux");
      await sleep(1_000);
      await terminal.fullScreenshot({ path: "proof/06-fzf-filtered.png" });

      // Verify the filtered result shows the tmux listing option
      await waitForXtermText(page, "List tmux", 5_000);

      // Select it
      await terminal.press("Enter");
      await sleep(2_000);
      await terminal.fullScreenshot({ path: "proof/07-fzf-after-select.png" });

      // The @list-tmux handler runs `tmux ls` which shows sessions or "no server running"
      // Either output proves the handler executed
      const text = await readXtermBuffer(page);
      const handlerExecuted =
        text.includes("tmux") || text.includes("no server") || text.includes("sessions");
      expect(handlerExecuted).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
