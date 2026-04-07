/**
 * Unit tests for SnapshotManager
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { SnapshotManager, createSnapshotManager } from "../src/testing/snapshot.js";
import type { TerminalSnapshot } from "../src/server/tmux-session.js";

const TEST_DIR = join(import.meta.dir, "__test_snapshots__");

function makeSnapshot(
  text: string,
  name = "test-snap",
  cols = 80,
  rows = 24
): TerminalSnapshot {
  return {
    text,
    raw: text,
    normalized: text,
    timestamp: Date.now(),
    name,
    sessionName: "test-session",
    size: { cols, rows },
  };
}

describe("SnapshotManager", () => {
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = new SnapshotManager({ snapshotDir: TEST_DIR });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("getSnapshotPath", () => {
    it("returns path in snapshot directory", () => {
      const path = manager.getSnapshotPath("my test");
      expect(path).toContain(TEST_DIR);
      expect(path).toEndWith(".snap.json");
    });

    it("includes snapshot name in path", () => {
      const path = manager.getSnapshotPath("my test", "after-login");
      expect(path).toContain("after-login");
    });

    it("sanitizes special characters", () => {
      const path = manager.getSnapshotPath("test with spaces & chars!");
      expect(path).not.toContain(" ");
      expect(path).not.toContain("&");
      expect(path).not.toContain("!");
    });
  });

  describe("save", () => {
    it("saves snapshot to disk", async () => {
      const snap = makeSnapshot("hello world");
      const filePath = await manager.save("save-test", snap);

      expect(existsSync(filePath)).toBe(true);
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(data.version).toBe(1);
      expect(data.testName).toBe("save-test");
      expect(data.content).toContain("hello world");
      expect(data.hash).toBeTruthy();
    });

    it("creates directory if it doesn't exist", async () => {
      const snap = makeSnapshot("data");
      await manager.save("dir-test", snap);
      expect(existsSync(TEST_DIR)).toBe(true);
    });

    it("strips ANSI by default", async () => {
      const snap = makeSnapshot("\x1b[32mgreen text\x1b[0m");
      const filePath = await manager.save("ansi-test", snap);
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(data.content).toBe("green text");
      expect(data.rawContent).toBeUndefined();
    });
  });

  describe("load", () => {
    it("loads saved snapshot", async () => {
      const snap = makeSnapshot("load test content", "load-snap");
      await manager.save("load-test", snap);

      const loaded = await manager.load("load-test", "load-snap");
      expect(loaded).not.toBeNull();
      expect(loaded!.testName).toBe("load-test");
      expect(loaded!.content).toContain("load test content");
    });

    it("returns null for non-existent snapshot", async () => {
      const loaded = await manager.load("nonexistent");
      expect(loaded).toBeNull();
    });
  });

  describe("compare", () => {
    it("matches identical snapshots", async () => {
      const snap = makeSnapshot("identical content", "cmp");
      await manager.save("compare-test", snap);

      const result = await manager.compare("compare-test", snap);
      expect(result.matches).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.diff).toBeUndefined();
    });

    it("detects differences", async () => {
      const snap1 = makeSnapshot("original content", "cmp");
      await manager.save("diff-test", snap1);

      const snap2 = makeSnapshot("changed content", "cmp");
      const result = await manager.compare("diff-test", snap2);
      expect(result.matches).toBe(false);
      expect(result.diff).toBeTruthy();
      expect(result.diff).toContain("original");
      expect(result.diff).toContain("changed");
    });

    it("reports new snapshot when no saved version exists", async () => {
      const snap = makeSnapshot("new content", "new-snap");
      const result = await manager.compare("new-test", snap);
      expect(result.matches).toBe(false);
      expect(result.isNew).toBe(true);
    });

    it("auto-saves in update mode", async () => {
      const updateManager = new SnapshotManager({
        snapshotDir: TEST_DIR,
        updateSnapshots: true,
      });

      const snap = makeSnapshot("auto-saved", "auto");
      const result = await updateManager.compare("update-test", snap);
      expect(result.matches).toBe(true);
      expect(result.isNew).toBe(true);

      // Verify file was created
      const loaded = await updateManager.load("update-test", "auto");
      expect(loaded).not.toBeNull();
    });

    it("auto-updates mismatched snapshots in update mode", async () => {
      const updateManager = new SnapshotManager({
        snapshotDir: TEST_DIR,
        updateSnapshots: true,
      });

      const snap1 = makeSnapshot("old content", "upd");
      await updateManager.save("update-mismatch", snap1);

      const snap2 = makeSnapshot("new content", "upd");
      const result = await updateManager.compare("update-mismatch", snap2);
      expect(result.matches).toBe(true);

      const loaded = await updateManager.load("update-mismatch", "upd");
      expect(loaded!.content).toContain("new content");
    });
  });

  describe("assertMatch", () => {
    it("passes for matching snapshots", async () => {
      const snap = makeSnapshot("assert content", "assert");
      await manager.save("assert-test", snap);

      await expect(manager.assertMatch("assert-test", snap)).resolves.toBeUndefined();
    });

    it("throws for mismatched snapshots", async () => {
      const snap1 = makeSnapshot("original", "assert");
      await manager.save("assert-fail", snap1);

      const snap2 = makeSnapshot("different", "assert");
      await expect(manager.assertMatch("assert-fail", snap2)).rejects.toThrow("Snapshot mismatch");
    });

    it("throws for new snapshots without update mode", async () => {
      const snap = makeSnapshot("new", "assert");
      await expect(manager.assertMatch("no-saved", snap)).rejects.toThrow("No saved snapshot found");
    });
  });

  describe("delete", () => {
    it("deletes existing snapshot", async () => {
      const snap = makeSnapshot("to delete", "del");
      const filePath = await manager.save("delete-test", snap);
      expect(existsSync(filePath)).toBe(true);

      const deleted = await manager.delete("delete-test", "del");
      expect(deleted).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it("returns false for non-existent snapshot", async () => {
      const deleted = await manager.delete("nonexistent", "nope");
      expect(deleted).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array for no snapshots", async () => {
      const files = await manager.list("empty-test");
      expect(files).toEqual([]);
    });

    it("lists snapshots for a test", async () => {
      await manager.save("list-test", makeSnapshot("snap1", "first"));
      await manager.save("list-test", makeSnapshot("snap2", "second"));

      const files = await manager.list("list-test");
      expect(files.length).toBe(2);
      expect(files.every((f) => f.endsWith(".snap.json"))).toBe(true);
    });
  });

  describe("isUpdateMode", () => {
    it("returns false by default", () => {
      expect(manager.isUpdateMode()).toBe(false);
    });

    it("returns true when configured", () => {
      const updateManager = new SnapshotManager({ updateSnapshots: true });
      expect(updateManager.isUpdateMode()).toBe(true);
    });
  });

  describe("getSnapshotDir", () => {
    it("returns configured directory", () => {
      expect(manager.getSnapshotDir()).toBe(TEST_DIR);
    });
  });
});

describe("createSnapshotManager", () => {
  it("creates manager with defaults", () => {
    const manager = createSnapshotManager();
    expect(manager.getSnapshotDir()).toBe("__snapshots__");
  });

  it("respects config overrides", () => {
    const manager = createSnapshotManager({ snapshotDir: "/custom/dir" });
    expect(manager.getSnapshotDir()).toBe("/custom/dir");
  });
});
