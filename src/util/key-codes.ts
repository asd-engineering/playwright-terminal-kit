/**
 * Key code utilities for terminal input simulation.
 * Converts human-readable key names to byte sequences.
 *
 * @module util/key-codes
 */

/**
 * Special key name to byte sequence mapping.
 * Includes control keys, arrow keys, function keys, and navigation keys.
 */
const SPECIAL_KEYS: Record<string, readonly number[]> = {
  // Common control keys
  TAB: [9],
  ENTER: [13],
  RETURN: [13],
  ESC: [27],
  ESCAPE: [27],
  BACKSPACE: [127],
  DELETE: [127],
  SPACE: [32],

  // Arrow keys (ANSI escape sequences)
  UP: [27, 91, 65],
  DOWN: [27, 91, 66],
  RIGHT: [27, 91, 67],
  LEFT: [27, 91, 68],
  UPARROW: [27, 91, 65],
  DOWNARROW: [27, 91, 66],
  RIGHTARROW: [27, 91, 67],
  LEFTARROW: [27, 91, 68],

  // Function keys (F1-F12)
  F1: [27, 79, 80],
  F2: [27, 79, 81],
  F3: [27, 79, 82],
  F4: [27, 79, 83],
  F5: [27, 91, 49, 53, 126],
  F6: [27, 91, 49, 55, 126],
  F7: [27, 91, 49, 56, 126],
  F8: [27, 91, 49, 57, 126],
  F9: [27, 91, 50, 48, 126],
  F10: [27, 91, 50, 49, 126],
  F11: [27, 91, 50, 51, 126],
  F12: [27, 91, 50, 52, 126],

  // Navigation keys
  HOME: [27, 91, 72],
  END: [27, 91, 70],
  PAGEUP: [27, 91, 53, 126],
  PAGEDOWN: [27, 91, 54, 126],
  PGUP: [27, 91, 53, 126],
  PGDN: [27, 91, 54, 126],
  INSERT: [27, 91, 50, 126],
} as const;

/**
 * Convert a human-readable key name or string to a byte sequence.
 *
 * Supports:
 * - Plain text: "hello" -> [104, 101, 108, 108, 111]
 * - Special keys: "Tab", "Enter", "Escape", "Space"
 * - Ctrl combinations: "Ctrl+C", "Ctrl+Q" (case-insensitive)
 * - Arrow keys: "Up", "Down", "Left", "Right"
 * - Function keys: "F1" through "F12"
 * - Navigation: "Home", "End", "PageUp", "PageDown"
 *
 * @param key - Key name like "Tab", "Ctrl+Q", "Enter", or plain text
 * @returns Byte sequence for the key
 *
 * @example
 * ```typescript
 * keyToBytes('Tab')      // [9]
 * keyToBytes('Ctrl+C')   // [3]
 * keyToBytes('Enter')    // [13]
 * keyToBytes('hello')    // [104, 101, 108, 108, 111]
 * keyToBytes('Up')       // [27, 91, 65]
 * ```
 */
export function keyToBytes(key: string): number[] {
  const str = String(key);

  // Handle Ctrl+Letter combinations (case-insensitive)
  const ctrlMatch = str.match(/^Ctrl\+([A-Za-z])$/i);
  if (ctrlMatch) {
    const letter = ctrlMatch[1]!.toUpperCase();
    const pos = letter.charCodeAt(0) - 64; // A=1, B=2, ..., Z=26
    return [pos];
  }

  // Handle special named keys (case-insensitive)
  const upper = str.toUpperCase();
  const specialBytes = SPECIAL_KEYS[upper];
  if (specialBytes) {
    return [...specialBytes];
  }

  // Otherwise treat as plain text string - convert each character to its byte value
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  return bytes;
}

/**
 * Convert multiple key names to a combined byte sequence.
 *
 * @param keys - Array of key names or strings
 * @returns Combined byte sequence
 *
 * @example
 * ```typescript
 * keysToBytes(['hello', 'Enter'])  // [104, 101, 108, 108, 111, 13]
 * keysToBytes(['Ctrl+A', 'Tab'])   // [1, 9]
 * ```
 */
export function keysToBytes(keys: string[]): number[] {
  const bytes: number[] = [];
  for (const key of keys) {
    bytes.push(...keyToBytes(key));
  }
  return bytes;
}

/**
 * Convert bytes to a Buffer for writing to streams.
 *
 * @param bytes - Byte array
 * @returns Buffer containing the bytes
 */
export function bytesToBuffer(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

/**
 * Get the byte sequence for a key as a Buffer.
 *
 * @param key - Key name or string
 * @returns Buffer containing the key bytes
 */
export function keyToBuffer(key: string): Buffer {
  return bytesToBuffer(keyToBytes(key));
}

/**
 * Get all supported special key names.
 *
 * @returns Array of supported special key names
 */
export function getSupportedKeys(): string[] {
  return Object.keys(SPECIAL_KEYS);
}

/**
 * Check if a key name is a supported special key.
 *
 * @param key - Key name to check
 * @returns True if the key is a supported special key
 */
export function isSpecialKey(key: string): boolean {
  return key.toUpperCase() in SPECIAL_KEYS;
}

/**
 * Check if a string looks like a Ctrl combination.
 *
 * @param key - Key name to check
 * @returns True if the key is a Ctrl combination
 */
export function isCtrlKey(key: string): boolean {
  return /^Ctrl\+[A-Za-z]$/i.test(key);
}
