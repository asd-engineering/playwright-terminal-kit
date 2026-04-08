/**
 * Playwright test fixtures for terminal testing.
 * Provides pre-configured terminal and session objects for tests.
 *
 * @module testing/fixtures
 */

import { test as base } from "@playwright/test";
import { TtydServer, type TtydStartResult } from "../server/ttyd-server.js";
import { TmuxSession, type TerminalSnapshot } from "../server/tmux-session.js";
import { PlaywrightTerminal } from "../client/playwright-terminal.js";
import { WebSocketClient } from "../client/websocket-client.js";
import { SnapshotManager } from "./snapshot.js";
import type {
  TtydServerConfig,
  TmuxSessionConfig,
  PlaywrightTerminalConfig,
  SnapshotConfig,
} from "../config/schema.js";

/**
 * Terminal test fixture options.
 */
export interface TerminalFixtureOptions {
  /** ttyd server configuration */
  ttyd: Partial<TtydServerConfig>;
  /** tmux session configuration (optional, creates session if provided) */
  tmux?: Partial<Omit<TmuxSessionConfig, "sessionName">>;
  /** Playwright terminal configuration */
  terminal: Partial<PlaywrightTerminalConfig>;
  /** Snapshot configuration */
  snapshot: Partial<SnapshotConfig>;
  /** Whether to auto-navigate to ttyd URL */
  autoNavigate: boolean;
  /** Whether to wait for terminal ready after navigation */
  autoWaitReady: boolean;
}

/**
 * Terminal test fixtures provided to tests.
 */
export interface TerminalFixtures {
  /** ttyd server instance */
  ttydServer: TtydServer;
  /** ttyd server start result */
  ttydResult: TtydStartResult;
  /** tmux session (if configured) */
  tmuxSession: TmuxSession | null;
  /** Playwright terminal page object */
  terminal: PlaywrightTerminal;
  /** WebSocket client (connected if ttyd started successfully) */
  wsClient: WebSocketClient | null;
  /** Snapshot manager */
  snapshotManager: SnapshotManager;
  /** Take a terminal snapshot */
  takeSnapshot: (name: string) => Promise<TerminalSnapshot>;
}

/**
 * Default fixture options.
 */
const defaultOptions: TerminalFixtureOptions = {
  ttyd: {
    port: 0, // Dynamic allocation
    shell: "bash",
    writable: true,
  },
  terminal: {},
  snapshot: {},
  autoNavigate: true,
  autoWaitReady: true,
};

/**
 * Create the terminal test extension.
 *
 * @param options - Fixture options override
 * @returns Extended test with terminal fixtures
 *
 * @example
 * ```typescript
 * import { test, expect } from '@asd-engineering/playwright-ttyd';
 *
 * test('terminal shows prompt', async ({ terminal }) => {
 *   await terminal.waitForText('$');
 * });
 *
 * test('command executes', async ({ terminal, takeSnapshot }) => {
 *   await terminal.runCommand('echo hello');
 *   await terminal.waitForText('hello');
 *   await takeSnapshot('after-echo');
 * });
 * ```
 */
export function createTerminalTest(options: Partial<TerminalFixtureOptions> = {}) {
  const mergedOptions: TerminalFixtureOptions = {
    ...defaultOptions,
    ...options,
    ttyd: { ...defaultOptions.ttyd, ...options.ttyd },
    terminal: { ...defaultOptions.terminal, ...options.terminal },
    snapshot: { ...defaultOptions.snapshot, ...options.snapshot },
  };

  return base.extend<TerminalFixtures>({
    // ttyd server fixture
    ttydServer: async ({}, use, _testInfo) => {
      const server = new TtydServer(mergedOptions.ttyd);
      await use(server);
      // Cleanup
      await server.stop();
    },

    // ttyd start result fixture
    ttydResult: async ({ ttydServer }, use) => {
      const result = await ttydServer.start();
      await use(result);
    },

    // tmux session fixture (optional)
    tmuxSession: async ({}, use, testInfo) => {
      if (!mergedOptions.tmux) {
        await use(null);
        return;
      }

      const sessionName = `playwright-ttyd-${testInfo.testId}-${Date.now()}`;
      const session = new TmuxSession({
        ...mergedOptions.tmux,
        sessionName,
      });

      await session.create();
      await use(session);
      // Cleanup
      await session.destroy();
    },

    // Playwright terminal fixture
    terminal: async ({ page, ttydResult }, use) => {
      const terminal = new PlaywrightTerminal(page, mergedOptions.terminal);

      if (ttydResult.success && mergedOptions.autoNavigate) {
        const url = ttydResult.authUrl || ttydResult.url;
        await terminal.goto(url);

        if (mergedOptions.autoWaitReady) {
          await terminal.waitForTerminalReady();
        }
      }

      await use(terminal);
    },

    // WebSocket client fixture
    wsClient: async ({ ttydResult }, use) => {
      if (!ttydResult.success) {
        await use(null);
        return;
      }

      const client = new WebSocketClient({
        server: ttydResult.url,
        username: mergedOptions.ttyd.auth?.username,
        password: mergedOptions.ttyd.auth?.password,
      });

      try {
        await client.connect();
        await use(client);
      } finally {
        await client.disconnect();
      }
    },

    // Snapshot manager fixture
    snapshotManager: async ({}, use, testInfo) => {
      const manager = new SnapshotManager({
        ...mergedOptions.snapshot,
        snapshotDir:
          mergedOptions.snapshot.snapshotDir || `${testInfo.project.outputDir}/__snapshots__`,
      });

      await use(manager);
    },

    // Convenience function for taking snapshots
    takeSnapshot: async ({ tmuxSession, terminal, snapshotManager }, use, testInfo) => {
      const fn = async (name: string): Promise<TerminalSnapshot> => {
        // Prefer tmux if available (more reliable)
        if (tmuxSession) {
          const snapshot = await tmuxSession.snapshot(name);
          await snapshotManager.save(testInfo.titlePath.join(" > "), snapshot);
          return snapshot;
        }

        // Fall back to Playwright terminal
        const content = await terminal.getContent();
        const snapshot: TerminalSnapshot = {
          raw: content.html,
          text: content.text,
          normalized: content.normalized,
          sessionName: "playwright",
          name,
          timestamp: Date.now(),
          size: { cols: 80, rows: 24 }, // Default size
        };

        await snapshotManager.save(testInfo.titlePath.join(" > "), snapshot);
        return snapshot;
      };

      await use(fn);
    },
  });
}

/**
 * Pre-configured terminal test with default options.
 */
export const test = createTerminalTest();

/**
 * Re-export expect for convenience.
 */
export { expect } from "@playwright/test";

/**
 * Test helper to skip if ttyd failed to start.
 */
export function skipIfTtydFailed(result: TtydStartResult): void {
  if (!result.success) {
    test.skip(true, `ttyd failed to start: ${result.error}`);
  }
}

/**
 * Test helper to skip if tmux is not available.
 */
export function skipIfNoTmux(session: TmuxSession | null): void {
  if (!session) {
    test.skip(true, "tmux session not available");
  }
}
