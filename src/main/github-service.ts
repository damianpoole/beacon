import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { classifyFailure } from "./classifier.js";
import { logError } from "./logging.js";

const execFileAsync = promisify(execFile);

export type AuthStatus = {
  authenticated: boolean;
  username?: string;
  message: string;
};

export type PullRequest = {
  number: number;
  title: string;
  branch: string;
  status: string;
};

export type PullRequestResult = { prs?: PullRequest[]; error?: string };

type PrCheck = {
  name: string;
  state: string;
  detailsUrl?: string;
  link?: string;
};

export type FailedLogResult = {
  log?: string;
  runId?: number;
  checkName?: string;
  classification?: {
    tag: "infra" | "code" | "unknown";
    actionable: boolean;
    requiresCopilot: boolean;
    reason: string;
    matched?: string[];
  };
  error?: string;
};

const extractRunId = (url?: string): number | null => {
  if (!url) {
    return null;
  }

  const match = url.match(/\/runs\/(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isFailingCheck = (state: string): boolean => {
  const normalized = state.toUpperCase();
  return ["FAILURE", "FAILED", "ERROR", "CANCELLED", "TIMED_OUT"].includes(
    normalized
  );
};

const validateRepoPath = (repoPath: string): string | null => {
  if (!repoPath) {
    return "Select a repository first.";
  }

  if (!existsSync(repoPath)) {
    return "Repository path no longer exists.";
  }

  try {
    const stats = statSync(repoPath);
    if (!stats.isDirectory()) {
      return "Repository path is not a directory.";
    }
  } catch (error) {
    return error instanceof Error ? error.message : "Unable to read repository path.";
  }

  return null;
};

export const fetchAuthStatus = async (): Promise<AuthStatus> => {
  try {
    const { stdout } = await execFileAsync("gh", [
      "auth",
      "status",
      "-h",
      "github.com"
    ]);
    const match = stdout.match(/Logged in to .* as ([^\s]+)\./i);
    return {
      authenticated: true,
      username: match?.[1],
      message: "Authenticated"
    };
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unable to check auth status.";
    return {
      authenticated: false,
      message: `Run \`gh auth login\` to authenticate. (${details})`
    };
  }
};

export const listPullRequests = async (repoPath: string): Promise<PullRequestResult> => {
  const repoError = validateRepoPath(repoPath);
  if (repoError) {
    return { error: repoError };
  }

  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "list",
        "--author",
        "@me",
        "--state",
        "all",
        "--json",
        "number,title,headRefName,state"
      ],
      { cwd: repoPath }
    );

    const parsed: Array<{
      number: number;
      title: string;
      headRefName: string;
      state: string;
    }> = JSON.parse(stdout || "[]");

    const prs = parsed.map((pr) => ({
      number: pr.number,
      title: pr.title,
      branch: pr.headRefName,
      status: pr.state
    }));

    return { prs };
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unable to fetch pull requests.";
    return {
      error: `Failed to fetch PRs. (${details})`
    };
  }
};

export const fetchFailedRunLog = async (
  repoPath: string,
  prNumber: number
): Promise<FailedLogResult> => {
  const repoError = validateRepoPath(repoPath);
  if (repoError) {
    return { error: repoError };
  }

  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    return { error: "Select a pull request first." };
  }

  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "checks",
        String(prNumber),
        "--json",
        "name,state,detailsUrl,link"
      ],
      { cwd: repoPath }
    );

    const parsed: PrCheck[] = JSON.parse(stdout || "[]");
    const failingCheck = parsed.find((check) => isFailingCheck(check.state));

    if (!failingCheck) {
      return { error: "No failing checks found for this PR." };
    }

    const runId =
      extractRunId(failingCheck.detailsUrl) ?? extractRunId(failingCheck.link);

    if (!runId) {
      return { error: "Unable to determine run ID from PR checks." };
    }

    const { stdout: logOutput } = await execFileAsync(
      "gh",
      ["run", "view", String(runId), "--log-failed"],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
    );

    const trimmedLog = logOutput.trimEnd();
    return {
      log: trimmedLog,
      runId,
      checkName: failingCheck.name,
      classification: classifyFailure(trimmedLog)
    };
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unable to fetch failed run logs.";
    logError("Failed to fetch run logs", { error: details, prNumber });
    return { error: `Failed to fetch run logs. (${details})` };
  }
};
