/**
 * URL-based command injection utilities for ttyd.
 * Enables passing commands via URL parameters when ttyd is started with --url-arg.
 *
 * @module client/command-injection
 */

/**
 * Build a URL with a command argument.
 * Requires ttyd to be started with --url-arg flag.
 *
 * @param baseUrl - Base ttyd URL
 * @param command - Command to inject
 * @returns URL with command argument
 *
 * @example
 * ```typescript
 * const url = buildCommandUrl('http://localhost:7681/', 'vim file.txt');
 * // http://localhost:7681/?arg=vim%20file.txt
 * ```
 */
export function buildCommandUrl(baseUrl: string, command: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("arg", command);
  return url.toString();
}

/**
 * Build a URL with multiple command arguments.
 * Useful when ttyd is configured with multiple --url-arg parameters.
 *
 * @param baseUrl - Base ttyd URL
 * @param commands - Commands to inject
 * @returns URL with command arguments
 *
 * @example
 * ```typescript
 * const url = buildMultiCommandUrl('http://localhost:7681/', ['cmd1', 'cmd2']);
 * // http://localhost:7681/?arg=cmd1&arg=cmd2
 * ```
 */
export function buildMultiCommandUrl(baseUrl: string, commands: string[]): string {
  const url = new URL(baseUrl);
  for (const cmd of commands) {
    url.searchParams.append("arg", cmd);
  }
  return url.toString();
}

/**
 * Build a URL with authentication and optional command.
 *
 * @param baseUrl - Base ttyd URL
 * @param auth - Authentication credentials
 * @param command - Optional command to inject
 * @returns Authenticated URL
 *
 * @example
 * ```typescript
 * const url = buildAuthUrl('http://localhost:7681/', {
 *   username: 'user',
 *   password: 'pass'
 * }, 'vim');
 * // http://user:pass@localhost:7681/?arg=vim
 * ```
 */
export function buildAuthCommandUrl(
  baseUrl: string,
  auth: { username: string; password: string },
  command?: string
): string {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(auth.username);
  url.password = encodeURIComponent(auth.password);

  if (command) {
    url.searchParams.set("arg", command);
  }

  return url.toString();
}

/**
 * Parse command argument from a ttyd URL.
 *
 * @param url - URL to parse
 * @returns Command if present, null otherwise
 *
 * @example
 * ```typescript
 * const cmd = parseCommandFromUrl('http://localhost:7681/?arg=vim');
 * console.log(cmd); // 'vim'
 * ```
 */
export function parseCommandFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("arg");
  } catch {
    return null;
  }
}

/**
 * Parse all command arguments from a ttyd URL.
 *
 * @param url - URL to parse
 * @returns Array of commands
 */
export function parseAllCommandsFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.getAll("arg");
  } catch {
    return [];
  }
}

/**
 * Create a command that runs a script and then starts an interactive shell.
 * Useful for setup commands that should leave the terminal in a usable state.
 *
 * @param setupCommand - Command to run first
 * @param shell - Shell to exec into after setup (default: bash)
 * @returns Combined command
 *
 * @example
 * ```typescript
 * const cmd = createSetupCommand('cd /app && source .env');
 * // 'cd /app && source .env; exec bash'
 * ```
 */
export function createSetupCommand(setupCommand: string, shell = "bash"): string {
  return `${setupCommand}; exec ${shell}`;
}

/**
 * Create a command that sources a script and stays interactive.
 *
 * @param scriptPath - Path to the script to source
 * @param shell - Shell to use (default: bash)
 * @returns Source command
 */
export function createSourceCommand(scriptPath: string, shell = "bash"): string {
  return `source ${scriptPath}; exec ${shell}`;
}

/**
 * Create a command that changes directory and starts a shell.
 *
 * @param directory - Directory to change to
 * @param shell - Shell to use (default: bash)
 * @returns Change directory command
 */
export function createCdCommand(directory: string, shell = "bash"): string {
  return `cd ${directory} && exec ${shell}`;
}

/**
 * Build a ttyd server URL from components.
 *
 * @param options - URL components
 * @returns Complete ttyd URL
 *
 * @example
 * ```typescript
 * const url = buildTtydUrl({
 *   host: 'localhost',
 *   port: 7681,
 *   basePath: '/terminal',
 *   secure: false
 * });
 * // http://localhost:7681/terminal/
 * ```
 */
export function buildTtydUrl(options: {
  host?: string;
  port: number;
  basePath?: string;
  secure?: boolean;
}): string {
  const { host = "localhost", port, basePath = "", secure = false } = options;

  const protocol = secure ? "https" : "http";
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;

  return `${protocol}://${host}:${port}${normalizedPath}`;
}

/**
 * Build a Just command URL.
 * Constructs a URL that will execute a Just recipe via ttyd.
 *
 * @param baseUrl - Base ttyd URL
 * @param recipe - Just recipe name
 * @param args - Optional recipe arguments
 * @returns URL that executes the Just recipe
 *
 * @example
 * ```typescript
 * const url = buildJustUrl('http://localhost:7681/', 'dev', ['--port=3000']);
 * // http://localhost:7681/?arg=just%20dev%20--port%3D3000
 * ```
 */
export function buildJustUrl(baseUrl: string, recipe: string, args: string[] = []): string {
  const command = ["just", recipe, ...args].join(" ");
  return buildCommandUrl(baseUrl, command);
}

/**
 * Escape a command for safe URL encoding.
 * Handles special characters that might cause issues.
 *
 * @param command - Command to escape
 * @returns Safely escaped command
 */
export function escapeCommand(command: string): string {
  // URL encoding handles most cases, but some shells need additional escaping
  return command
    .replace(/'/g, "'\"'\"'") // Escape single quotes for shell
    .replace(/\$/g, "\\$"); // Escape dollar signs
}

/**
 * Create a watch command that restarts on file changes.
 * Useful for development servers.
 *
 * @param command - Command to watch
 * @param patterns - File patterns to watch
 * @returns Watch command
 */
export function createWatchCommand(
  command: string,
  patterns: string[] = ["**/*.ts", "**/*.js"]
): string {
  // Uses entr if available, falls back to while loop
  const patternList = patterns.join(" ");
  return `find . -name "${patternList}" | entr -r ${command} 2>/dev/null || while true; do ${command}; sleep 2; done`;
}
