/**
 * Standalone Playwright fixture for terminal testing.
 * Import this file to use pre-configured terminal fixtures in your tests.
 *
 * @example
 * ```typescript
 * // playwright.config.ts
 * export default defineConfig({
 *   use: {
 *     // Import the fixture
 *   },
 * });
 *
 * // test.spec.ts
 * import { test, expect } from '@asd-engineering/playwright-ttyd/fixtures';
 *
 * test('terminal interaction', async ({ terminal, ttydServer }) => {
 *   // terminal and ttydServer are automatically available
 *   await terminal.waitForText('$');
 * });
 * ```
 *
 * @packageDocumentation
 */

// Re-export the test fixtures
export {
  test,
  expect,
  createTerminalTest,
  skipIfTtydFailed,
  skipIfNoTmux,
  type TerminalFixtures,
  type TerminalFixtureOptions,
} from "./fixtures.js";

// Re-export commonly used types
export type { TerminalSnapshot } from "../server/tmux-session.js";
export type { TerminalContent } from "../client/playwright-terminal.js";
export type { TtydStartResult } from "../server/ttyd-server.js";
export type { ExecuteResult } from "../client/websocket-client.js";
export type { SnapshotCompareResult } from "./snapshot.js";

// Re-export matchers for extension
export { terminalMatchers, terminalAssert, extendExpect } from "./matchers.js";
