/**
 * @asd-engineering/playwright-ttyd
 *
 * Playwright testing library for CLI/TUI applications using ttyd and tmux.
 * Provides visual snapshot testing, command injection, and deterministic terminal control.
 *
 * @example
 * ```typescript
 * import { test, expect } from '@asd-engineering/playwright-ttyd';
 *
 * test('CLI shows help', async ({ terminal }) => {
 *   await terminal.type('my-cli --help');
 *   await terminal.press('Enter');
 *   await terminal.waitForText('Usage:');
 * });
 *
 * test('TUI navigation', async ({ terminal, tmuxSession, takeSnapshot }) => {
 *   await terminal.type('my-tui');
 *   await terminal.press('Enter');
 *   await terminal.press('Tab');
 *
 *   const snapshot = await takeSnapshot('menu-state');
 *   expect(snapshot).toContainTerminalText('[Dashboard]');
 * });
 * ```
 *
 * @packageDocumentation
 */

// Server components
export { TtydServer, createTtydServer, type TtydStartResult } from "./server/ttyd-server.js";
export {
  TmuxSession,
  createTmuxSession,
  type TerminalSnapshot,
} from "./server/tmux-session.js";
export {
  ProcessManager,
  processManager,
  type DaemonOptions,
  type DaemonResult,
  type StopResult,
  type ReadinessConfig,
} from "./server/process-manager.js";

// Client components
export {
  PlaywrightTerminal,
  type TerminalContent,
} from "./client/playwright-terminal.js";
export {
  WebSocketClient,
  createWebSocketClient,
  type ExecuteResult,
} from "./client/websocket-client.js";
export {
  buildCommandUrl,
  buildMultiCommandUrl,
  buildAuthCommandUrl,
  parseCommandFromUrl,
  parseAllCommandsFromUrl,
  createSetupCommand,
  createSourceCommand,
  createCdCommand,
  buildTtydUrl,
  buildJustUrl,
  escapeCommand,
  createWatchCommand,
} from "./client/command-injection.js";

// Testing infrastructure
export {
  test,
  expect,
  createTerminalTest,
  skipIfTtydFailed,
  skipIfNoTmux,
  type TerminalFixtures,
  type TerminalFixtureOptions,
} from "./testing/fixtures.js";
export {
  SnapshotManager,
  createSnapshotManager,
  type SnapshotCompareResult,
} from "./testing/snapshot.js";
export {
  terminalMatchers,
  terminalAssert,
  extendExpect,
} from "./testing/matchers.js";

// Utilities
export {
  keyToBytes,
  keysToBytes,
  bytesToBuffer,
  keyToBuffer,
  getSupportedKeys,
  isSpecialKey,
  isCtrlKey,
} from "./util/key-codes.js";
export {
  getRandomPort,
  getRandomPortInRange,
  isPortAvailable,
  getMultiplePorts,
  releasePort,
  clearAllocatedPorts,
  getAllocatedPorts,
  parsePortRange,
} from "./util/port-allocator.js";
export {
  stripAnsi,
  stripAnsiAndControls,
  normalizeTerminalOutput,
  hasAnsi,
  visibleLength,
  createIgnorePattern,
  replaceVariables,
  ANSI,
  CURSOR,
  SCREEN,
} from "./util/ansi.js";

// Configuration
export {
  parseConfig,
  safeParseConfig,
  createDefaultConfig,
  type PlaywrightTtydConfig,
  type TtydServerConfig,
  type TmuxSessionConfig,
  type WebSocketClientConfig,
  type PlaywrightTerminalConfig,
  type SnapshotConfig,
  type ProcessManagerConfig,
  type AuthConfig,
} from "./config/schema.js";
