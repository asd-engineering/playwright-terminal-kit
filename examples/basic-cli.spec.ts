/**
 * Example: Basic CLI testing with playwright-ttyd
 *
 * This example demonstrates testing a simple CLI application.
 */

import { test, expect, skipIfTtydFailed } from "../src/testing/fixtures.js";

test.describe("Basic CLI Testing", () => {
  test.beforeEach(async ({ ttydResult }) => {
    skipIfTtydFailed(ttydResult);
  });

  test("terminal initializes correctly", async ({ terminal }) => {
    // Wait for terminal to be ready
    await terminal.waitForTerminalReady();

    // Check terminal is responsive
    const ready = await terminal.isReady();
    expect(ready).toBe(true);
  });

  test("can execute shell commands", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Run a simple command
    await terminal.runCommand("echo 'Hello, World!'");

    // Verify output
    await terminal.waitForText("Hello, World!");

    // Get terminal content for inspection
    const content = await terminal.getContent();
    expect(content.text).toContain("Hello, World!");
  });

  test("handles command with arguments", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Run command with multiple arguments
    await terminal.type("echo one two three");
    await terminal.press("Enter");

    await terminal.waitForText("one two three");
  });

  test("handles special characters", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Commands with special characters
    await terminal.runCommand('echo "quotes work"');
    await terminal.waitForText("quotes work");

    await terminal.runCommand("echo $HOME");
    await terminal.waitForIdle(1000);

    // $HOME should expand to something (not literal $HOME)
    const content = await terminal.getContent();
    expect(content.text).not.toContain("$HOME");
  });

  test("supports keyboard navigation", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Type something
    await terminal.type("first command");

    // Clear with Ctrl+C
    await terminal.press("Control+c");
    await terminal.waitForIdle(500);

    // Type new command
    await terminal.type("echo cleared");
    await terminal.press("Enter");

    await terminal.waitForText("cleared");
  });

  test("handles multi-line output", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Generate multi-line output
    await terminal.runCommand("echo -e 'line1\\nline2\\nline3'");

    // Wait for all lines
    await terminal.waitForText("line1");
    await terminal.waitForText("line2");
    await terminal.waitForText("line3");
  });
});
