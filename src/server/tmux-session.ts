/**
 * tmux session management for deterministic terminal control.
 * Provides isolated, reproducible terminal sessions for testing.
 *
 * @module server/tmux-session
 */

import { spawnSync } from "child_process";
import { stripAnsi, normalizeTerminalOutput } from "../util/ansi.js";
import type { TmuxSessionConfig } from "../config/schema.js";

/** Default tmux session configuration */
const DEFAULTS: Omit<TmuxSessionConfig, "sessionName"> = {
  size: { cols: 120, rows: 40 },
  shell: "bash",
};

/** Simple sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Check if tmux is available.
 */
function isTmuxAvailable(): boolean {
  try {
    const result = spawnSync("which", ["tmux"], { stdio: ["ignore", "pipe", "pipe"] });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Terminal snapshot for comparison.
 */
export interface TerminalSnapshot {
  /** Raw content with ANSI codes */
  raw: string;
  /** Content with ANSI codes stripped */
  text: string;
  /** Normalized content for comparison */
  normalized: string;
  /** Session name */
  sessionName: string;
  /** Snapshot name/label */
  name?: string;
  /** Timestamp when captured */
  timestamp: number;
  /** Terminal dimensions */
  size: { cols: number; rows: number };
}

/**
 * tmux session manager for terminal testing.
 *
 * @example
 * ```typescript
 * const session = new TmuxSession({ sessionName: 'test-session' });
 * await session.create();
 *
 * // Run a command
 * await session.sendText('echo hello');
 * await session.sendKeys(['Enter']);
 *
 * // Wait for output
 * await session.waitForText('hello');
 *
 * // Capture state
 * const snapshot = await session.snapshot('after-echo');
 * console.log(snapshot.text);
 *
 * // Cleanup
 * await session.destroy();
 * ```
 */
export class TmuxSession {
  private config: TmuxSessionConfig;
  private created = false;

  constructor(
    config:
      | TmuxSessionConfig
      | ({ sessionName: string } & Partial<Omit<TmuxSessionConfig, "sessionName">>)
  ) {
    this.config = { ...DEFAULTS, ...config } as TmuxSessionConfig;
  }

  /**
   * Create the tmux session.
   */
  async create(): Promise<void> {
    if (!isTmuxAvailable()) {
      throw new Error(
        "tmux is not installed. Install it via: brew install tmux (macOS) or apt install tmux (Ubuntu)"
      );
    }

    // Kill existing session if present
    await this.destroy().catch(() => {});

    const { sessionName, size, shell, cwd } = this.config;

    // Create new session with specific dimensions
    const args = [
      "new-session",
      "-d", // detached
      "-s",
      sessionName,
      "-x",
      String(size.cols),
      "-y",
      String(size.rows),
    ];

    if (cwd) {
      args.push("-c", cwd);
    }

    // Shell command
    args.push(shell);

    const result = spawnSync("tmux", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || "";
      throw new Error(`Failed to create tmux session: ${stderr}`);
    }

    this.created = true;

    // Small delay for session initialization
    await sleep(100);
  }

  /**
   * Destroy the tmux session.
   */
  async destroy(): Promise<void> {
    if (!this.created) return;

    try {
      spawnSync("tmux", ["kill-session", "-t", this.config.sessionName], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // Session may already be gone
    }

    this.created = false;
  }

  /**
   * Check if the session exists.
   */
  exists(): boolean {
    const result = spawnSync("tmux", ["has-session", "-t", this.config.sessionName], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
  }

  /**
   * Send keys to the session.
   * Accepts human-readable key names like "Tab", "Ctrl+C", "Enter".
   *
   * @param keys - Single key or array of keys
   */
  async sendKeys(keys: string | string[]): Promise<void> {
    this.ensureCreated();

    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const key of keyList) {
      // tmux send-keys has built-in support for some key names
      const tmuxKeys = this.toTmuxKey(key);
      spawnSync("tmux", ["send-keys", "-t", this.config.sessionName, ...tmuxKeys], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Small delay between keys
      await sleep(50);
    }
  }

  /**
   * Send literal text to the session (no special key interpretation).
   *
   * @param text - Text to send
   */
  async sendText(text: string): Promise<void> {
    this.ensureCreated();

    // Use -l (literal) flag to prevent interpretation
    spawnSync("tmux", ["send-keys", "-t", this.config.sessionName, "-l", text], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * Send a command followed by Enter.
   *
   * @param command - Command to run
   */
  async runCommand(command: string): Promise<void> {
    await this.sendText(command);
    await this.sendKeys("Enter");
  }

  /**
   * Capture the current pane content (raw text).
   */
  async capturePane(): Promise<string> {
    this.ensureCreated();

    const result = spawnSync("tmux", ["capture-pane", "-t", this.config.sessionName, "-p"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    return result.stdout?.toString() || "";
  }

  /**
   * Capture pane with ANSI escape codes preserved.
   */
  async captureAnsi(): Promise<string> {
    this.ensureCreated();

    const result = spawnSync("tmux", ["capture-pane", "-t", this.config.sessionName, "-p", "-e"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    return result.stdout?.toString() || "";
  }

  /**
   * Wait for specific text to appear in the terminal.
   *
   * @param pattern - String or regex to match
   * @param timeoutMs - Maximum wait time (default: 10000ms)
   * @returns True if pattern found, false on timeout
   */
  async waitForText(pattern: string | RegExp, timeoutMs = 10000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const regex = typeof pattern === "string" ? null : pattern;
    const needle = typeof pattern === "string" ? pattern : null;

    while (Date.now() < deadline) {
      const content = await this.capturePane();
      const text = stripAnsi(content);

      if (regex) {
        if (regex.test(text)) return true;
      } else if (needle) {
        if (text.includes(needle)) return true;
      }

      await sleep(100);
    }

    return false;
  }

  /**
   * Wait for the terminal to be idle (no changes for a period).
   *
   * @param stableMs - Time with no changes to consider idle (default: 500ms)
   * @param timeoutMs - Maximum wait time (default: 10000ms)
   */
  async waitForIdle(stableMs = 500, timeoutMs = 10000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastContent = "";
    let stableSince = Date.now();

    while (Date.now() < deadline) {
      const content = await this.capturePane();

      if (content !== lastContent) {
        lastContent = content;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= stableMs) {
        return true;
      }

      await sleep(50);
    }

    return false;
  }

  /**
   * Create a snapshot of the current terminal state.
   *
   * @param name - Optional label for the snapshot
   */
  async snapshot(name?: string): Promise<TerminalSnapshot> {
    this.ensureCreated();

    const raw = await this.captureAnsi();
    const text = stripAnsi(raw);
    const normalized = normalizeTerminalOutput(raw);

    return {
      raw,
      text,
      normalized,
      sessionName: this.config.sessionName,
      name,
      timestamp: Date.now(),
      size: { ...this.config.size },
    };
  }

  /**
   * Clear the terminal screen.
   */
  async clear(): Promise<void> {
    await this.sendKeys("Ctrl+L");
    await sleep(100);
  }

  /**
   * Resize the terminal.
   *
   * @param cols - New column count
   * @param rows - New row count
   */
  async resize(cols: number, rows: number): Promise<void> {
    this.ensureCreated();

    spawnSync(
      "tmux",
      ["resize-window", "-t", this.config.sessionName, "-x", String(cols), "-y", String(rows)],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    this.config.size = { cols, rows };
    await sleep(50);
  }

  /**
   * Get the session name.
   */
  getSessionName(): string {
    return this.config.sessionName;
  }

  /**
   * Get the current terminal dimensions.
   */
  getSize(): { cols: number; rows: number } {
    return { ...this.config.size };
  }

  /**
   * Ensure session is created before operations.
   */
  private ensureCreated(): void {
    if (!this.created) {
      throw new Error("tmux session not created. Call create() first.");
    }
  }

  /**
   * Convert key names to tmux send-keys format.
   */
  private toTmuxKey(key: string): string[] {
    // tmux has built-in names for common keys
    const upper = key.toUpperCase();

    // Handle Ctrl combinations
    const ctrlMatch = key.match(/^Ctrl\+([A-Za-z])$/i);
    if (ctrlMatch) {
      return [`C-${ctrlMatch[1]!.toLowerCase()}`];
    }

    // Map common key names to tmux names
    const tmuxNames: Record<string, string> = {
      TAB: "Tab",
      ENTER: "Enter",
      RETURN: "Enter",
      ESCAPE: "Escape",
      ESC: "Escape",
      BACKSPACE: "BSpace",
      DELETE: "DC",
      UP: "Up",
      DOWN: "Down",
      LEFT: "Left",
      RIGHT: "Right",
      HOME: "Home",
      END: "End",
      PAGEUP: "PPage",
      PAGEDOWN: "NPage",
      PGUP: "PPage",
      PGDN: "NPage",
      SPACE: "Space",
      F1: "F1",
      F2: "F2",
      F3: "F3",
      F4: "F4",
      F5: "F5",
      F6: "F6",
      F7: "F7",
      F8: "F8",
      F9: "F9",
      F10: "F10",
      F11: "F11",
      F12: "F12",
    };

    const tmuxKey = tmuxNames[upper];
    if (tmuxKey) {
      return [tmuxKey];
    }

    // For plain text, send literally
    return ["-l", key];
  }
}

/**
 * Create a tmux session with a unique name.
 *
 * @param prefix - Prefix for the session name
 * @param config - Additional configuration
 * @returns Created session
 */
export async function createTmuxSession(
  prefix = "playwright-ttyd",
  config: Partial<Omit<TmuxSessionConfig, "sessionName">> = {}
): Promise<TmuxSession> {
  const sessionName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = new TmuxSession({ ...config, sessionName });
  await session.create();
  return session;
}
