/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from "bun:test";

import {
  keyToBytes,
  keysToBytes,
  isSpecialKey,
  isCtrlKey,
  getSupportedKeys,
} from "../src/util/key-codes.js";

import {
  stripAnsi,
  normalizeTerminalOutput,
  hasAnsi,
  visibleLength,
  replaceVariables,
} from "../src/util/ansi.js";

import {
  parsePortRange,
} from "../src/util/port-allocator.js";

import {
  buildCommandUrl,
  buildAuthCommandUrl,
  parseCommandFromUrl,
  buildTtydUrl,
} from "../src/client/command-injection.js";

describe("key-codes", () => {
  describe("keyToBytes", () => {
    it("converts Tab to correct byte", () => {
      expect(keyToBytes("Tab")).toEqual([9]);
    });

    it("converts Enter to correct byte", () => {
      expect(keyToBytes("Enter")).toEqual([13]);
    });

    it("converts Escape to correct byte", () => {
      expect(keyToBytes("Escape")).toEqual([27]);
    });

    it("converts Ctrl+C to correct byte", () => {
      expect(keyToBytes("Ctrl+C")).toEqual([3]);
    });

    it("converts Ctrl+Q to correct byte", () => {
      expect(keyToBytes("Ctrl+Q")).toEqual([17]);
    });

    it("handles case insensitivity for Ctrl combinations", () => {
      expect(keyToBytes("ctrl+c")).toEqual([3]);
      expect(keyToBytes("CTRL+C")).toEqual([3]);
    });

    it("converts arrow keys to ANSI sequences", () => {
      expect(keyToBytes("Up")).toEqual([27, 91, 65]);
      expect(keyToBytes("Down")).toEqual([27, 91, 66]);
      expect(keyToBytes("Right")).toEqual([27, 91, 67]);
      expect(keyToBytes("Left")).toEqual([27, 91, 68]);
    });

    it("converts plain text to character codes", () => {
      expect(keyToBytes("hello")).toEqual([104, 101, 108, 108, 111]);
    });

    it("handles single characters", () => {
      expect(keyToBytes("a")).toEqual([97]);
      expect(keyToBytes("A")).toEqual([65]);
      expect(keyToBytes("1")).toEqual([49]);
    });
  });

  describe("keysToBytes", () => {
    it("combines multiple keys", () => {
      expect(keysToBytes(["hello", "Enter"])).toEqual([
        104, 101, 108, 108, 111, 13,
      ]);
    });
  });

  describe("isSpecialKey", () => {
    it("returns true for special keys", () => {
      expect(isSpecialKey("Tab")).toBe(true);
      expect(isSpecialKey("Enter")).toBe(true);
      expect(isSpecialKey("Up")).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(isSpecialKey("hello")).toBe(false);
      expect(isSpecialKey("a")).toBe(false);
    });
  });

  describe("isCtrlKey", () => {
    it("returns true for Ctrl combinations", () => {
      expect(isCtrlKey("Ctrl+C")).toBe(true);
      expect(isCtrlKey("ctrl+q")).toBe(true);
    });

    it("returns false for non-Ctrl keys", () => {
      expect(isCtrlKey("Tab")).toBe(false);
      expect(isCtrlKey("Enter")).toBe(false);
    });
  });

  describe("getSupportedKeys", () => {
    it("returns array of special keys", () => {
      const keys = getSupportedKeys();
      expect(keys).toContain("TAB");
      expect(keys).toContain("ENTER");
      expect(keys).toContain("UP");
      expect(keys.length).toBeGreaterThan(10);
    });
  });
});

