import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/main/storage";

const createStorage = () => {
  const baseDir = mkdtempSync(join(tmpdir(), "beacon-storage-"));
  return { storage: new Storage({ baseDir }), baseDir };
};

describe("storage", () => {
  it("creates and lists repos", () => {
    const { storage } = createStorage();
    storage.upsertRepo("/tmp/alpha");
    storage.upsertRepo("/tmp/bravo");
    const repos = storage.listRepos();
    const paths = repos.map((repo) => repo.path).sort();
    expect(paths).toEqual(["/tmp/alpha", "/tmp/bravo"]);
    storage.close();
  });

  it("upserts pull requests by repo", () => {
    const { storage } = createStorage();
    const pr = storage.upsertPullRequest("/tmp/charlie", {
      number: 42,
      title: "Fix build",
      branch: "fix/build",
      status: "OPEN"
    });
    expect(pr.repoId).toBeGreaterThan(0);
    const list = storage.listPullRequests("/tmp/charlie");
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(42);
    storage.close();
  });

  it("stores diff content on disk and in db", () => {
    const { storage, baseDir } = createStorage();
    const pr = storage.upsertPullRequest("/tmp/delta", {
      number: 9,
      title: "Add logs",
      branch: "feat/logs",
      status: "OPEN"
    });
    const result = storage.saveSuggestionDiff(pr.id, "diff --git a/a b/b\n");
    const saved = readFileSync(result.diffPath, "utf8");
    expect(saved).toContain("diff --git");
    expect(result.diffPath.startsWith(baseDir)).toBe(true);
    storage.close();
  });

  it("loads latest suggestion diff for a PR", () => {
    const { storage } = createStorage();
    const pr = storage.upsertPullRequest("/tmp/echo", {
      number: 77,
      title: "Refine docs",
      branch: "docs/refine",
      status: "OPEN"
    });
    storage.saveSuggestionDiff(pr.id, "diff --git a/x b/y\n", 123, "Refine docs");
    const latest = storage.getLatestSuggestion(pr.id);
    expect(latest).not.toBeNull();
    expect(latest?.diff).toContain("diff --git");
    expect(latest?.runId).toBe(123);
    expect(latest?.summary).toBe("Refine docs");
    storage.close();
  });
});
