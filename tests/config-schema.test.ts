/**
 * Unit tests for config/schema validation
 */

import { describe, it, expect } from "bun:test";
import {
  parseConfig,
  safeParseConfig,
  createDefaultConfig,
  AuthConfigSchema,
  TtydServerConfigSchema,
  TmuxSessionConfigSchema,
  WebSocketClientConfigSchema,
  PlaywrightTerminalConfigSchema,
  SnapshotConfigSchema,
  ProcessManagerConfigSchema,
} from "../src/config/schema.js";

describe("parseConfig", () => {
  it("returns defaults for empty object", () => {
    const config = parseConfig({});
    expect(config.ttyd.port).toBe(0);
    expect(config.ttyd.shell).toBe("bash");
    expect(config.ttyd.writable).toBe(true);
    expect(config.terminal.readyTimeoutMs).toBe(15000);
    expect(config.terminal.textTimeoutMs).toBe(10000);
    expect(config.snapshot.snapshotDir).toBe("__snapshots__");
    expect(config.processManager.shutdownTimeoutMs).toBe(5000);
  });

  it("accepts valid overrides", () => {
    const config = parseConfig({
      ttyd: { port: 8080, shell: "zsh" },
      terminal: { typeDelayMs: 100 },
    });
    expect(config.ttyd.port).toBe(8080);
    expect(config.ttyd.shell).toBe("zsh");
    expect(config.terminal.typeDelayMs).toBe(100);
  });

  it("throws on invalid config", () => {
    expect(() => parseConfig({ ttyd: { port: -1 } })).toThrow();
    expect(() => parseConfig({ ttyd: { port: 99999 } })).toThrow();
  });
});

describe("safeParseConfig", () => {
  it("returns success for valid config", () => {
    const result = safeParseConfig({});
    expect(result.success).toBe(true);
  });

  it("returns error for invalid config", () => {
    const result = safeParseConfig({ ttyd: { port: -1 } });
    expect(result.success).toBe(false);
  });
});

describe("createDefaultConfig", () => {
  it("returns a valid default config", () => {
    const config = createDefaultConfig();
    expect(config.ttyd).toBeDefined();
    expect(config.terminal).toBeDefined();
    expect(config.snapshot).toBeDefined();
    expect(config.processManager).toBeDefined();
    expect(config.tmux).toBeUndefined();
    expect(config.websocket).toBeUndefined();
  });
});

describe("individual schemas", () => {
  describe("AuthConfigSchema", () => {
    it("accepts valid auth", () => {
      const result = AuthConfigSchema.parse({ username: "user", password: "pass" });
      expect(result.username).toBe("user");
    });

    it("requires non-empty username", () => {
      expect(() => AuthConfigSchema.parse({ username: "", password: "pass" })).toThrow();
    });

    it("allows empty password", () => {
      const result = AuthConfigSchema.parse({ username: "user", password: "" });
      expect(result.password).toBe("");
    });
  });

  describe("TtydServerConfigSchema", () => {
    it("applies defaults", () => {
      const result = TtydServerConfigSchema.parse({});
      expect(result.port).toBe(0);
      expect(result.shell).toBe("bash");
      expect(result.writable).toBe(true);
      expect(result.basePath).toBe("/");
      expect(result.extraArgs).toEqual([]);
    });

    it("validates port range", () => {
      expect(() => TtydServerConfigSchema.parse({ port: 65536 })).toThrow();
    });

    it("accepts auth", () => {
      const result = TtydServerConfigSchema.parse({
        auth: { username: "admin", password: "secret" },
      });
      expect(result.auth!.username).toBe("admin");
    });
  });

  describe("TmuxSessionConfigSchema", () => {
    it("requires sessionName", () => {
      expect(() => TmuxSessionConfigSchema.parse({})).toThrow();
    });

    it("applies default size", () => {
      const result = TmuxSessionConfigSchema.parse({ sessionName: "test" });
      expect(result.size.cols).toBe(120);
      expect(result.size.rows).toBe(40);
    });

    it("validates size constraints", () => {
      expect(() =>
        TmuxSessionConfigSchema.parse({ sessionName: "test", size: { cols: 5, rows: 5 } })
      ).toThrow();
    });
  });

  describe("WebSocketClientConfigSchema", () => {
    it("requires valid server URL", () => {
      expect(() => WebSocketClientConfigSchema.parse({ server: "not-a-url" })).toThrow();
    });

    it("accepts valid server URL with defaults", () => {
      const result = WebSocketClientConfigSchema.parse({ server: "http://localhost:7681" });
      expect(result.path).toBe("/ws");
      expect(result.idleTimeoutMs).toBe(30000);
      expect(result.connectTimeoutMs).toBe(10000);
    });
  });

  describe("PlaywrightTerminalConfigSchema", () => {
    it("applies defaults", () => {
      const result = PlaywrightTerminalConfigSchema.parse({});
      expect(result.readyTimeoutMs).toBe(15000);
      expect(result.textTimeoutMs).toBe(10000);
      expect(result.typeDelayMs).toBe(50);
      expect(result.xtermSelector).toContain(".xterm");
    });

    it("rejects negative typeDelayMs", () => {
      expect(() => PlaywrightTerminalConfigSchema.parse({ typeDelayMs: -1 })).toThrow();
    });
  });

  describe("SnapshotConfigSchema", () => {
    it("applies defaults", () => {
      const result = SnapshotConfigSchema.parse({});
      expect(result.snapshotDir).toBe("__snapshots__");
      expect(result.stripAnsi).toBe(true);
      expect(result.normalizeWhitespace).toBe(true);
      expect(result.updateSnapshots).toBe(false);
      expect(result.ignorePatterns).toEqual([]);
    });
  });

  describe("ProcessManagerConfigSchema", () => {
    it("applies defaults", () => {
      const result = ProcessManagerConfigSchema.parse({});
      expect(result.shutdownTimeoutMs).toBe(5000);
      expect(result.startupDelayMs).toBe(100);
      expect(result.httpTimeoutMs).toBe(10000);
    });

    it("rejects non-positive timeouts", () => {
      expect(() => ProcessManagerConfigSchema.parse({ shutdownTimeoutMs: 0 })).toThrow();
    });

    it("allows zero startupDelayMs", () => {
      const result = ProcessManagerConfigSchema.parse({ startupDelayMs: 0 });
      expect(result.startupDelayMs).toBe(0);
    });
  });
});
