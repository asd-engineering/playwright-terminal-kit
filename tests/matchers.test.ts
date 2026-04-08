/**
 * Unit tests for terminal custom matchers
 */

import { describe, it, expect } from "bun:test";
import { terminalMatchers, terminalAssert } from "../src/testing/matchers.js";
import type { TerminalContent } from "../src/client/playwright-terminal.js";
import type { TerminalSnapshot } from "../src/server/tmux-session.js";

function makeContent(text: string): TerminalContent {
  return { html: "", text, normalized: text };
}

function makeSnapshot(text: string, cols = 80, rows = 24): TerminalSnapshot {
  return {
    text,
    raw: text,
    normalized: text,
    timestamp: Date.now(),
    name: "test",
    sessionName: "test-session",
    size: { cols, rows },
  };
}

describe("terminalMatchers", () => {
  describe("toMatchTerminalText", () => {
    it("matches exact text with normalization", () => {
      const snap = makeSnapshot("hello world");
      const result = terminalMatchers.toMatchTerminalText(snap, "hello world");
      expect(result.pass).toBe(true);
    });

    it("fails on different text", () => {
      const snap = makeSnapshot("hello world");
      const result = terminalMatchers.toMatchTerminalText(snap, "goodbye");
      expect(result.pass).toBe(false);
      expect(result.message()).toContain("Expected terminal to match");
    });

    it("supports ignoreCase option", () => {
      const snap = makeSnapshot("Hello World");
      const result = terminalMatchers.toMatchTerminalText(snap, "hello world", {
        ignoreCase: true,
      });
      expect(result.pass).toBe(true);
    });

    it("works with TerminalContent", () => {
      const content = makeContent("test output");
      const result = terminalMatchers.toMatchTerminalText(content, "test output");
      expect(result.pass).toBe(true);
    });

    it("normalizes whitespace by default", () => {
      const snap = makeSnapshot("hello   \nworld  ");
      const result = terminalMatchers.toMatchTerminalText(snap, "hello\nworld");
      expect(result.pass).toBe(true);
    });

    it("skips normalization when disabled", () => {
      const snap = makeSnapshot("hello   ");
      const result = terminalMatchers.toMatchTerminalText(snap, "hello   ", { normalize: false });
      expect(result.pass).toBe(true);
    });
  });

  describe("toContainTerminalText", () => {
    it("matches when text contains expected", () => {
      const content = makeContent("$ echo hello\nhello\n$ ");
      const result = terminalMatchers.toContainTerminalText(content, "hello");
      expect(result.pass).toBe(true);
    });

    it("fails when text does not contain expected", () => {
      const content = makeContent("$ echo hello");
      const result = terminalMatchers.toContainTerminalText(content, "goodbye");
      expect(result.pass).toBe(false);
    });

    it("supports ignoreCase option", () => {
      const content = makeContent("HELLO WORLD");
      const result = terminalMatchers.toContainTerminalText(content, "hello", { ignoreCase: true });
      expect(result.pass).toBe(true);
    });

    it("strips ANSI by default", () => {
      const content = makeContent("\x1b[32mhello\x1b[0m");
      const result = terminalMatchers.toContainTerminalText(content, "hello");
      expect(result.pass).toBe(true);
    });

    it("preserves ANSI when stripAnsi is false", () => {
      const content = makeContent("\x1b[32mhello\x1b[0m");
      const result = terminalMatchers.toContainTerminalText(content, "\x1b[32m", {
        stripAnsi: false,
      });
      expect(result.pass).toBe(true);
    });

    it("works with TerminalSnapshot", () => {
      const snap = makeSnapshot("output text here");
      const result = terminalMatchers.toContainTerminalText(snap, "text");
      expect(result.pass).toBe(true);
    });
  });

  describe("toMatchTerminalPattern", () => {
    it("matches with regex", () => {
      const content = makeContent("user@host:~$ ls");
      const result = terminalMatchers.toMatchTerminalPattern(content, /user@\w+/);
      expect(result.pass).toBe(true);
    });

    it("fails when regex doesn't match", () => {
      const content = makeContent("just text");
      const result = terminalMatchers.toMatchTerminalPattern(content, /user@\w+/);
      expect(result.pass).toBe(false);
    });

    it("strips ANSI before matching", () => {
      const content = makeContent("\x1b[32muser@host\x1b[0m");
      const result = terminalMatchers.toMatchTerminalPattern(content, /user@host/);
      expect(result.pass).toBe(true);
    });
  });

  describe("toShowPrompt", () => {
    it("detects default prompt patterns ($ sign)", () => {
      const content = makeContent("output\n$ ");
      const result = terminalMatchers.toShowPrompt(content);
      expect(result.pass).toBe(true);
    });

    it("detects hash prompt", () => {
      const content = makeContent("root output\n# ");
      const result = terminalMatchers.toShowPrompt(content);
      expect(result.pass).toBe(true);
    });

    it("detects > prompt", () => {
      const content = makeContent("something\n> ");
      const result = terminalMatchers.toShowPrompt(content);
      expect(result.pass).toBe(true);
    });

    it("fails when no prompt found", () => {
      const content = makeContent("just output without prompt");
      const result = terminalMatchers.toShowPrompt(content);
      expect(result.pass).toBe(false);
    });

    it("supports custom prompt pattern as string", () => {
      const content = makeContent("mysql>");
      const result = terminalMatchers.toShowPrompt(content, "mysql>");
      expect(result.pass).toBe(true);
    });

    it("supports custom prompt pattern as RegExp", () => {
      const content = makeContent(">>> ");
      const result = terminalMatchers.toShowPrompt(content, />>>\s*$/m);
      expect(result.pass).toBe(true);
    });
  });

  describe("toHaveTerminalSize", () => {
    it("matches exact size", () => {
      const snap = makeSnapshot("", 80, 24);
      const result = terminalMatchers.toHaveTerminalSize(snap, { cols: 80, rows: 24 });
      expect(result.pass).toBe(true);
    });

    it("matches cols only", () => {
      const snap = makeSnapshot("", 120, 40);
      const result = terminalMatchers.toHaveTerminalSize(snap, { cols: 120 });
      expect(result.pass).toBe(true);
    });

    it("matches rows only", () => {
      const snap = makeSnapshot("", 80, 24);
      const result = terminalMatchers.toHaveTerminalSize(snap, { rows: 24 });
      expect(result.pass).toBe(true);
    });

    it("fails on wrong cols", () => {
      const snap = makeSnapshot("", 80, 24);
      const result = terminalMatchers.toHaveTerminalSize(snap, { cols: 120 });
      expect(result.pass).toBe(false);
      expect(result.message()).toContain("cols");
    });

    it("fails on wrong rows", () => {
      const snap = makeSnapshot("", 80, 24);
      const result = terminalMatchers.toHaveTerminalSize(snap, { rows: 40 });
      expect(result.pass).toBe(false);
      expect(result.message()).toContain("rows");
    });
  });

  describe("toBeEmptyTerminal", () => {
    it("passes for empty content", () => {
      const content = makeContent("");
      const result = terminalMatchers.toBeEmptyTerminal(content);
      expect(result.pass).toBe(true);
    });

    it("passes for whitespace-only content", () => {
      const content = makeContent("   \n  \n  ");
      const result = terminalMatchers.toBeEmptyTerminal(content);
      expect(result.pass).toBe(true);
    });

    it("fails for non-empty content", () => {
      const content = makeContent("hello");
      const result = terminalMatchers.toBeEmptyTerminal(content);
      expect(result.pass).toBe(false);
    });

    it("treats ANSI-only content as empty", () => {
      const content = makeContent("\x1b[32m\x1b[0m");
      const result = terminalMatchers.toBeEmptyTerminal(content);
      expect(result.pass).toBe(true);
    });
  });

  describe("toHaveLineCount", () => {
    it("counts non-empty lines by default", () => {
      const content = makeContent("line1\nline2\nline3");
      const result = terminalMatchers.toHaveLineCount(content, 3);
      expect(result.pass).toBe(true);
    });

    it("ignores empty lines by default", () => {
      const content = makeContent("line1\n\nline2\n\n");
      const result = terminalMatchers.toHaveLineCount(content, 2);
      expect(result.pass).toBe(true);
    });

    it("counts all lines when ignoreEmpty is false", () => {
      const content = makeContent("line1\n\nline2");
      const result = terminalMatchers.toHaveLineCount(content, 3, { ignoreEmpty: false });
      expect(result.pass).toBe(true);
    });

    it("fails on wrong count", () => {
      const content = makeContent("line1\nline2");
      const result = terminalMatchers.toHaveLineCount(content, 5);
      expect(result.pass).toBe(false);
      expect(result.message()).toContain("Expected terminal to have 5 lines, got 2");
    });
  });
});

