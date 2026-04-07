/**
 * Process lifecycle management for daemon and foreground processes.
 * Handles PID files, health checks, and graceful shutdown.
 *
 * @module server/process-manager
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { dirname, isAbsolute } from "path";
import { createConnection } from "net";
import type { ProcessManagerConfig } from "../config/schema.js";

/** Default configuration values */
const DEFAULTS: ProcessManagerConfig = {
  shutdownTimeoutMs: 5000,
  startupDelayMs: 100,
  httpTimeoutMs: 10000,
  httpIntervalMs: 200,
  portTimeoutMs: 10000,
  portIntervalMs: 100,
  logTimeoutMs: 10000,
  logPollMs: 100,
};

/** Simple sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Platform detection */
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";

/**
 * Readiness check configuration.
 */
export interface ReadinessConfig {
  /** HTTP endpoints to probe (2xx-4xx considered ready) */
  http?: string | string[];
  /** HTTP probe options */
  httpOptions?: { timeoutMs?: number; intervalMs?: number };
  /** TCP ports to probe */
  port?: { host: string; port: number } | Array<{ host: string; port: number }>;
  /** Port probe options */
  portOptions?: { timeoutMs?: number; intervalMs?: number };
  /** Log file pattern matching */
  log?: { file: string; regex: RegExp | string; timeoutMs?: number };
  /** Custom readiness function */
  custom?: () => Promise<boolean>;
}

/**
 * Daemon start options.
 */
export interface DaemonOptions {
  /** Process name for logging */
  name?: string;
  /** Binary path or command name */
  binary: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: NodeJS.ProcessEnv;
  /** Working directory */
  cwd?: string;
  /** PID file path (required for daemon tracking) */
  pidFile: string;
  /** Log file path (required for daemon output) */
  logFile: string;
  /** Readiness checks */
  readiness?: ReadinessConfig;
  /** Minimum uptime before considering stable (ms) */
  minUptimeMs?: number;
  /** Restart policy */
  restartPolicy?: "never" | "on-failure";
}

/**
 * Daemon start result.
 */
export interface DaemonResult {
  status: "started" | "already-running" | "failed";
  pid: number;
  alive: boolean;
  ready?: boolean;
  cmdline?: string;
}

/**
 * Stop result.
 */
export interface StopResult {
  stopped: boolean;
  pid?: number;
  reason?: string;
  error?: string;
}

/**
 * Treat 2xx-4xx HTTP codes as okay for readiness.
 */
function okStatus(code: number): boolean {
  return code >= 200 && code < 500;
}

/**
 * Probe an HTTP endpoint for readiness.
 */
async function waitForHTTP(
  url: string,
  config: ProcessManagerConfig
): Promise<boolean> {
  const deadline = Date.now() + config.httpTimeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (okStatus(res.status)) return true;
    } catch {
      // Service not ready
    }
    await sleep(config.httpIntervalMs);
  }
  return false;
}

/**
 * Probe a TCP port for readiness.
 */
async function waitForPort(
  target: { host: string; port: number },
  config: ProcessManagerConfig
): Promise<boolean> {
  const deadline = Date.now() + config.portTimeoutMs;

  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: target.host, port: target.port });
      const cleanup = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.once("connect", () => cleanup(true));
      socket.once("error", () => cleanup(false));
      setTimeout(() => cleanup(false), config.portIntervalMs);
    });
    if (ok) return true;
    await sleep(config.portIntervalMs);
  }
  return false;
}

/**
 * Tail a log file until a regex appears.
 */
async function waitForLogPattern(
  logFile: string,
  regex: RegExp,
  config: ProcessManagerConfig
): Promise<boolean> {
  const deadline = Date.now() + config.logTimeoutMs;
  let offset = 0;

  while (Date.now() < deadline) {
    try {
      const text = readFileSync(logFile, "utf-8");
      const slice = text.slice(offset);
      offset = text.length;
      if (regex.test(slice)) return true;
    } catch {
      // Log file not ready
    }
    await sleep(config.logPollMs);
  }
  return false;
}

/**
 * Resolve a binary path, looking up in PATH if necessary.
 */
