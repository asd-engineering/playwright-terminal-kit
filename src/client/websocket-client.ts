/**
 * WebSocket client for direct terminal communication with ttyd.
 * Bypasses the browser for headless command execution.
 *
 * @module client/websocket-client
 */

import WebSocket from "ws";
import { stripAnsi } from "../util/ansi.js";
import { keyToBytes } from "../util/key-codes.js";
import type { WebSocketClientConfig } from "../config/schema.js";

/** Default client configuration */
const DEFAULTS: Omit<WebSocketClientConfig, "server"> = {
  path: "/ws",
  idleTimeoutMs: 30000,
  connectTimeoutMs: 10000,
};

/** Simple sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** ttyd message types */
enum TtydMsgType {
  OUTPUT = "0",
  INPUT = "1",
  SET_WINDOW_SIZE = "2",
  PAUSE = "3",
  RESUME = "4",
  JSON_DATA = "6",
}

/**
 * Command execution result.
 */
export interface ExecuteResult {
  /** Command output */
  output: string;
  /** Raw output with ANSI codes */
  raw: string;
  /** Whether execution timed out */
  timedOut: boolean;
}

/**
 * WebSocket client for ttyd terminal interaction.
 *
 * @example
 * ```typescript
 * const client = new WebSocketClient({
 *   server: 'http://localhost:7681',
 *   username: 'user',
 *   password: 'pass'
 * });
 *
 * await client.connect();
 *
 * const result = await client.execute('echo hello');
 * console.log(result.output); // "hello"
 *
 * await client.disconnect();
 * ```
 */
export class WebSocketClient {
  private config: WebSocketClientConfig;
  private ws: WebSocket | null = null;
  private outputBuffer = "";
  private connected = false;
  private messageHandler: ((data: string) => void) | null = null;

  constructor(
    config:
      | WebSocketClientConfig
      | ({ server: string } & Partial<Omit<WebSocketClientConfig, "server">>)
  ) {
    this.config = { ...DEFAULTS, ...config } as WebSocketClientConfig;
  }

