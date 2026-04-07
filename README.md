# @accelerated-software-development/playwright-terminal-kit

Playwright testing library for CLI/TUI applications using **ttyd** and **tmux**.

Features:
- **Visual snapshot testing** - Capture and compare terminal states
- **Browser automation** - Test terminals via Playwright in real browsers
- **WebSocket client** - Direct terminal communication for headless testing
- **tmux integration** - Deterministic terminal dimensions and state control
- **Command injection** - Pass commands via URL parameters

## Installation

```bash
npm install @accelerated-software-development/playwright-terminal-kit @playwright/test
# or
pnpm add @accelerated-software-development/playwright-terminal-kit @playwright/test
# or
bun add @accelerated-software-development/playwright-terminal-kit @playwright/test
```

### Prerequisites

- **ttyd** - Terminal emulator over HTTP ([installation](https://github.com/tsl0922/ttyd#installation))
- **tmux** (optional) - For deterministic session control
- **Playwright** - Browser automation

```bash
# macOS
brew install ttyd tmux

# Ubuntu/Debian
apt install ttyd tmux

# Or download ttyd binary from:
# https://github.com/tsl0922/ttyd/releases
```

## Quick Start

```typescript
import { test, expect } from '@accelerated-software-development/playwright-terminal-kit';

test('CLI shows help', async ({ terminal }) => {
  await terminal.type('my-cli --help');
  await terminal.press('Enter');
  await terminal.waitForText('Usage:');
});

test('TUI navigation', async ({ terminal, takeSnapshot }) => {
  await terminal.type('my-tui');
  await terminal.press('Enter');
  await terminal.press('Tab');

  const snapshot = await takeSnapshot('menu-state');
  expect(snapshot.text).toContain('[Dashboard]');
});
```

## API Overview

### Server Components

#### TtydServer

Manages ttyd process lifecycle:

```typescript
import { TtydServer } from '@accelerated-software-development/playwright-terminal-kit';

const server = new TtydServer({
  port: 0,  // Dynamic allocation
  shell: 'bash',
  auth: { username: 'user', password: 'pass' }
});

const { port, url, authUrl } = await server.start();
console.log(`ttyd running at ${url}`);

// Later...
await server.stop();
```

#### TmuxSession

Provides deterministic terminal control:

```typescript
import { TmuxSession } from '@accelerated-software-development/playwright-terminal-kit';

const session = new TmuxSession({
  sessionName: 'test-session',
  size: { cols: 120, rows: 40 }
});

await session.create();

// Send input
await session.sendText('echo hello');
await session.sendKeys(['Enter']);

// Wait for output
await session.waitForText('hello');

// Capture state
const snapshot = await session.snapshot('after-echo');
console.log(snapshot.text);

// Cleanup
await session.destroy();
```

### Client Components

#### PlaywrightTerminal

Page object for browser-based terminal interaction:

```typescript
import { PlaywrightTerminal } from '@accelerated-software-development/playwright-terminal-kit';

// In a Playwright test
const terminal = new PlaywrightTerminal(page);

await terminal.goto('http://localhost:7681/', {
  auth: { username: 'user', password: 'pass' }
});

await terminal.waitForTerminalReady();
await terminal.type('ls -la');
await terminal.press('Enter');
await terminal.waitForText('total');

const content = await terminal.getContent();
console.log(content.text);
```

#### WebSocketClient

Direct terminal communication (no browser needed):

```typescript
import { WebSocketClient } from '@accelerated-software-development/playwright-terminal-kit';

const client = new WebSocketClient({
  server: 'http://localhost:7681',
  username: 'user',
  password: 'pass'
});

await client.connect();

const result = await client.execute('echo hello');
console.log(result.output); // "hello"

await client.disconnect();
```

### Test Fixtures

The library provides Playwright test fixtures:

```typescript
import { test, expect } from '@accelerated-software-development/playwright-terminal-kit';

test.describe('My CLI', () => {
  test('shows version', async ({ terminal }) => {
    await terminal.runCommand('my-cli --version');
    await terminal.waitForText('1.0.0');
  });

  test('interactive mode', async ({ terminal, tmuxSession, takeSnapshot }) => {
    await terminal.runCommand('my-cli interactive');

    // Navigate TUI
    await terminal.press('Tab');
    await terminal.press('Enter');

    // Capture for comparison
    const snapshot = await takeSnapshot('interactive-menu');
    expect(snapshot.text).toContain('Select option');
  });
});
```

### Custom Matchers

Extend Playwright's expect with terminal-specific matchers:

```typescript
import { expect } from '@playwright/test';
import { extendExpect } from '@accelerated-software-development/playwright-terminal-kit';

extendExpect();

test('terminal matchers', async ({ terminal }) => {
  const content = await terminal.getContent();

  expect(content).toContainTerminalText('$');
  expect(content).toMatchTerminalPattern(/user@host/);
  expect(content).toShowPrompt();
});
```

### Snapshot Testing

Compare terminal output against saved snapshots:

```typescript
import { SnapshotManager } from '@accelerated-software-development/playwright-terminal-kit';

const manager = new SnapshotManager({
  snapshotDir: './__snapshots__',
  stripAnsi: true,
  normalizeWhitespace: true
});

// Save snapshot
await manager.save('my test', snapshot);

// Compare with saved
const result = await manager.compare('my test', snapshot);
if (!result.matches) {
  console.log(result.diff);
}
```

Update snapshots by setting `UPDATE_SNAPSHOTS=1`:

```bash
UPDATE_SNAPSHOTS=1 npx playwright test
```

### Utilities

#### Key Codes

```typescript
import { keyToBytes, keysToBytes } from '@accelerated-software-development/playwright-terminal-kit';

keyToBytes('Tab')      // [9]
keyToBytes('Ctrl+C')   // [3]
keyToBytes('Enter')    // [13]
keyToBytes('hello')    // [104, 101, 108, 108, 111]
```

#### Port Allocation

```typescript
import { getRandomPort, isPortAvailable } from '@accelerated-software-development/playwright-terminal-kit';

const port = await getRandomPort();
const available = await isPortAvailable(3000);
```

#### ANSI Utilities

```typescript
import { stripAnsi, normalizeTerminalOutput } from '@accelerated-software-development/playwright-terminal-kit';

const plain = stripAnsi('\x1b[32mHello\x1b[0m');  // "Hello"
const normalized = normalizeTerminalOutput(rawOutput);
```

## Configuration

### TtydServer Options

```typescript
interface TtydServerConfig {
  port?: number;           // 0 for dynamic allocation
  shell?: string;          // Shell command (default: "bash")
  cwd?: string;            // Working directory
  basePath?: string;       // URL base path (default: "/")
  auth?: { username: string; password: string };
  extraArgs?: string[];    // Additional ttyd arguments
  binaryPath?: string;     // Custom ttyd binary path
  writable?: boolean;      // Enable input (default: true)
}
```

### TmuxSession Options

```typescript
interface TmuxSessionConfig {
  sessionName: string;     // Unique session name
  size?: { cols: number; rows: number };  // Terminal dimensions
  shell?: string;          // Shell (default: "bash")
  cwd?: string;            // Working directory
  env?: Record<string, string>;  // Environment variables
}
```

### Snapshot Options

```typescript
interface SnapshotConfig {
  snapshotDir?: string;    // Where to save snapshots
  stripAnsi?: boolean;     // Remove ANSI codes (default: true)
  normalizeWhitespace?: boolean;  // Normalize whitespace (default: true)
  ignorePatterns?: (string | RegExp)[];  // Patterns to ignore
  updateSnapshots?: boolean;  // Update mode
}
```

## Command Injection

When ttyd is started with `--url-arg`, commands can be passed via URL:

```typescript
import { buildCommandUrl, buildJustUrl } from '@accelerated-software-development/playwright-terminal-kit';

// Single command
const url = buildCommandUrl('http://localhost:7681/', 'vim file.txt');
// http://localhost:7681/?arg=vim%20file.txt

// Just recipe
const justUrl = buildJustUrl('http://localhost:7681/', 'dev', ['--port=3000']);
// http://localhost:7681/?arg=just%20dev%20--port%3D3000
```

## Tips

### Waiting for Terminal Ready

Always wait for the terminal to be ready before interacting:

```typescript
await terminal.waitForTerminalReady();
```

### Handling Timing

For TUI applications, use `waitForIdle` to ensure the screen has stabilized:

```typescript
await terminal.press('Tab');
await terminal.waitForIdle(500);  // Wait 500ms with no changes
```

### Debugging

Take screenshots on test failure:

```typescript
test.afterEach(async ({ terminal }, testInfo) => {
  if (testInfo.status !== 'passed') {
    await terminal.screenshot({ path: `failure-${testInfo.title}.png` });
  }
});
```

### CI Environment

Ensure ttyd is available in CI:

```yaml
# GitHub Actions example
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install ttyd
        run: |
          wget -qO ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64
          chmod +x ttyd
          sudo mv ttyd /usr/local/bin/
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npx playwright test
```

## License

MIT