function resolveBinary(binaryOrPath: string): string | null {
  if (!binaryOrPath) return null;

  if (isAbsolute(binaryOrPath) && existsSync(binaryOrPath)) {
    return binaryOrPath;
  }

  // Use which lookup
  try {
    const result = spawnSync(isWindows ? "where" : "which", [binaryOrPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const path = result.stdout?.toString().trim().split("\n")[0];
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Ensure directory exists for a file path.
 */
function ensureFileDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

/**
 * Check if a process is alive.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process and optionally its group.
 */
async function killProcessTree(
  pid: number,
  gentleMs: number,
  killGroup: boolean
): Promise<void> {
  // Send SIGTERM
  try {
    if (killGroup && !isWindows) process.kill(-pid, "SIGTERM");
  } catch {
    // Process group may not exist
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have exited
  }

  await sleep(gentleMs);

  // Send SIGKILL
  try {
    if (killGroup && !isWindows) process.kill(-pid, "SIGKILL");
  } catch {
    // Process group may not exist
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process may have exited
  }
}

/**
 * Get process command line (best effort).
 */
function getProcessCommand(pid: number): string | null {
  if (isLinux) {
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8");
      return cmdline.replace(/\0/g, " ").trim();
    } catch {
      return null;
    }
  }

  try {
    const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.stdout?.toString().trim() || null;
  } catch {
    return null;
  }
}

/**
 * Process lifecycle manager for daemons.
 */
export class ProcessManager {
  private config: ProcessManagerConfig;

  constructor(config: Partial<ProcessManagerConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Start a daemon process with health checking.
   */
  async startDaemon(options: DaemonOptions): Promise<DaemonResult> {
    const {
      name = "service",
      binary,
      args = [],
      env = process.env,
      cwd = process.cwd(),
      pidFile,
      logFile,
      readiness = {},
      minUptimeMs = 1200,
      restartPolicy = "never",
    } = options;

    ensureFileDir(pidFile);
    ensureFileDir(logFile);

    // Check for existing process
    if (existsSync(pidFile)) {
      const raw = readFileSync(pidFile, "utf-8").trim();
      const oldPid = parseInt(raw, 10);
      if (Number.isFinite(oldPid) && oldPid > 1 && isAlive(oldPid)) {
        const cmd = getProcessCommand(oldPid);
        return {
          status: "already-running",
          pid: oldPid,
          alive: true,
          ready: true,
          cmdline: cmd ?? undefined,
        };
      }
      rmSync(pidFile, { force: true });
    }

    const binPath = resolveBinary(binary);
    if (!binPath) {
      throw new Error(`Binary not found: ${binary}`);
    }

    // Start the process
    const startedAt = Date.now();
    const spawnOptions: SpawnOptions = {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    };

    const proc = spawn(binPath, args, spawnOptions);

    // Write output to log file
    const { createWriteStream } = await import("fs");
    const logStream = createWriteStream(logFile, { flags: "a" });
    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);

    // Write PID file
    writeFileSync(pidFile, `${proc.pid}\n`);
    proc.unref();

    // Short health check
    await sleep(this.config.startupDelayMs);
    if (!isAlive(proc.pid!)) {
      rmSync(pidFile, { force: true });
      return { status: "failed", pid: proc.pid!, alive: false };
    }

    // Wait for readiness
    const ok = await this.waitReadiness(readiness);
    if (!ok) {
      const diedEarly = !isAlive(proc.pid!) && Date.now() - startedAt < minUptimeMs;
      if (restartPolicy === "on-failure" && diedEarly) {
        console.warn(`${name}: retrying once due to early crash`);
        return this.startDaemon({ ...options, restartPolicy: "never" });
      }
      return { status: "started", pid: proc.pid!, alive: true, ready: false };
    }

    return { status: "started", pid: proc.pid!, alive: true, ready: true };
  }

  /**
   * Stop a daemon by PID file.
   */
  async stopByPidFile(pidFile: string, options: { killGroup?: boolean } = {}): Promise<StopResult> {
    const { killGroup = true } = options;

    try {
      const raw = readFileSync(pidFile, "utf-8");
      const pid = parseInt(raw.trim(), 10);
      if (!Number.isFinite(pid) || pid <= 1) {
        throw new Error(`Invalid PID in ${pidFile}`);
      }

      await killProcessTree(pid, this.config.shutdownTimeoutMs, !isWindows && killGroup);
      rmSync(pidFile, { force: true });
      return { stopped: true, pid };
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        return { stopped: false, reason: "no-pidfile" };
      }
      return { stopped: false, error: error.message };
    }
  }

  /**
   * Kill a process tree directly.
   */
  async killTree(pid: number, options: { killGroup?: boolean } = {}): Promise<void> {
    const { killGroup = true } = options;
    await killProcessTree(pid, this.config.shutdownTimeoutMs, !isWindows && killGroup);
  }

  /**
   * Wait for readiness conditions.
   */
  private async waitReadiness(readiness: ReadinessConfig): Promise<boolean> {
    const tasks: Promise<boolean>[] = [];

    // HTTP checks
    if (readiness.http) {
      const urls = Array.isArray(readiness.http) ? readiness.http : [readiness.http];
      const httpConfig = {
        ...this.config,
        ...readiness.httpOptions,
      };
      for (const url of urls) {
        tasks.push(waitForHTTP(url, httpConfig));
      }
    }

    // Port checks
    if (readiness.port) {
      const ports = Array.isArray(readiness.port) ? readiness.port : [readiness.port];
      const portConfig = {
        ...this.config,
        ...readiness.portOptions,
      };
      for (const p of ports) {
        tasks.push(waitForPort(p, portConfig));
      }
    }

    // Log pattern check
    if (readiness.log?.file && readiness.log?.regex) {
      const rx =
        readiness.log.regex instanceof RegExp
          ? readiness.log.regex
          : new RegExp(String(readiness.log.regex), "m");
      const logConfig = {
        ...this.config,
        logTimeoutMs: readiness.log.timeoutMs ?? this.config.logTimeoutMs,
      };
      tasks.push(waitForLogPattern(readiness.log.file, rx, logConfig));
    }

    // Custom check
    if (typeof readiness.custom === "function") {
      tasks.push(readiness.custom());
    }

    if (tasks.length === 0) return true;

    const results = await Promise.all(tasks);
    return results.every(Boolean);
  }

  /**
   * Start a foreground process with output streaming.
   */
  startForeground(options: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }): ChildProcess {
    const { command, args = [], cwd = process.cwd(), env = process.env } = options;

    const binPath = resolveBinary(command);
    if (!binPath) {
      throw new Error(`Binary not found: ${command}`);
    }

    const proc = spawn(binPath, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe output to console
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);

    return proc;
  }
}

/**
 * Default process manager instance.
 */
export const processManager = new ProcessManager();