  /**
   * Connect to the ttyd WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const url = this.buildWsUrl();

      // Set up headers for authentication
      const headers: Record<string, string> = {};
      if (this.config.username && this.config.password) {
        const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
          "base64"
        );
        headers.Authorization = `Basic ${auth}`;
      }

      this.ws = new WebSocket(url, undefined, { headers });

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          reject(new Error(`Connection timeout after ${this.config.connectTimeoutMs}ms`));
        }
      }, this.config.connectTimeoutMs);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        this.setupMessageHandling();
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.ws = null;
      });
    });
  }

  /**
   * Disconnect from the server.
   */
  async disconnect(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve) => {
      this.ws!.once("close", () => {
        this.ws = null;
        this.connected = false;
        resolve();
      });

      this.ws!.close();

      // Force resolve after timeout
      setTimeout(() => {
        this.ws = null;
        this.connected = false;
        resolve();
      }, 1000);
    });
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Execute a command and wait for output.
   *
   * @param command - Command to execute
   * @param options - Execution options
   */
  async execute(
    command: string,
    options?: { idleTimeoutMs?: number; waitForPrompt?: string | RegExp }
  ): Promise<ExecuteResult> {
    const { idleTimeoutMs = this.config.idleTimeoutMs, waitForPrompt } = options || {};

    if (!this.isConnected()) {
      throw new Error("Not connected. Call connect() first.");
    }

    // Clear output buffer
    this.outputBuffer = "";

    // Send command
    this.sendInput(command + "\n");

    // Wait for output to stabilize (idle detection)
    let lastOutput = "";
    let lastChangeTime = Date.now();
    const startTime = Date.now();

    while (Date.now() - startTime < idleTimeoutMs * 2) {
      await sleep(100);

      if (this.outputBuffer !== lastOutput) {
        lastOutput = this.outputBuffer;
        lastChangeTime = Date.now();

        // Check for prompt if specified
        if (waitForPrompt) {
          const content = stripAnsi(this.outputBuffer);
          if (typeof waitForPrompt === "string") {
            if (content.includes(waitForPrompt)) break;
          } else {
            if (waitForPrompt.test(content)) break;
          }
        }
      } else if (Date.now() - lastChangeTime >= idleTimeoutMs) {
        // No changes for idle timeout - consider complete
        break;
      }
    }

    const timedOut = Date.now() - lastChangeTime < idleTimeoutMs;

    return {
      output: stripAnsi(this.outputBuffer),
      raw: this.outputBuffer,
      timedOut,
    };
  }

  /**
   * Send raw input to the terminal.
   *
   * @param data - Data to send
   */
  sendInput(data: string): void {
    if (!this.isConnected()) {
      throw new Error("Not connected");
    }

    // ttyd expects: message_type + data
    const msg = TtydMsgType.INPUT + data;
    this.ws!.send(msg);
  }

  /**
   * Send a key by name.
   *
   * @param key - Key name (e.g., "Tab", "Ctrl+C", "Enter")
   */
  sendKey(key: string): void {
    const bytes = keyToBytes(key);
    const data = String.fromCharCode(...bytes);
    this.sendInput(data);
  }

  /**
   * Send multiple keys.
   *
   * @param keys - Array of key names
   * @param delayMs - Delay between keys
   */
  async sendKeys(keys: string[], delayMs = 50): Promise<void> {
    for (const key of keys) {
      this.sendKey(key);
      await sleep(delayMs);
    }
  }

  /**
   * Set terminal window size.
   *
   * @param cols - Column count
   * @param rows - Row count
   */
  setWindowSize(cols: number, rows: number): void {
    if (!this.isConnected()) {
      throw new Error("Not connected");
    }

    const msg = TtydMsgType.SET_WINDOW_SIZE + JSON.stringify({ cols, rows });
    this.ws!.send(msg);
  }

  /**
   * Get the accumulated output buffer.
   */
  getOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Get output with ANSI stripped.
   */
  getOutputText(): string {
    return stripAnsi(this.outputBuffer);
  }

  /**
   * Clear the output buffer.
   */
  clearOutput(): void {
    this.outputBuffer = "";
  }

  /**
   * Set a custom message handler.
   */
  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Build WebSocket URL from config.
   */
  private buildWsUrl(): string {
    const serverUrl = new URL(this.config.server);
    const protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
    const path = this.config.path.startsWith("/") ? this.config.path : `/${this.config.path}`;

    return `${protocol}//${serverUrl.host}${path}`;
  }

  /**
   * Set up message handling.
   */
  private setupMessageHandling(): void {
    if (!this.ws) return;

    this.ws.on("message", (data: Buffer | string) => {
      const msg = data.toString();

      if (msg.length < 1) return;

      const type = msg[0];
      const content = msg.slice(1);

      switch (type) {
        case TtydMsgType.OUTPUT:
          this.outputBuffer += content;
          this.messageHandler?.(content);
          break;

        case TtydMsgType.JSON_DATA:
          // Handle JSON messages (window title, etc.)
          // Could emit events here for title changes, etc.
          break;

        // Other message types can be handled as needed
      }
    });
  }
}

/**
 * Create a connected WebSocket client.
 *
 * @param config - Client configuration
 * @returns Connected client
 *
 * @example
 * ```typescript
 * const client = await createWebSocketClient({
 *   server: 'http://localhost:7681',
 *   username: 'user',
 *   password: 'pass'
 * });
 *
 * const result = await client.execute('ls');
 * await client.disconnect();
 * ```
 */
export async function createWebSocketClient(
  config:
    | WebSocketClientConfig
    | ({ server: string } & Partial<Omit<WebSocketClientConfig, "server">>)
): Promise<WebSocketClient> {
  const client = new WebSocketClient(config);
  await client.connect();
  return client;
}