describe("terminalAssert", () => {
  describe("containsText", () => {
    it("passes when text is contained", () => {
      const content = makeContent("hello world");
      expect(() => terminalAssert.containsText(content, "hello")).not.toThrow();
    });

    it("throws when text is not contained", () => {
      const content = makeContent("hello");
      expect(() => terminalAssert.containsText(content, "goodbye")).toThrow();
    });
  });

  describe("matchesPattern", () => {
    it("passes when pattern matches", () => {
      const content = makeContent("user@host:~$");
      expect(() => terminalAssert.matchesPattern(content, /user@\w+/)).not.toThrow();
    });

    it("throws when pattern doesn't match", () => {
      const content = makeContent("plain");
      expect(() => terminalAssert.matchesPattern(content, /user@\w+/)).toThrow();
    });
  });

  describe("showsPrompt", () => {
    it("passes when prompt is visible", () => {
      const content = makeContent("output\n$ ");
      expect(() => terminalAssert.showsPrompt(content)).not.toThrow();
    });

    it("throws when no prompt visible", () => {
      const content = makeContent("no prompt here");
      expect(() => terminalAssert.showsPrompt(content)).toThrow();
    });
  });

  describe("isEmpty", () => {
    it("passes for empty terminal", () => {
      const content = makeContent("");
      expect(() => terminalAssert.isEmpty(content)).not.toThrow();
    });

    it("throws for non-empty terminal", () => {
      const content = makeContent("content");
      expect(() => terminalAssert.isEmpty(content)).toThrow();
    });
  });
});
