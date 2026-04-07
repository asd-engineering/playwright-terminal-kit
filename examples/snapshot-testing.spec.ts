/**
 * Example: Snapshot testing with playwright-ttyd
 *
 * This example demonstrates terminal snapshot testing for
 * ensuring consistent output across test runs.
 */

import { test, expect, skipIfTtydFailed, skipIfNoTmux } from "../src/testing/fixtures.js";
import { createSnapshotManager, SnapshotManager } from "../src/testing/snapshot.js";
import { normalizeTerminalOutput } from "../src/util/ansi.js";

test.describe("Snapshot Testing", () => {
  let snapshotManager: SnapshotManager;

  test.beforeAll(() => {
    snapshotManager = createSnapshotManager({
      snapshotDir: "./examples/__snapshots__",
      stripAnsi: true,
      normalizeWhitespace: true,
    });
  });

  test.beforeEach(async ({ ttydResult }) => {
    skipIfTtydFailed(ttydResult);
  });

  test("capture terminal state", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Run a deterministic command
    await terminal.runCommand("echo 'Snapshot Test Output'");
    await terminal.waitForText("Snapshot Test Output");

    // Get terminal content
    const content = await terminal.getContent();

    // The content can be compared against a saved snapshot
    expect(content.normalized).toContain("Snapshot Test Output");
  });

  test("compare with saved snapshot", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Generate known output
    await terminal.runCommand("echo -e 'Header\\n======\\nItem 1\\nItem 2\\nItem 3'");
    await terminal.waitForText("Item 3");

    // Get content
    const content = await terminal.getContent();
    const normalized = normalizeTerminalOutput(content.text);

    // Verify structure
    expect(normalized).toContain("Header");
    expect(normalized).toContain("======");
    expect(normalized).toContain("Item 1");
    expect(normalized).toContain("Item 2");
    expect(normalized).toContain("Item 3");
  });

  test("tmux snapshot with deterministic dimensions", async ({
    terminal,
    tmuxSession,
  }) => {
    skipIfNoTmux(tmuxSession);
    if (!tmuxSession) return;

    // tmux provides exact control over terminal size
    const size = tmuxSession.getSize();
    expect(size.cols).toBe(120);
    expect(size.rows).toBe(40);

    // Run command in tmux
    await tmuxSession.runCommand("echo 'tmux snapshot test'");
    await tmuxSession.waitForText("tmux snapshot test");

    // Capture snapshot
    const snapshot = await tmuxSession.snapshot("tmux-test");

    expect(snapshot.text).toContain("tmux snapshot test");
    expect(snapshot.size.cols).toBe(120);
    expect(snapshot.size.rows).toBe(40);
  });

  test("snapshot with variable content masked", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Run command with variable output (timestamp)
    await terminal.runCommand("date +%H:%M:%S");
    await terminal.waitForIdle(1000);

    // Get content
    const content = await terminal.getContent();

    // Time values would make snapshots flaky
    // The replaceVariables utility can mask these
    const { replaceVariables } = await import("../src/util/ansi.js");
    const masked = replaceVariables(content.text);

    // Time should be replaced with placeholder
    expect(masked).toContain("[TIME]");
  });

  test("screenshot comparison", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Generate visual content
    await terminal.runCommand(`
      echo "╔════════════════════════╗"
      echo "║   Terminal Box Test    ║"
      echo "╚════════════════════════╝"
    `);
    await terminal.waitForText("Terminal Box Test");

    // Take screenshot
    const screenshot = await terminal.screenshot();

    // Screenshot is a Buffer that can be saved/compared
    expect(screenshot).toBeInstanceOf(Buffer);
    expect(screenshot.length).toBeGreaterThan(0);
  });

  test("diff detection", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // First state
    await terminal.runCommand("echo 'State A'");
    await terminal.waitForText("State A");
    const contentA = await terminal.getContent();

    // Change state
    await terminal.runCommand("echo 'State B'");
    await terminal.waitForText("State B");
    const contentB = await terminal.getContent();

    // Contents should be different
    expect(contentA.text).not.toBe(contentB.text);
    expect(contentB.text).toContain("State B");
  });

  test("ANSI stripping for comparison", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Generate colored output
    await terminal.runCommand('echo -e "\\033[32mGreen\\033[0m and \\033[31mRed\\033[0m"');
    await terminal.waitForText("Green");

    const content = await terminal.getContent();

    // Text extraction typically strips ANSI codes
    // For exact ANSI comparison, use raw HTML or tmux capture-pane -e
    expect(content.normalized).toContain("Green");
    expect(content.normalized).toContain("Red");
  });
});

test.describe("Snapshot Manager API", () => {
  test("save and load snapshot", async () => {
    const manager = createSnapshotManager({
      snapshotDir: "/tmp/test-snapshots",
    });

    // Create a mock snapshot
    const snapshot = {
      raw: "\x1b[32mTest\x1b[0m",
      text: "Test",
      normalized: "Test",
      sessionName: "test",
      name: "example",
      timestamp: Date.now(),
      size: { cols: 80, rows: 24 },
    };

    // Save it
    const path = await manager.save("api test", snapshot);
    expect(path).toContain("api-test-example.snap.json");

    // Load it back
    const loaded = await manager.load("api test", "example");
    expect(loaded).not.toBeNull();
    expect(loaded?.content).toBe("Test");

    // Clean up
    await manager.delete("api test", "example");
  });

  test("comparison result", async () => {
    const manager = createSnapshotManager({
      snapshotDir: "/tmp/test-snapshots",
      updateSnapshots: true, // Auto-create missing snapshots
    });

    const snapshot = {
      raw: "Hello",
      text: "Hello",
      normalized: "Hello",
      sessionName: "test",
      name: "compare-test",
      timestamp: Date.now(),
      size: { cols: 80, rows: 24 },
    };

    // First comparison creates the snapshot
    const result1 = await manager.compare("compare api test", snapshot);
    expect(result1.isNew).toBe(true);
    expect(result1.matches).toBe(true);

    // Second comparison should match
    const result2 = await manager.compare("compare api test", snapshot);
    expect(result2.isNew).toBe(false);
    expect(result2.matches).toBe(true);

    // Different content should not match
    const differentSnapshot = { ...snapshot, text: "Goodbye", normalized: "Goodbye" };
    const result3 = await manager.compare("compare api test", differentSnapshot);

    // In update mode, it would still match after update
    // Without update mode, it would fail
    expect(result3.isNew).toBe(false);

    // Clean up
    await manager.delete("compare api test", "compare-test");
  });
});
