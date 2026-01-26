import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRepoPath } from "../src/main/repo-path.js";

describe("normalizeRepoPath", () => {
  it("rejects empty input", () => {
    expect(normalizeRepoPath(" ")).toEqual({
      error: "Enter a repository path."
    });
  });

  it("rejects missing path", () => {
    expect(normalizeRepoPath("/unlikely/missing/path")).toEqual({
      error: "Path does not exist."
    });
  });

  it("rejects file path", () => {
    const base = mkdtempSync(join(tmpdir(), "beacon-repo-path-"));
    const filePath = join(base, "not-a-dir.txt");
    writeFileSync(filePath, "content", "utf8");
    try {
      expect(normalizeRepoPath(filePath)).toEqual({
        error: "Path is not a directory."
      });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("returns resolved directory path", () => {
    const base = mkdtempSync(join(tmpdir(), "beacon-repo-path-"));
    const repoDir = join(base, "repo");
    mkdirSync(repoDir, { recursive: true });
    try {
      const result = normalizeRepoPath(repoDir);
      expect(result).toEqual({ path: repoDir });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
