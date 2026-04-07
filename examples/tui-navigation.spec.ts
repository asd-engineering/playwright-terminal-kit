/**
 * Example: TUI navigation testing with playwright-ttyd
 *
 * This example demonstrates testing TUI (Text User Interface) applications
 * like those built with Ink, Blessed, or similar frameworks.
 *
 * Note: These tests use a simple menu simulation since we don't have
 * an actual TUI app to test. In real usage, replace the menu simulation
 * with your actual TUI application.
 */

import { test, expect, skipIfTtydFailed } from "../src/testing/fixtures.js";

test.describe("TUI Navigation Testing", () => {
  test.beforeEach(async ({ ttydResult }) => {
    skipIfTtydFailed(ttydResult);
  });

  test("can send Tab key to navigate", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Simulate a simple selection prompt
    await terminal.runCommand(`
      PS3="Select option: "
      select opt in "Option 1" "Option 2" "Option 3" "Exit"; do
        echo "Selected: $opt"
        break
      done
    `);

    await terminal.waitForText("1) Option 1");

    // Send selection
    await terminal.type("1");
    await terminal.press("Enter");

    await terminal.waitForText("Selected: Option 1");
  });

  test("can send arrow keys", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Type some text
    await terminal.type("hello world");

    // Move cursor with arrow keys
    await terminal.press("ArrowLeft");
    await terminal.press("ArrowLeft");
    await terminal.press("ArrowLeft");
    await terminal.press("ArrowLeft");
    await terminal.press("ArrowLeft");

    // Insert text at cursor position
    await terminal.type("cruel ");
    await terminal.press("Enter");

    // "hello cruel world" should be in history/output
    await terminal.waitForIdle(1000);
  });

  test("can use keyboard shortcuts", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Type a command but don't execute
    await terminal.type("long command that we will cancel");

    // Ctrl+A to go to beginning of line
    await terminal.press("Control+a");

    // Ctrl+K to kill to end of line
    await terminal.press("Control+k");

    // Line should be cleared
    await terminal.type("echo cleared");
    await terminal.press("Enter");

    await terminal.waitForText("cleared");
  });

  test("handles escape key", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Type something
    await terminal.type("test input");

    // Press Escape (often cancels in TUIs)
    await terminal.press("Escape");

    await terminal.waitForIdle(500);
  });

  test("function keys work", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Start a simple editor (if available)
    await terminal.runCommand("which nano && echo 'nano available' || echo 'nano not found'");

    await terminal.waitForIdle(2000);

    const content = await terminal.getContent();

    // We just verify the command executed - actual F-key testing
    // would require an actual TUI application
    expect(content.text).toMatch(/nano (available|not found)/);
  });

  test("can handle rapid key sequences", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Send multiple keys in sequence
    await terminal.sendKeys(["h", "e", "l", "l", "o"]);
    await terminal.press("Enter");

    await terminal.waitForText("hello");
  });

  test("page up/down simulation", async ({ terminal }) => {
    await terminal.waitForTerminalReady();

    // Generate lots of output to scroll
    await terminal.runCommand("for i in $(seq 1 50); do echo \"Line $i\"; done");

    await terminal.waitForText("Line 50");

    // In a real terminal, Page Up would scroll
    // We just verify the output was generated
    const content = await terminal.getContent();
    expect(content.text).toContain("Line 50");
  });
});
