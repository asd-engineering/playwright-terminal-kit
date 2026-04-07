/**
 * Terminal snapshot management for comparison testing.
 * Handles saving, loading, and comparing terminal snapshots.
 *
 * @module testing/snapshot
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import type { TerminalSnapshot } from "../server/tmux-session.js";
import { normalizeTerminalOutput, replaceVariables, stripAnsi } from "../util/ansi.js";
import type { SnapshotConfig } from "../config/schema.js";

/** Default snapshot configuration */
const DEFAULTS: SnapshotConfig = {
  snapshotDir: "__snapshots__",
  stripAnsi: true,
  normalizeWhitespace: true,
  ignorePatterns: [],
  updateSnapshots: false,
};

/**
 * Snapshot comparison result.
 */
export interface SnapshotCompareResult {
  /** Whether the snapshots match */
  matches: boolean;
  /** Expected content (from saved snapshot) */
  expected: string;
  /** Actual content (from current snapshot) */
  actual: string;
  /** Diff between expected and actual (if different) */
  diff?: string;
  /** Snapshot file path */
  filePath: string;
  /** Whether this is a new snapshot */
  isNew: boolean;
}

/**
 * Saved snapshot file format.
 */
interface SnapshotFile {
  version: 1;
  testName: string;
  snapshotName: string;
  content: string;
  rawContent?: string;
  size: { cols: number; rows: number };
  timestamp: number;
  hash: string;
}

/**
 * Generate a hash for content.
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Generate a safe filename from test and snapshot names.
 */
function generateFilename(testName: string, snapshotName?: string): string {
  const base = testName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const suffix = snapshotName
    ? `-${snapshotName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 20)}`
    : "";

  return `${base}${suffix}.snap.json`;
}

/**
 * Create a simple diff between two strings.
 */
function createDiff(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const diff: string[] = [];

  const maxLines = Math.max(expectedLines.length, actualLines.length);

  for (let i = 0; i < maxLines; i++) {
    const expectedLine = expectedLines[i] ?? "";
    const actualLine = actualLines[i] ?? "";

    if (expectedLine === actualLine) {
      diff.push(`  ${expectedLine}`);
    } else {
      if (expectedLine) diff.push(`- ${expectedLine}`);
      if (actualLine) diff.push(`+ ${actualLine}`);
    }
  }

  return diff.join("\n");
}

/**
 * Snapshot manager for terminal output comparison.
 *
 * @example
 * ```typescript
 * const manager = new SnapshotManager({ snapshotDir: './__snapshots__' });
 *
 * // Save a snapshot
 * const snapshot = await tmuxSession.snapshot('my-state');
 * await manager.save('my test', snapshot);
 *
 * // Compare with saved snapshot
 * const result = await manager.compare('my test', snapshot);
 * if (!result.matches) {
 *   console.log(result.diff);
 * }
 * ```
 */
export class SnapshotManager {
  private config: SnapshotConfig;

  constructor(config: Partial<SnapshotConfig> = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Process snapshot content for comparison.
   */
  private processContent(content: string): string {
    let result = content;

    if (this.config.stripAnsi) {
      result = stripAnsi(result);
    }

    if (this.config.normalizeWhitespace) {
      result = normalizeTerminalOutput(result);
    }

    if (this.config.ignorePatterns.length > 0) {
      result = replaceVariables(result, this.config.ignorePatterns);
    }

    return result;
  }

  /**
   * Get the snapshot file path.
   */
  getSnapshotPath(testName: string, snapshotName?: string): string {
    const filename = generateFilename(testName, snapshotName);
    return join(this.config.snapshotDir, filename);
  }

  /**
   * Save a snapshot to disk.
   */
  async save(testName: string, snapshot: TerminalSnapshot): Promise<string> {
    const filePath = this.getSnapshotPath(testName, snapshot.name);
    const content = this.processContent(snapshot.text);

    const snapshotFile: SnapshotFile = {
      version: 1,
      testName,
      snapshotName: snapshot.name || "default",
      content,
      rawContent: this.config.stripAnsi ? undefined : snapshot.raw,
      size: snapshot.size,
      timestamp: snapshot.timestamp,
      hash: hashContent(content),
    };

    // Ensure directory exists
    mkdirSync(dirname(filePath), { recursive: true });

    writeFileSync(filePath, JSON.stringify(snapshotFile, null, 2));

    return filePath;
  }

  /**
   * Load a saved snapshot from disk.
   */
  async load(testName: string, snapshotName?: string): Promise<SnapshotFile | null> {
    const filePath = this.getSnapshotPath(testName, snapshotName);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const data = readFileSync(filePath, "utf-8");
      return JSON.parse(data) as SnapshotFile;
    } catch {
      return null;
    }
  }