describe("ansi", () => {
  describe("stripAnsi", () => {
    it("removes color codes", () => {
      expect(stripAnsi("\x1b[32mgreen\x1b[0m")).toBe("green");
    });

    it("removes multiple codes", () => {
      expect(stripAnsi("\x1b[1m\x1b[31mred bold\x1b[0m")).toBe("red bold");
    });

    it("handles text without codes", () => {
      expect(stripAnsi("plain text")).toBe("plain text");
    });
  });

  describe("normalizeTerminalOutput", () => {
    it("normalizes line endings", () => {
      expect(normalizeTerminalOutput("hello\r\nworld")).toBe("hello\nworld");
    });

    it("removes trailing whitespace", () => {
      expect(normalizeTerminalOutput("hello   \nworld  ")).toBe("hello\nworld");
    });

    it("collapses multiple blank lines", () => {
      expect(normalizeTerminalOutput("a\n\n\n\nb")).toBe("a\n\nb");
    });

    it("strips ANSI codes", () => {
      expect(normalizeTerminalOutput("\x1b[32mtest\x1b[0m")).toBe("test");
    });
  });

  describe("hasAnsi", () => {
    it("returns true for ANSI content", () => {
      expect(hasAnsi("\x1b[32mgreen\x1b[0m")).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(hasAnsi("plain text")).toBe(false);
    });
  });

  describe("visibleLength", () => {
    it("returns correct length ignoring ANSI", () => {
      expect(visibleLength("\x1b[32mhello\x1b[0m")).toBe(5);
    });

    it("returns correct length for plain text", () => {
      expect(visibleLength("hello")).toBe(5);
    });
  });

  describe("replaceVariables", () => {
    it("replaces timestamps", () => {
      const result = replaceVariables("Log at 2024-01-15T10:30:00.123");
      expect(result).toContain("[TIMESTAMP]");
    });

    it("replaces time patterns", () => {
      const result = replaceVariables("Time: 10:30:45");
      expect(result).toContain("[TIME]");
    });

    it("replaces UUIDs", () => {
      const result = replaceVariables("ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(result).toContain("[UUID]");
    });

    it("replaces PIDs", () => {
      const result = replaceVariables("PID: 12345");
      expect(result).toContain("[PID]");
    });
  });
});

describe("port-allocator", () => {
  describe("parsePortRange", () => {
    it("parses valid range", () => {
      const result = parsePortRange("3000-4000");
      expect(result.min).toBe(3000);
      expect(result.max).toBe(4000);
    });

    it("handles reversed range", () => {
      const result = parsePortRange("4000-3000");
      expect(result.min).toBe(3000);
      expect(result.max).toBe(4000);
    });
  });
});

describe("command-injection", () => {
  describe("buildCommandUrl", () => {
    it("builds URL with command argument", () => {
      const url = buildCommandUrl("http://localhost:7681/", "vim file.txt");
      expect(url).toBe("http://localhost:7681/?arg=vim+file.txt");
    });

    it("encodes special characters", () => {
      const url = buildCommandUrl("http://localhost:7681/", 'echo "hello"');
      expect(url).toContain("arg=echo");
      expect(url).toContain("%22");
    });
  });

  describe("buildAuthCommandUrl", () => {
    it("includes auth credentials", () => {
      const url = buildAuthCommandUrl(
        "http://localhost:7681/",
        { username: "user", password: "pass" },
        "ls"
      );
      expect(url).toContain("user:pass@localhost");
      expect(url).toContain("arg=ls");
    });
  });

  describe("parseCommandFromUrl", () => {
    it("extracts command from URL", () => {
      const cmd = parseCommandFromUrl("http://localhost:7681/?arg=vim");
      expect(cmd).toBe("vim");
    });

    it("returns null for URL without arg", () => {
      const cmd = parseCommandFromUrl("http://localhost:7681/");
      expect(cmd).toBeNull();
    });
  });

  describe("buildTtydUrl", () => {
    it("builds basic URL", () => {
      const url = buildTtydUrl({ port: 7681 });
      expect(url).toBe("http://localhost:7681/");
    });

    it("includes base path", () => {
      const url = buildTtydUrl({ port: 7681, basePath: "/terminal" });
      expect(url).toBe("http://localhost:7681/terminal/");
    });

    it("supports HTTPS", () => {
      const url = buildTtydUrl({ port: 443, secure: true });
      expect(url).toBe("https://localhost:443/");
    });
  });
});
