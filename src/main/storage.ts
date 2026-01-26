import Database from "better-sqlite3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

type RepoRecord = {
  id: number;
  path: string;
  createdAt: string;
};

type PullRequestRecord = {
  id: number;
  repoId: number;
  number: number;
  title: string;
  branch: string;
  status: string;
  updatedAt: string;
};

type SuggestionRecord = {
  diffId: string;
  diffPath: string;
  summary: string | null;
  runId: number | null;
  createdAt: string;
  diff: string;
};

type StorageOptions = {
  baseDir: string;
  filename?: string;
};

export class Storage {
  private db: Database.Database;
  private diffDir: string;

  constructor(options: StorageOptions) {
    const filename = options.filename ?? "beacon.db";
    const dbPath = join(options.baseDir, filename);
    this.diffDir = join(options.baseDir, "diffs");
    mkdirSync(options.baseDir, { recursive: true });
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(
      "\n" +
        "CREATE TABLE IF NOT EXISTS repos (\n" +
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  path TEXT NOT NULL UNIQUE,\n" +
        "  created_at TEXT NOT NULL\n" +
        ");\n" +
        "CREATE TABLE IF NOT EXISTS pull_requests (\n" +
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  repo_id INTEGER NOT NULL,\n" +
        "  number INTEGER NOT NULL,\n" +
        "  title TEXT NOT NULL,\n" +
        "  branch TEXT NOT NULL,\n" +
        "  status TEXT NOT NULL,\n" +
        "  updated_at TEXT NOT NULL,\n" +
        "  UNIQUE(repo_id, number),\n" +
        "  FOREIGN KEY(repo_id) REFERENCES repos(id) ON DELETE CASCADE\n" +
        ");\n" +
        "CREATE TABLE IF NOT EXISTS runs (\n" +
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  pr_id INTEGER NOT NULL,\n" +
        "  run_id INTEGER NOT NULL,\n" +
        "  check_name TEXT,\n" +
        "  state TEXT,\n" +
        "  log_path TEXT,\n" +
        "  classification_tag TEXT,\n" +
        "  actionable INTEGER,\n" +
        "  reason TEXT,\n" +
        "  updated_at TEXT NOT NULL,\n" +
        "  FOREIGN KEY(pr_id) REFERENCES pull_requests(id) ON DELETE CASCADE\n" +
        ");\n" +
        "CREATE TABLE IF NOT EXISTS suggestions (\n" +
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  pr_id INTEGER NOT NULL,\n" +
        "  run_id INTEGER,\n" +
        "  diff_id TEXT NOT NULL,\n" +
        "  diff_path TEXT NOT NULL,\n" +
        "  summary TEXT,\n" +
        "  created_at TEXT NOT NULL,\n" +
        "  FOREIGN KEY(pr_id) REFERENCES pull_requests(id) ON DELETE CASCADE\n" +
        ");"
    );
  }

  close(): void {
    this.db.close();
  }

  upsertRepo(path: string): RepoRecord {
    const createdAt = new Date().toISOString();
    const insert = this.db.prepare(
      "INSERT INTO repos (path, created_at) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET path = excluded.path"
    );
    insert.run(path, createdAt);
    return this.getRepoByPath(path);
  }

  getRepoByPath(path: string): RepoRecord {
    const stmt = this.db.prepare(
      "SELECT id, path, created_at as createdAt FROM repos WHERE path = ?"
    );
    const row = stmt.get(path) as RepoRecord | undefined;
    if (!row) {
      throw new Error(`Repo not found for path: ${path}`);
    }
    return row;
  }

  listRepos(): RepoRecord[] {
    const stmt = this.db.prepare(
      "SELECT id, path, created_at as createdAt FROM repos ORDER BY created_at DESC"
    );
    return stmt.all() as RepoRecord[];
  }

  deleteRepo(path: string): boolean {
    const stmt = this.db.prepare("DELETE FROM repos WHERE path = ?");
    const result = stmt.run(path);
    return result.changes > 0;
  }

  upsertPullRequest(repoPath: string, data: Omit<PullRequestRecord, "id" | "repoId" | "updatedAt">): PullRequestRecord {
    const repo = this.upsertRepo(repoPath);
    const updatedAt = new Date().toISOString();
    const insert = this.db.prepare(
      "INSERT INTO pull_requests (repo_id, number, title, branch, status, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(repo_id, number) DO UPDATE SET title = excluded.title, branch = excluded.branch, status = excluded.status, updated_at = excluded.updated_at"
    );
    insert.run(repo.id, data.number, data.title, data.branch, data.status, updatedAt);
    const select = this.db.prepare(
      "SELECT id, repo_id as repoId, number, title, branch, status, updated_at as updatedAt FROM pull_requests WHERE repo_id = ? AND number = ?"
    );
    const row = select.get(repo.id, data.number) as PullRequestRecord | undefined;
    if (!row) {
      throw new Error("Pull request upsert failed.");
    }
    return row;
  }

  listPullRequests(repoPath: string): PullRequestRecord[] {
    const repo = this.getRepoByPath(repoPath);
    const stmt = this.db.prepare(
      "SELECT id, repo_id as repoId, number, title, branch, status, updated_at as updatedAt FROM pull_requests WHERE repo_id = ? ORDER BY number DESC"
    );
    return stmt.all(repo.id) as PullRequestRecord[];
  }

  saveSuggestionDiff(prId: number, diff: string, runId?: number, summary?: string): {
    diffId: string;
    diffPath: string;
  } {
    const diffId = randomUUID();
    const diffPath = join(this.diffDir, `${diffId}.diff`);
    mkdirSync(dirname(diffPath), { recursive: true });
    writeFileSync(diffPath, diff, "utf8");
    const createdAt = new Date().toISOString();
    const insert = this.db.prepare(
      "INSERT INTO suggestions (pr_id, run_id, diff_id, diff_path, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    insert.run(prId, runId ?? null, diffId, diffPath, summary ?? null, createdAt);
    return { diffId, diffPath };
  }

  getLatestSuggestion(prId: number): SuggestionRecord | null {
    const stmt = this.db.prepare(
      "SELECT diff_id as diffId, diff_path as diffPath, summary, run_id as runId, created_at as createdAt FROM suggestions WHERE pr_id = ? ORDER BY created_at DESC LIMIT 1"
    );
    const row = stmt.get(prId) as
      | {
          diffId: string;
          diffPath: string;
          summary: string | null;
          runId: number | null;
          createdAt: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    let diff = "";
    try {
      diff = readFileSync(row.diffPath, "utf8");
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unable to read diff.";
      throw new Error(`Failed to read suggestion diff. (${details})`);
    }
    return { ...row, diff };
  }

  getLatestSuggestionForPullRequest(
    repoPath: string,
    prNumber: number
  ): SuggestionRecord | null {
    const repoRow = this.db.prepare("SELECT id FROM repos WHERE path = ?").get(
      repoPath
    ) as { id: number } | undefined;
    if (!repoRow) {
      return null;
    }
    const prRow = this.db
      .prepare("SELECT id FROM pull_requests WHERE repo_id = ? AND number = ?")
      .get(repoRow.id, prNumber) as { id: number } | undefined;
    if (!prRow) {
      return null;
    }
    return this.getLatestSuggestion(prRow.id);
  }
}
