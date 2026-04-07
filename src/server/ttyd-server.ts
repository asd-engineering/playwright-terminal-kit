/**
 * ttyd server lifecycle management.
 * Provides a simple interface for starting and stopping ttyd instances.
 *
 * @module server/ttyd-server
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { getRandomPort } from "../util/port-allocator.js";
import { ProcessManager, type DaemonResult } from "./process-manager.js";
import type { TtydServerConfig } from "../config/schema.js";

/** Default ttyd configuration */
const DEFAULTS: TtydServerConfig = {
  port: 0,
  shell: "bash",
  basePath: "/",
  extraArgs: [],
  writable: true,
};

/**
 * Result of starting ttyd server.
 */
export interface TtydStartResult {
  /** Whether the server started successfully */
  success: boolean;
  /** Server port */
  port: number;
  /** Server URL */
  url: string;
  /** Process ID */
  pid: number;
  /** Authenticated URL (if auth configured) */
  authUrl?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Find ttyd binary in common locations.
 */
function findTtydBinary(customPath?: string): string | null {
  // Check custom path first
  if (customPath && existsSync(customPath)) {
    return customPath;
  }

  // Check common locations
  const paths = [
    // Global installs
    "/usr/local/bin/ttyd",
    "/usr/bin/ttyd",
    // Homebrew
    "/opt/homebrew/bin/ttyd",
    // User local
    `${process.env.HOME}/.local/bin/ttyd`,
    `${process.env.HOME}/.local/share/asd/bin/ttyd`,
    // Windows (via scoop/chocolatey)
    "C:\\ProgramData\\scoop\\shims\\ttyd.exe",
    "C:\\ProgramData\\chocolatey\\bin\\ttyd.exe",
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Try which/where lookup
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(cmd, ["ttyd"], { stdio: ["ignore", "pipe", "pipe"] });
    const path = result.stdout?.toString().trim().split("\n")[0];
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Not found
  }

  return null;
}

/**
 * ttyd server manager.
 *
 * @example
 * ```typescript
 * const server = new TtydServer({
 *   port: 0,  // Dynamic allocation
 *   auth: { username: 'user', password: 'pass' }
 * });
 *
 * const { port, url } = await server.start();
 * console.log(`ttyd running at ${url}`);
 *
 * // Later...
 * await server.stop();
 * ```
 */
export class TtydServer {
  private config: TtydServerConfig;
  private processManager: ProcessManager;
  private currentPort: number | null = null;
  private currentPid: number | null = null;
  private workDir: string;

  constructor(config: Partial<TtydServerConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.processManager = new ProcessManager();
    this.workDir = join(tmpdir(), `playwright-ttyd-${process.pid}`);
  }

  /**
   * Start the ttyd server.
   */
  async start(): Promise<TtydStartResult> {
    const ttydBin = findTtydBinary(this.config.binaryPath);
    if (!ttydBin) {
      return {
        success: false,
        port: 0,
        url: "",
        pid: 0,
        error:
          "ttyd binary not found. Install it via: brew install ttyd (macOS), apt install ttyd (Ubuntu), or download from https://github.com/tsl0922/ttyd/releases",
      };
    }

    // Allocate port if not specified
    const port = this.config.port || (await getRandomPort());
    this.currentPort = port;

    // Build arguments
    const args: string[] = [];

    // Writable mode
    if (this.config.writable) {
      args.push("-W");
    }

    // Working directory
    if (this.config.cwd) {
      args.push("--cwd", this.config.cwd);
    }

    // Port
    args.push("--port", String(port));

    // Base path
    if (this.config.basePath && this.config.basePath !== "/") {
      args.push("--base-path", this.config.basePath);
    }

    // Authentication
    if (this.config.auth) {
      const { username, password } = this.config.auth;
      args.push("-c", `${encodeURIComponent(username)}:${encodeURIComponent(password)}`);
    }

    // Extra args
    args.push(...this.config.extraArgs);

    // Shell command
    args.push(this.config.shell);

    // Start daemon
    const pidFile = join(this.workDir, "ttyd.pid");
    const logFile = join(this.workDir, "ttyd.log");

    let result: DaemonResult;
    try {
      result = await this.processManager.startDaemon({
        name: "ttyd",
        binary: ttydBin,
        args,
        pidFile,
        logFile,
        readiness: {
          http: [`http://localhost:${port}/`],
          httpOptions: { timeoutMs: 15000, intervalMs: 200 },
        },
      });
    } catch (e) {
      return {
        success: false,
        port,
        url: "",
        pid: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    if (result.status === "failed") {
      return {
        success: false,
        port,
        url: "",
        pid: result.pid,
        error: "ttyd failed to start. Check logs.",
      };
    }

    this.currentPid = result.pid;

    const basePath = this.config.basePath === "/" ? "" : this.config.basePath;
    const url = `http://localhost:${port}${basePath}/`;
    const authUrl = this.getAuthUrl();

    return {
      success: true,
      port,
      url,
      pid: result.pid,
      authUrl: authUrl || undefined,
    };
  }

  /**
   * Stop the ttyd server.
   */
  async stop(): Promise<void> {
    const pidFile = join(this.workDir, "ttyd.pid");
    await this.processManager.stopByPidFile(pidFile);
    this.currentPort = null;
    this.currentPid = null;
  }

  /**
   * Check if the server is running.
   */
  isRunning(): boolean {
    if (!this.currentPid) return false;
    try {
      process.kill(this.currentPid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current server port.
   */
  getPort(): number | null {
    return this.currentPort;
  }

  /**
   * Get the current process ID.
   */
  getPid(): number | null {
    return this.currentPid;
  }

  /**
   * Get the server URL.
   */
  getUrl(): string | null {
    if (!this.currentPort) return null;
    const basePath = this.config.basePath === "/" ? "" : this.config.basePath;
    return `http://localhost:${this.currentPort}${basePath}/`;
  }

  /**
   * Get the authenticated URL (with credentials in URL).
   */
  getAuthUrl(): string | null {
    if (!this.currentPort || !this.config.auth) return null;
    const { username, password } = this.config.auth;
    const basePath = this.config.basePath === "/" ? "" : this.config.basePath;
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@localhost:${this.currentPort}${basePath}/`;
  }

  /**
   * Get a URL with a command argument appended.
   * This requires ttyd to be started with --url-arg flag.
   *
   * @param command - Command to inject
   * @returns URL with command argument
   */
  getCommandUrl(command: string): string | null {
    const url = this.getUrl();
    if (!url) return null;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}arg=${encodeURIComponent(command)}`;
  }

  /**
   * Get the log file path.
   */
  getLogFile(): string {
    return join(this.workDir, "ttyd.log");
  }

  /**
   * Read the log file content.
   */
  readLogs(): string {
    const logFile = this.getLogFile();
    if (!existsSync(logFile)) return "";
    return readFileSync(logFile, "utf-8");
  }
}

/**
 * Create and start a ttyd server in one call.
 *
 * @param config - Server configuration
 * @returns Started server with result
 *
 * @example
 * ```typescript
 * const { server, result } = await createTtydServer({ port: 8080 });
 * if (result.success) {
 *   console.log(`Running at ${result.url}`);
 * }
 * ```
 */
export async function createTtydServer(
  config: Partial<TtydServerConfig> = {}
): Promise<{ server: TtydServer; result: TtydStartResult }> {
  const server = new TtydServer(config);
  const result = await server.start();
  return { server, result };
}
