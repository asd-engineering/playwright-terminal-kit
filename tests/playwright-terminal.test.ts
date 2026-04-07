/**
 * Unit tests for PlaywrightTerminal xterm.js buffer fallback
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { PlaywrightTerminal } from "../src/client/playwright-terminal.js";

/**
 * Create a minimal mock Page that satisfies PlaywrightTerminal's needs.
 */
function createMockPage(options: {
  innerText?: string;
  innerHTML?: string;
  evaluateResult?: any;
}) {
  const { innerText = "", innerHTML = "", evaluateResult = "" } = options;

  const locator = {
    innerText: async () => innerText,
    innerHTML: async () => innerHTML,
    first: () => locator,
    waitFor: async () => {},
    click: async () => {},
    isVisible: async () => true,
    count: async () => 1,
    screenshot: async () => Buffer.from(""),
  };

  return {
    locator: () => locator,
    evaluate: async () => evaluateResult,
    keyboard: {
      type: async () => {},
      press: async () => {},
    },
    screenshot: async () => Buffer.from(""),
    goto: async () => {},
  } as any;
}

describe("PlaywrightTerminal.getContent", () => {
  it("returns DOM text when available (no fallback)", async () => {
    const page = createMockPage({
      innerText: "hello world\n$ ",
      innerHTML: "<span>hello world</span>",
    });
    const terminal = new PlaywrightTerminal(page);

    const content = await terminal.getContent();

    expect(content.text).toBe("hello world\n$ ");
    expect(content.html).toBe("<span>hello world</span>");
    expect(content.normalized).toContain("hello world");
  });

  it("falls back to xterm buffer when DOM text is empty", async () => {
    const page = createMockPage({
      innerText: "",
      innerHTML: "<canvas></canvas>",
      evaluateResult: "buffer line 1\nbuffer line 2",
    });
    const terminal = new PlaywrightTerminal(page);

    const content = await terminal.getContent();

    expect(content.text).toBe("buffer line 1\nbuffer line 2");
    expect(content.html).toBe("");
    expect(content.normalized).toContain("buffer line 1");
  });

  it("falls back when DOM text is whitespace-only", async () => {
    const page = createMockPage({
      innerText: "   \n  \n  ",
      innerHTML: "<canvas></canvas>",
      evaluateResult: "actual terminal content",
    });
    const terminal = new PlaywrightTerminal(page);

    const content = await terminal.getContent();

    expect(content.text).toBe("actual terminal content");
    expect(content.html).toBe("");
  });

  it("buffer fallback returns empty gracefully when no terminal API exists", async () => {
    const page = createMockPage({
      innerText: "",
      innerHTML: "",
      evaluateResult: "",
    });
    const terminal = new PlaywrightTerminal(page);

    const content = await terminal.getContent();

    expect(content.text).toBe("");
    expect(content.html).toBe("");
  });

  it("buffer fallback handles evaluate throwing", async () => {
    const locator = {
      innerText: async () => "",
      innerHTML: async () => "",
      first: () => locator,
      waitFor: async () => {},
      click: async () => {},
      isVisible: async () => true,
      count: async () => 1,
      screenshot: async () => Buffer.from(""),
    };

    const page = {
      locator: () => locator,
      evaluate: async () => {
        throw new Error("page crashed");
      },
      keyboard: { type: async () => {}, press: async () => {} },
      screenshot: async () => Buffer.from(""),
      goto: async () => {},
    } as any;

    const terminal = new PlaywrightTerminal(page);
    const content = await terminal.getContent();

    expect(content.text).toBe("");
  });
});

describe("PlaywrightTerminal.waitForText with buffer fallback", () => {
  it("finds text from buffer fallback", async () => {
    let callCount = 0;
    const locator = {
      innerText: async () => "",
      innerHTML: async () => "",
      first: () => locator,
      waitFor: async () => {},
      click: async () => {},
      isVisible: async () => true,
      count: async () => 1,
      screenshot: async () => Buffer.from(""),
    };

    const page = {
      locator: () => locator,
      evaluate: async () => {
        callCount++;
        // Simulate text appearing after a few polls
        return callCount >= 2 ? "$ echo hello\nhello\n$ " : "$ ";
      },
      keyboard: { type: async () => {}, press: async () => {} },
      screenshot: async () => Buffer.from(""),
      goto: async () => {},
    } as any;

    const terminal = new PlaywrightTerminal(page);

    // Should not throw — text appears via buffer fallback
    await terminal.waitForText("hello", { timeout: 5000 });
  });

  it("times out when text never appears", async () => {
    const page = createMockPage({
      innerText: "",
      evaluateResult: "nothing here",
    });
    const terminal = new PlaywrightTerminal(page);

    await expect(
      terminal.waitForText("NEVER_FOUND", { timeout: 500 })
    ).rejects.toThrow("Timeout waiting for text");
  });
});
