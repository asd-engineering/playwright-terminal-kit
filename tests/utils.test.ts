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
  bytesToBuffer,
  keyToBuffer,
} from "../src/util/key-codes.js";

import {
  stripAnsi,
  stripAnsiAndControls,
  normalizeTerminalOutput,
  hasAnsi,
  visibleLength,
  replaceVariables,
  createIgnorePattern,
} from "../src/util/ansi.js";

import {
  parsePortRange,
  getRandomPort,
  isPortAvailable,
  getMultiplePorts,
  releasePort,
  clearAllocatedPorts,
  getAllocatedPorts,
} from "../src/util/port-allocator.js";

import {
  buildCommandUrl,
  buildMultiCommandUrl,
  buildAuthCommandUrl,
  parseCommandFromUrl,
  parseAllCommandsFromUrl,
  buildTtydUrl,
  buildJustUrl,
  escapeCommand,
  createSetupCommand,
  createSourceCommand,
  createCdCommand,
  createWatchCommand,
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
      expect(keysToBytes(["hello", "Enter"])).toEqual([104, 101, 108, 108, 111, 13]);
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

  describe("bytesToBuffer", () => {
    it("converts byte array to Buffer", () => {
      const buf = bytesToBuffer([9, 13, 27]);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(3);
      expect(buf[0]).toBe(9);
    });

    it("handles empty array", () => {
      const buf = bytesToBuffer([]);
      expect(buf.length).toBe(0);
    });
  });

  describe("keyToBuffer", () => {
    it("converts key name to Buffer", () => {
      const buf = keyToBuffer("Enter");
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf[0]).toBe(13);
    });

    it("converts plain text to Buffer", () => {
      const buf = keyToBuffer("hi");
      expect(buf.length).toBe(2);
      expect(buf[0]).toBe(104); // 'h'
      expect(buf[1]).toBe(105); // 'i'
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

    it("replaces custom patterns", () => {
      const result = replaceVariables("build-12345", [/build-\d+/g]);
      expect(result).toContain("[VAR]");
    });
  });

  describe("stripAnsiAndControls", () => {
    it("strips ANSI codes and control characters", () => {
      const result = stripAnsiAndControls("\x1b[32mhello\x1b[0m\x07");
      expect(result).toBe("hello");
    });

    it("preserves normal text", () => {
      expect(stripAnsiAndControls("hello world")).toBe("hello world");
    });

    it("removes null bytes and other control chars", () => {
      expect(stripAnsiAndControls("hel\x00lo\x01")).toBe("hello");
    });
  });

  describe("createIgnorePattern", () => {
    it("creates regex matching timestamps by default", () => {
      const pattern = createIgnorePattern();
      expect(pattern.test("2024-01-15T10:30:00")).toBe(true);
    });

    it("matches UUIDs by default", () => {
      const pattern = createIgnorePattern();
      expect(pattern.test("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
    });

    it("includes custom patterns", () => {
      const pattern = createIgnorePattern([/build-\d+/]);
      expect(pattern.test("build-12345")).toBe(true);
    });

    it("accepts string patterns", () => {
      const pattern = createIgnorePattern(["custom-\\d+"]);
      expect(pattern.test("custom-999")).toBe(true);
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

  describe("getRandomPort", () => {
    it("returns a valid port number", async () => {
      const port = await getRandomPort();
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65535);
    });

    it("returns different ports on successive calls", async () => {
      const port1 = await getRandomPort();
      const port2 = await getRandomPort();
      expect(port1).not.toBe(port2);
    });
  });

  describe("isPortAvailable", () => {
    it("returns true for an unused port", async () => {
      const port = await getRandomPort();
      // Port was just freed, should be available
      const available = await isPortAvailable(port);
      expect(available).toBe(true);
    });

    it("returns false for invalid port", async () => {
      const available = await isPortAvailable(0);
      expect(available).toBe(false);
    });
  });

  describe("getMultiplePorts", () => {
    it("returns requested number of ports", async () => {
      const ports = await getMultiplePorts(3);
      expect(ports.length).toBe(3);
      // All unique
      expect(new Set(ports).size).toBe(3);
    });

    it("returns empty array for 0", async () => {
      const ports = await getMultiplePorts(0);
      expect(ports).toEqual([]);
    });
  });

  describe("releasePort / getAllocatedPorts / clearAllocatedPorts", () => {
    it("tracks allocated ports", async () => {
      const port = await getRandomPort();
      const allocated = getAllocatedPorts();
      expect(allocated.has(port)).toBe(true);
    });

    it("releases a specific port", async () => {
      const port = await getRandomPort();
      releasePort(port);
      const allocated = getAllocatedPorts();
      expect(allocated.has(port)).toBe(false);
    });

    it("clears all allocated ports", async () => {
      await getRandomPort();
      await getRandomPort();
      clearAllocatedPorts();
      expect(getAllocatedPorts().size).toBe(0);
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

  describe("buildMultiCommandUrl", () => {
    it("builds URL with multiple arg parameters", () => {
      const url = buildMultiCommandUrl("http://localhost:7681/", ["cmd1", "cmd2"]);
      expect(url).toContain("arg=cmd1");
      expect(url).toContain("arg=cmd2");
    });

    it("handles empty command list", () => {
      const url = buildMultiCommandUrl("http://localhost:7681/", []);
      expect(url).toBe("http://localhost:7681/");
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

    it("works without command", () => {
      const url = buildAuthCommandUrl("http://localhost:7681/", {
        username: "user",
        password: "pass",
      });
      expect(url).toContain("user:pass@localhost");
      expect(url).not.toContain("arg=");
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

    it("returns null for invalid URL", () => {
      const cmd = parseCommandFromUrl("not a url");
      expect(cmd).toBeNull();
    });
  });

  describe("parseAllCommandsFromUrl", () => {
    it("extracts all commands from URL", () => {
      const cmds = parseAllCommandsFromUrl("http://localhost:7681/?arg=cmd1&arg=cmd2");
      expect(cmds).toEqual(["cmd1", "cmd2"]);
    });

    it("returns empty array for URL without args", () => {
      const cmds = parseAllCommandsFromUrl("http://localhost:7681/");
      expect(cmds).toEqual([]);
    });

    it("returns empty array for invalid URL", () => {
      const cmds = parseAllCommandsFromUrl("not a url");
      expect(cmds).toEqual([]);
    });
  });

  describe("createSetupCommand", () => {
    it("creates setup + shell command", () => {
      const cmd = createSetupCommand("cd /app && source .env");
      expect(cmd).toBe("cd /app && source .env; exec bash");
    });

    it("uses custom shell", () => {
      const cmd = createSetupCommand("source init.sh", "zsh");
      expect(cmd).toBe("source init.sh; exec zsh");
    });
  });

  describe("createSourceCommand", () => {
    it("creates source command", () => {
      const cmd = createSourceCommand("/path/to/script.sh");
      expect(cmd).toBe("source /path/to/script.sh; exec bash");
    });

    it("uses custom shell", () => {
      const cmd = createSourceCommand("/path/to/script.sh", "zsh");
      expect(cmd).toBe("source /path/to/script.sh; exec zsh");
    });
  });

  describe("createCdCommand", () => {
    it("creates cd command", () => {
      const cmd = createCdCommand("/app");
      expect(cmd).toBe("cd /app && exec bash");
    });

    it("uses custom shell", () => {
      const cmd = createCdCommand("/app", "zsh");
      expect(cmd).toBe("cd /app && exec zsh");
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

    it("supports custom host", () => {
      const url = buildTtydUrl({ host: "example.com", port: 8080 });
      expect(url).toBe("http://example.com:8080/");
    });
  });

  describe("buildJustUrl", () => {
    it("builds Just recipe URL", () => {
      const url = buildJustUrl("http://localhost:7681/", "dev");
      expect(url).toContain("arg=just+dev");
    });

    it("includes recipe arguments", () => {
      const url = buildJustUrl("http://localhost:7681/", "dev", ["--port=3000"]);
      expect(url).toContain("just+dev");
      expect(url).toContain("--port");
    });
  });

  describe("escapeCommand", () => {
    it("escapes single quotes", () => {
      const escaped = escapeCommand("echo 'hello'");
      expect(escaped).toContain("'\"'\"'");
    });

    it("escapes dollar signs", () => {
      const escaped = escapeCommand("echo $HOME");
      expect(escaped).toContain("\\$");
    });

    it("preserves plain commands", () => {
      const escaped = escapeCommand("ls -la");
      expect(escaped).toBe("ls -la");
    });
  });

  describe("createWatchCommand", () => {
    it("creates watch command with entr fallback", () => {
      const cmd = createWatchCommand("npm start");
      expect(cmd).toContain("entr");
      expect(cmd).toContain("npm start");
      expect(cmd).toContain("while true");
    });

    it("uses custom patterns", () => {
      const cmd = createWatchCommand("go build", ["**/*.go"]);
      expect(cmd).toContain("**/*.go");
    });
  });
});
