import { BrowserWindow, app, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { logError, logInfo } from "./logging.js";
import { applyUnifiedDiff } from "./apply-patch.js";
import { Storage } from "./storage.js";
import { classifyFailure } from "./classifier.js";
import { normalizeRepoPath } from "./repo-path.js";

const execFileAsync = promisify(execFile);

type AuthStatus = {
  authenticated: boolean;
  username?: string;
  message: string;
};

type NormalizeResult = { path?: string; error?: string };
type PullRequest = {
  number: number;
  title: string;
  branch: string;
  status: string;
};
type PullRequestResult = { prs?: PullRequest[]; error?: string };
type PrCheck = {
  name: string;
  state: string;
  detailsUrl?: string;
  link?: string;
};
type FailedLogResult = {
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
type SuggestionResult = {
  diff?: string;
  summary?: string | null;
  runId?: number | null;
  createdAt?: string;
  error?: string;
};
type ApplyPatchResult = {
  appliedFiles?: string[];
  errors?: string[];
  error?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

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

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#efe9e1",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
};

const main = async (): Promise<void> => {
  logInfo("Main process starting");

  try {
    await app.whenReady();
    logInfo("Electron app ready");

    const storage = new Storage({ baseDir: app.getPath("userData") });

    app.on("will-quit", () => {
      storage.close();
      logInfo("App will quit");
    });

    ipcMain.handle("auth:status", async (): Promise<AuthStatus> => {
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
          error instanceof Error
            ? error.message
            : "Unable to check auth status.";
        return {
          authenticated: false,
          message: `Run \`gh auth login\` to authenticate. (${details})`
        };
      }
    });

    ipcMain.handle(
      "repo:normalize",
      async (_event, input: string): Promise<NormalizeResult> =>
        normalizeRepoPath(input)
    );

    ipcMain.handle(
      "repo:list-prs",
      async (_event, repoPath: string): Promise<PullRequestResult> => {
        if (!repoPath) {
          return { error: "Select a repository first." };
        }

        if (!existsSync(repoPath)) {
          return { error: "Repository path no longer exists." };
        }

        try {
          const stats = statSync(repoPath);
          if (!stats.isDirectory()) {
            return { error: "Repository path is not a directory." };
          }
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Unable to read repository path."
          };
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
            error instanceof Error
              ? error.message
              : "Unable to fetch pull requests.";
          return {
            error: `Failed to fetch PRs. (${details})`
          };
        }
      }
    );

    ipcMain.handle(
      "ci:failed-log",
      async (
        _event,
        repoPath: string,
        prNumber: number
      ): Promise<FailedLogResult> => {
        if (!repoPath) {
          return { error: "Select a repository first." };
        }

        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return { error: "Select a pull request first." };
        }

        if (!existsSync(repoPath)) {
          return { error: "Repository path no longer exists." };
        }

        try {
          const stats = statSync(repoPath);
          if (!stats.isDirectory()) {
            return { error: "Repository path is not a directory." };
          }
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : "Unable to read repository path."
          };
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
            extractRunId(failingCheck.detailsUrl) ??
            extractRunId(failingCheck.link);

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
            error instanceof Error
              ? error.message
              : "Unable to fetch failed run logs.";
          logError("Failed to fetch run logs", { error: details, prNumber });
          return { error: `Failed to fetch run logs. (${details})` };
        }
      }
    );

    ipcMain.handle(
      "suggestion:latest",
      async (
        _event,
        repoPath: string,
        prNumber: number
      ): Promise<SuggestionResult> => {
        if (!repoPath) {
          return { error: "Select a repository first." };
        }

        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return { error: "Select a pull request first." };
        }

        try {
          const suggestion = storage.getLatestSuggestionForPullRequest(
            repoPath,
            prNumber
          );
          if (!suggestion) {
            return { error: "No suggestion available yet." };
          }
          return {
            diff: suggestion.diff,
            summary: suggestion.summary,
            runId: suggestion.runId,
            createdAt: suggestion.createdAt
          };
        } catch (error) {
          const details =
            error instanceof Error
              ? error.message
              : "Unable to load suggestion.";
          logError("Failed to load suggestion", {
            error: details,
            repoPath,
            prNumber
          });
          return { error: `Failed to load suggestion. (${details})` };
        }
      }
    );

    ipcMain.handle(
      "suggestion:apply",
      async (
        _event,
        repoPath: string,
        prNumber: number
      ): Promise<ApplyPatchResult> => {
        if (!repoPath) {
          return { error: "Select a repository first." };
        }

        if (!Number.isFinite(prNumber) || prNumber <= 0) {
          return { error: "Select a pull request first." };
        }

        try {
          const suggestion = storage.getLatestSuggestionForPullRequest(
            repoPath,
            prNumber
          );
          if (!suggestion) {
            return { error: "No suggestion available yet." };
          }

          const result = applyUnifiedDiff(repoPath, suggestion.diff);
          if (result.errors.length > 0) {
            return { errors: result.errors };
          }

          return { appliedFiles: result.appliedFiles };
        } catch (error) {
          const details =
            error instanceof Error
              ? error.message
              : "Unable to apply suggestion.";
          logError("Failed to apply suggestion", {
            error: details,
            repoPath,
            prNumber
          });
          return { error: `Failed to apply suggestion. (${details})` };
        }
      }
    );

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });

    app.on("window-all-closed", () => {
      logInfo("All windows closed");
      app.quit();
    });
  } catch (error) {
    logError("Main process failed to start", {
      error: error instanceof Error ? error.message : String(error)
    });
    app.exit(1);
  }
};

void main();