  /**
   * Compare a snapshot with the saved version.
   */
  async compare(testName: string, snapshot: TerminalSnapshot): Promise<SnapshotCompareResult> {
    const filePath = this.getSnapshotPath(testName, snapshot.name);
    const actual = this.processContent(snapshot.text);

    const saved = await this.load(testName, snapshot.name);

    // New snapshot
    if (!saved) {
      if (this.config.updateSnapshots) {
        await this.save(testName, snapshot);
        return {
          matches: true,
          expected: actual,
          actual,
          filePath,
          isNew: true,
        };
      }

      return {
        matches: false,
        expected: "",
        actual,
        filePath,
        isNew: true,
        diff: `New snapshot - no saved version exists at ${filePath}`,
      };
    }

    const expected = saved.content;
    const matches = actual === expected;

    if (!matches && this.config.updateSnapshots) {
      await this.save(testName, snapshot);
      return {
        matches: true,
        expected: actual,
        actual,
        filePath,
        isNew: false,
      };
    }

    return {
      matches,
      expected,
      actual,
      filePath,
      isNew: false,
      diff: matches ? undefined : createDiff(expected, actual),
    };
  }

  /**
   * Assert that a snapshot matches the saved version.
   * Throws an error if they don't match.
   */
  async assertMatch(testName: string, snapshot: TerminalSnapshot): Promise<void> {
    const result = await this.compare(testName, snapshot);

    if (!result.matches) {
      const message = result.isNew
        ? `No saved snapshot found. Run with UPDATE_SNAPSHOTS=1 to create one.\nPath: ${result.filePath}`
        : `Snapshot mismatch:\n${result.diff}`;

      throw new Error(message);
    }
  }

  /**
   * Delete a saved snapshot.
   */
  async delete(testName: string, snapshotName?: string): Promise<boolean> {
    const filePath = this.getSnapshotPath(testName, snapshotName);

    if (!existsSync(filePath)) {
      return false;
    }

    const { unlinkSync } = await import("fs");
    unlinkSync(filePath);
    return true;
  }

  /**
   * List all snapshots for a test.
   */
  async list(testName: string): Promise<string[]> {
    const { readdirSync } = await import("fs");
    const prefix = generateFilename(testName, "").replace(".snap.json", "");

    if (!existsSync(this.config.snapshotDir)) {
      return [];
    }

    const files = readdirSync(this.config.snapshotDir);
    return files.filter((f) => f.startsWith(prefix) && f.endsWith(".snap.json"));
  }

  /**
   * Check if update mode is enabled.
   */
  isUpdateMode(): boolean {
    return this.config.updateSnapshots || process.env.UPDATE_SNAPSHOTS === "1";
  }

  /**
   * Get the snapshot directory.
   */
  getSnapshotDir(): string {
    return this.config.snapshotDir;
  }
}

/**
 * Create a snapshot manager with environment-based update mode.
 */
export function createSnapshotManager(config: Partial<SnapshotConfig> = {}): SnapshotManager {
  return new SnapshotManager({
    ...config,
    updateSnapshots: config.updateSnapshots || process.env.UPDATE_SNAPSHOTS === "1",
  });
}
