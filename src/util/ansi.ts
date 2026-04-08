/**
 * ANSI escape code utilities for terminal output processing.
 *
 * @module util/ansi
 */

/**
 * Extended ANSI regex that matches:
 * - CSI sequences: \x1b[...m (colors, styles)
 * - OSC sequences: \x1b]...BEL (titles, hyperlinks)
 * - Control characters: various terminal control codes
 */

const ANSI_FULL_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\].*?(?:\u0007|\u001b\\)/g;

/**
 * Regex for matching terminal control characters.
 */

const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strip ANSI escape sequences from a string.
 *
 * @param text - Text containing ANSI codes
 * @returns Text with ANSI codes removed
 *
 * @example
 * ```typescript
 * const plain = stripAnsi('\x1b[32mHello\x1b[0m');
 * console.log(plain); // 'Hello'
 * ```
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_FULL_REGEX, "");
}

/**
 * Strip both ANSI codes and control characters.
 *
 * @param text - Text to clean
 * @returns Cleaned text
 */
export function stripAnsiAndControls(text: string): string {
  return stripAnsi(text).replace(CONTROL_CHARS_REGEX, "");
}

/**
 * Normalize terminal output for comparison.
 * - Strips ANSI codes
 * - Normalizes line endings to LF
 * - Removes trailing whitespace from lines
 * - Collapses multiple blank lines
 *
 * @param text - Raw terminal output
 * @returns Normalized text
 */
export function normalizeTerminalOutput(text: string): string {
  let result = stripAnsi(text);

  // Normalize line endings
  result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove trailing whitespace from each line
  result = result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Collapse multiple blank lines to single blank line
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

/**
 * Check if a string contains ANSI escape codes.
 *
 * @param text - Text to check
 * @returns True if text contains ANSI codes
 */
export function hasAnsi(text: string): boolean {
  ANSI_FULL_REGEX.lastIndex = 0;
  return ANSI_FULL_REGEX.test(text);
}

/**
 * Extract visible text width (excluding ANSI codes).
 * Useful for calculating column widths in terminal output.
 *
 * @param text - Text potentially containing ANSI codes
 * @returns Visible character count
 */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

/**
 * ANSI color code constants for terminal styling.
 */
export const ANSI = {
  // Reset
  reset: "\x1b[0m",

  // Styles
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  blink: "\x1b[5m",
  inverse: "\x1b[7m",
  hidden: "\x1b[8m",
  strikethrough: "\x1b[9m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright foreground colors
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",

  // Bright background colors
  bgBrightBlack: "\x1b[100m",
  bgBrightRed: "\x1b[101m",
  bgBrightGreen: "\x1b[102m",
  bgBrightYellow: "\x1b[103m",
  bgBrightBlue: "\x1b[104m",
  bgBrightMagenta: "\x1b[105m",
  bgBrightCyan: "\x1b[106m",
  bgBrightWhite: "\x1b[107m",
} as const;

/**
 * Cursor movement escape sequences.
 */
export const CURSOR = {
  up: (n = 1) => `\x1b[${n}A`,
  down: (n = 1) => `\x1b[${n}B`,
  forward: (n = 1) => `\x1b[${n}C`,
  back: (n = 1) => `\x1b[${n}D`,
  home: "\x1b[H",
  position: (row: number, col: number) => `\x1b[${row};${col}H`,
  save: "\x1b[s",
  restore: "\x1b[u",
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
} as const;

/**
 * Screen control escape sequences.
 */
export const SCREEN = {
  clear: "\x1b[2J",
  clearLine: "\x1b[2K",
  clearToEnd: "\x1b[0J",
  clearToStart: "\x1b[1J",
  scrollUp: (n = 1) => `\x1b[${n}S`,
  scrollDown: (n = 1) => `\x1b[${n}T`,
} as const;

/**
 * Create an ignore pattern for snapshot comparison.
 * Matches timestamps, UUIDs, and other variable content.
 *
 * @param patterns - Additional patterns to ignore
 * @returns Combined regex for ignoring variable content
 */
export function createIgnorePattern(patterns: (string | RegExp)[] = []): RegExp {
  const defaultPatterns = [
    // Timestamps
    /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,
    /\d{2}:\d{2}:\d{2}/,
    // UUIDs
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    // PIDs
    /\bPID[:\s]+\d+/i,
    /\bpid[:\s]+\d+/,
    // Ports (often dynamic)
    /:\d{4,5}\b/,
  ];

  const allPatterns = [...defaultPatterns, ...patterns];
  const combined = allPatterns.map((p) => (p instanceof RegExp ? p.source : p)).join("|");

  return new RegExp(combined, "g");
}

/**
 * Replace variable content with placeholders for stable comparisons.
 *
 * @param text - Text containing variable content
 * @param patterns - Optional additional patterns to replace
 * @returns Text with variables replaced by placeholders
 */
export function replaceVariables(text: string, patterns: (string | RegExp)[] = []): string {
  let result = text;

  // Replace timestamps
  result = result.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?/g, "[TIMESTAMP]");
  result = result.replace(/\d{2}:\d{2}:\d{2}/g, "[TIME]");

  // Replace UUIDs
  result = result.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "[UUID]"
  );

  // Replace PIDs
  result = result.replace(/\bPID[:\s]+\d+/gi, "PID [PID]");

  // Replace custom patterns
  for (const pattern of patterns) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "g");
    result = result.replace(regex, "[VAR]");
  }

  return result;
}
