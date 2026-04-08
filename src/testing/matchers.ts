/**
 * Custom Playwright expect matchers for terminal testing.
 *
 * @module testing/matchers
 */

import { expect } from "@playwright/test";
import type { TerminalSnapshot } from "../server/tmux-session.js";
import type { TerminalContent } from "../client/playwright-terminal.js";
import { normalizeTerminalOutput, stripAnsi } from "../util/ansi.js";

/**
 * Custom matchers for terminal content.
 */
export const terminalMatchers = {
  /**
   * Match terminal snapshot against expected text.
   */
  toMatchTerminalText(
    received: TerminalSnapshot | TerminalContent,
    expected: string,
    options?: { ignoreCase?: boolean; normalize?: boolean }
  ) {
    const { ignoreCase = false, normalize = true } = options || {};

    const text =
      "normalized" in received
        ? (received as TerminalSnapshot).normalized
        : (received as TerminalContent).text;
    let actual = normalize ? normalizeTerminalOutput(text) : text;
    let expectedNorm = normalize ? normalizeTerminalOutput(expected) : expected;

    if (ignoreCase) {
      actual = actual.toLowerCase();
      expectedNorm = expectedNorm.toLowerCase();
    }

    const pass = actual === expectedNorm;

    return {
      pass,
      message: () =>
        pass
          ? `Expected terminal not to match text:\n${expected}`
          : `Expected terminal to match text:\n\nExpected:\n${expectedNorm}\n\nReceived:\n${actual}`,
    };
  },

  /**
   * Match terminal snapshot contains text.
   */
  toContainTerminalText(
    received: TerminalSnapshot | TerminalContent,
    expected: string,
    options?: { ignoreCase?: boolean; stripAnsi?: boolean }
  ) {
    const { ignoreCase = false, stripAnsi: strip = true } = options || {};

    let text = "text" in received ? received.text : "";
    if (strip) {
      text = stripAnsi(text);
    }

    if (ignoreCase) {
      text = text.toLowerCase();
      expected = expected.toLowerCase();
    }

    const pass = text.includes(expected);

    return {
      pass,
      message: () =>
        pass
          ? `Expected terminal not to contain text: "${expected}"`
          : `Expected terminal to contain text: "${expected}"\n\nActual content:\n${text}`,
    };
  },

  /**
   * Match terminal snapshot matches regex.
   */
  toMatchTerminalPattern(received: TerminalSnapshot | TerminalContent, pattern: RegExp) {
    const text = "text" in received ? received.text : "";
    const normalized = stripAnsi(text);
    const pass = pattern.test(normalized);

    return {
      pass,
      message: () =>
        pass
          ? `Expected terminal not to match pattern: ${pattern}`
          : `Expected terminal to match pattern: ${pattern}\n\nActual content:\n${normalized}`,
    };
  },

  /**
   * Match terminal is showing a prompt.
   */
  toShowPrompt(
    received: TerminalSnapshot | TerminalContent,
    promptPattern: string | RegExp = /[$#>%]\s*$/m
  ) {
    const text = "text" in received ? received.text : "";
    const normalized = stripAnsi(text);

    const pattern =
      typeof promptPattern === "string"
        ? new RegExp(promptPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : promptPattern;

    const pass = pattern.test(normalized);

    return {
      pass,
      message: () =>
        pass
          ? `Expected terminal not to show prompt matching: ${pattern}`
          : `Expected terminal to show prompt matching: ${pattern}\n\nActual content:\n${normalized}`,
    };
  },

  /**
   * Match terminal has specific dimensions.
   */
  toHaveTerminalSize(received: TerminalSnapshot, expected: { cols?: number; rows?: number }) {
    const { cols: expectedCols, rows: expectedRows } = expected;
    const { cols: actualCols, rows: actualRows } = received.size;

    const colsMatch = expectedCols === undefined || actualCols === expectedCols;
    const rowsMatch = expectedRows === undefined || actualRows === expectedRows;
    const pass = colsMatch && rowsMatch;

    return {
      pass,
      message: () => {
        const issues: string[] = [];
        if (!colsMatch) {
          issues.push(`cols: expected ${expectedCols}, got ${actualCols}`);
        }
        if (!rowsMatch) {
          issues.push(`rows: expected ${expectedRows}, got ${actualRows}`);
        }
        return pass
          ? `Expected terminal not to have size ${JSON.stringify(expected)}`
          : `Terminal size mismatch: ${issues.join(", ")}`;
      },
    };
  },

  /**
   * Match terminal output is empty (or whitespace only).
   */
  toBeEmptyTerminal(received: TerminalSnapshot | TerminalContent) {
    const text = "text" in received ? received.text : "";
    const normalized = stripAnsi(text).trim();
    const pass = normalized === "";

    return {
      pass,
      message: () =>
        pass
          ? "Expected terminal not to be empty"
          : `Expected terminal to be empty\n\nActual content:\n${normalized}`,
    };
  },

  /**
   * Match terminal line count.
   */
  toHaveLineCount(
    received: TerminalSnapshot | TerminalContent,
    expected: number,
    options?: { ignoreEmpty?: boolean }
  ) {
    const { ignoreEmpty = true } = options || {};

    const text = "text" in received ? received.text : "";
    const lines = stripAnsi(text).split("\n");
    const count = ignoreEmpty ? lines.filter((l) => l.trim() !== "").length : lines.length;

    const pass = count === expected;

    return {
      pass,
      message: () =>
        pass
          ? `Expected terminal not to have ${expected} lines`
          : `Expected terminal to have ${expected} lines, got ${count}`,
    };
  },
};

/**
 * Extend Playwright's expect with terminal matchers.
 *
 * @example
 * ```typescript
 * import { expect } from '@playwright/test';
 * import { extendExpect } from '@asd-engineering/playwright-ttyd';
 *
 * extendExpect();
 *
 * test('terminal test', async ({ terminal }) => {
 *   const content = await terminal.getContent();
 *   expect(content).toContainTerminalText('$');
 *   expect(content).toMatchTerminalPattern(/user@host/);
 * });
 * ```
 */
export function extendExpect(): void {
  expect.extend(terminalMatchers);
}

/**
 * Type declarations for extended expect.
 */
declare module "@playwright/test" {
  interface Matchers<R> {
    toMatchTerminalText(
      expected: string,
      options?: { ignoreCase?: boolean; normalize?: boolean }
    ): R;
    toContainTerminalText(
      expected: string,
      options?: { ignoreCase?: boolean; stripAnsi?: boolean }
    ): R;
    toMatchTerminalPattern(pattern: RegExp): R;
    toShowPrompt(promptPattern?: string | RegExp): R;
    toHaveTerminalSize(expected: { cols?: number; rows?: number }): R;
    toBeEmptyTerminal(): R;
    toHaveLineCount(expected: number, options?: { ignoreEmpty?: boolean }): R;
  }
}

/**
 * Convenience assertions that don't require extending expect.
 */
export const terminalAssert = {
  /**
   * Assert terminal contains text.
   */
  containsText(content: TerminalSnapshot | TerminalContent, expected: string): void {
    const result = terminalMatchers.toContainTerminalText(content, expected);
    if (!result.pass) {
      throw new Error(result.message());
    }
  },

  /**
   * Assert terminal matches pattern.
   */
  matchesPattern(content: TerminalSnapshot | TerminalContent, pattern: RegExp): void {
    const result = terminalMatchers.toMatchTerminalPattern(content, pattern);
    if (!result.pass) {
      throw new Error(result.message());
    }
  },

  /**
   * Assert terminal shows prompt.
   */
  showsPrompt(content: TerminalSnapshot | TerminalContent, promptPattern?: string | RegExp): void {
    const result = terminalMatchers.toShowPrompt(content, promptPattern);
    if (!result.pass) {
      throw new Error(result.message());
    }
  },

  /**
   * Assert terminal is empty.
   */
  isEmpty(content: TerminalSnapshot | TerminalContent): void {
    const result = terminalMatchers.toBeEmptyTerminal(content);
    if (!result.pass) {
      throw new Error(result.message());
    }
  },
};
