/**
 * Configuration schemas for playwright-ttyd library.
 * Uses Zod for runtime validation and type inference.
 *
 * @module config/schema
 */

import { z } from "zod";

/**
 * Authentication configuration schema.
 */
export const AuthConfigSchema = z.object({
  /** Username for HTTP Basic Auth */
  username: z.string().min(1),
  /** Password for HTTP Basic Auth */
  password: z.string(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * ttyd server configuration schema.
 */
export const TtydServerConfigSchema = z.object({
  /** Port to listen on (0 for dynamic allocation) */
  port: z.number().int().min(0).max(65535).default(0),

  /** Shell command to execute */
  shell: z.string().default("bash"),

  /** Working directory for the shell */
  cwd: z.string().optional(),

  /** Base path for the ttyd web interface */
  basePath: z.string().default("/"),

  /** HTTP Basic Auth credentials */
  auth: AuthConfigSchema.optional(),

  /** Additional ttyd arguments */
  extraArgs: z.array(z.string()).default([]),

  /** Path to ttyd binary (will be looked up if not provided) */
  binaryPath: z.string().optional(),

  /** Enable writable mode (-W flag) */
  writable: z.boolean().default(true),
});

export type TtydServerConfig = z.infer<typeof TtydServerConfigSchema>;

/**
 * tmux session configuration schema.
 */
export const TmuxSessionConfigSchema = z.object({
  /** Session name (must be unique) */
  sessionName: z.string().min(1),

  /** Terminal dimensions */
  size: z
    .object({
      cols: z.number().int().min(10).max(500).default(120),
      rows: z.number().int().min(5).max(200).default(40),
    })
    .default({ cols: 120, rows: 40 }),

  /** Shell to use for the session */
  shell: z.string().default("bash"),

  /** Working directory */
  cwd: z.string().optional(),

  /** Environment variables */
  env: z.record(z.string()).optional(),
});

export type TmuxSessionConfig = z.infer<typeof TmuxSessionConfigSchema>;

/**
 * WebSocket client configuration schema.
 */
export const WebSocketClientConfigSchema = z.object({
  /** Server URL (ws:// or wss://) */
  server: z.string().url(),

  /** Auth username */
  username: z.string().optional(),

  /** Auth password */
  password: z.string().optional(),

  /** WebSocket path */
  path: z.string().default("/ws"),

  /** Idle timeout in milliseconds before disconnecting */
  idleTimeoutMs: z.number().int().positive().default(30000),

  /** Connection timeout in milliseconds */
  connectTimeoutMs: z.number().int().positive().default(10000),
});

export type WebSocketClientConfig = z.infer<typeof WebSocketClientConfigSchema>;

/**
 * Playwright terminal configuration schema.
 */
export const PlaywrightTerminalConfigSchema = z.object({
  /** Wait timeout for terminal ready */
  readyTimeoutMs: z.number().int().positive().default(15000),

  /** Wait timeout for text to appear */
  textTimeoutMs: z.number().int().positive().default(10000),

  /** Delay between keystrokes (ms) */
  typeDelayMs: z.number().int().min(0).default(50),

  /** Selector for xterm.js container */
  xtermSelector: z.string().default(".xterm, .terminal, [class*='term']"),

  /** Selector for xterm.js textarea (for input) */
  xtermInputSelector: z.string().default(".xterm-helper-textarea"),

  /** Selector for xterm screen (content area) */
  xtermScreenSelector: z.string().default(".xterm-screen"),
});

export type PlaywrightTerminalConfig = z.infer<typeof PlaywrightTerminalConfigSchema>;

/**
 * Snapshot comparison configuration schema.
 */
export const SnapshotConfigSchema = z.object({
  /** Directory to store snapshots */
  snapshotDir: z.string().default("__snapshots__"),

  /** Whether to strip ANSI codes before comparison */
  stripAnsi: z.boolean().default(true),

  /** Whether to normalize whitespace */
  normalizeWhitespace: z.boolean().default(true),

  /** Patterns to ignore during comparison (replaced with placeholders) */
  ignorePatterns: z.array(z.union([z.string(), z.instanceof(RegExp)])).default([]),

  /** Update mode - write new snapshots instead of comparing */
  updateSnapshots: z.boolean().default(false),
});

export type SnapshotConfig = z.infer<typeof SnapshotConfigSchema>;

/**
 * Process manager configuration schema.
 */
export const ProcessManagerConfigSchema = z.object({
  /** Graceful shutdown timeout (ms) */
  shutdownTimeoutMs: z.number().int().positive().default(5000),

  /** Startup health check delay (ms) */
  startupDelayMs: z.number().int().min(0).default(100),

  /** HTTP readiness probe timeout (ms) */
  httpTimeoutMs: z.number().int().positive().default(10000),

  /** HTTP readiness probe interval (ms) */
  httpIntervalMs: z.number().int().positive().default(200),

  /** Port readiness probe timeout (ms) */
  portTimeoutMs: z.number().int().positive().default(10000),

  /** Port readiness probe interval (ms) */
  portIntervalMs: z.number().int().positive().default(100),

  /** Log pattern match timeout (ms) */
  logTimeoutMs: z.number().int().positive().default(10000),

  /** Log pattern poll interval (ms) */
  logPollMs: z.number().int().positive().default(100),
});

export type ProcessManagerConfig = z.infer<typeof ProcessManagerConfigSchema>;

/**
 * Combined library configuration schema.
 */
export const PlaywrightTtydConfigSchema = z.object({
  /** ttyd server settings */
  ttyd: TtydServerConfigSchema.default({}),

  /** tmux session settings */
  tmux: TmuxSessionConfigSchema.optional(),

  /** WebSocket client settings */
  websocket: WebSocketClientConfigSchema.optional(),

  /** Playwright terminal settings */
  terminal: PlaywrightTerminalConfigSchema.default({}),

  /** Snapshot comparison settings */
  snapshot: SnapshotConfigSchema.default({}),

  /** Process manager settings */
  processManager: ProcessManagerConfigSchema.default({}),
});

export type PlaywrightTtydConfig = z.infer<typeof PlaywrightTtydConfigSchema>;

/**
 * Parse and validate configuration with defaults.
 *
 * @param config - Partial configuration object
 * @returns Validated and complete configuration
 * @throws ZodError if validation fails
 */
export function parseConfig(config: unknown): PlaywrightTtydConfig {
  return PlaywrightTtydConfigSchema.parse(config);
}

/**
 * Parse configuration safely, returning errors instead of throwing.
 *
 * @param config - Configuration to parse
 * @returns Result with data or error
 */
export function safeParseConfig(
  config: unknown
): z.SafeParseReturnType<unknown, PlaywrightTtydConfig> {
  return PlaywrightTtydConfigSchema.safeParse(config);
}

/**
 * Create a default configuration.
 *
 * @returns Default configuration
 */
export function createDefaultConfig(): PlaywrightTtydConfig {
  return PlaywrightTtydConfigSchema.parse({});
}
