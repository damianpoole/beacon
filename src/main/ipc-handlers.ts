import type { IpcMain } from "electron";
import { applyUnifiedDiff } from "./apply-patch.js";
import { logError } from "./logging.js";
import { normalizeRepoPath } from "./repo-path.js";
import type { Storage } from "./storage.js";
import {
  fetchAuthStatus,
  fetchFailedRunLog,
  listPullRequests
} from "./github-service.js";
import type { SuggestionService } from "./types.js";

export type ApplyPatchResult = {
  appliedFiles?: string[];
  errors?: string[];
  error?: string;
};

export const registerIpcHandlers = (
  ipcMain: IpcMain,
  options: {
    storage: Storage;
    suggestionService: SuggestionService;
  }
): void => {
  const { storage, suggestionService } = options;

  ipcMain.handle("auth:status", async () => fetchAuthStatus());

  ipcMain.handle("repo:normalize", async (_event, input: string) =>
    normalizeRepoPath(input)
  );

  ipcMain.handle("repo:list-prs", async (_event, repoPath: string) => {
    const result = await listPullRequests(repoPath);
    if (!result.prs) {
      return result;
    }

    try {
      result.prs.forEach((pr) => {
        storage.upsertPullRequest(repoPath, pr);
      });
    } catch (error) {
      logError("Failed to store pull requests", {
        error: error instanceof Error ? error.message : "Unable to store PRs.",
        repoPath
      });
    }

    return result;
  });

  ipcMain.handle(
    "ci:failed-log",
    async (_event, repoPath: string, prNumber: number) =>
      fetchFailedRunLog(repoPath, prNumber)
  );

  ipcMain.handle(
    "copilot:start",
    async (_event, model: string) => suggestionService.startCopilotSession(model)
  );

  ipcMain.handle("copilot:stop", async () => suggestionService.stopCopilotSession());

  ipcMain.handle(
    "suggestion:generate",
    async (_event, repoPath: string, prNumber: number) =>
      suggestionService.generateSuggestion(repoPath, prNumber)
  );

  ipcMain.handle(
    "suggestion:latest",
    async (_event, repoPath: string, prNumber: number) => {
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
          error instanceof Error ? error.message : "Unable to load suggestion.";
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
    async (_event, repoPath: string, prNumber: number): Promise<ApplyPatchResult> => {
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
          error instanceof Error ? error.message : "Unable to apply suggestion.";
        logError("Failed to apply suggestion", {
          error: details,
          repoPath,
          prNumber
        });
        return { error: `Failed to apply suggestion. (${details})` };
      }
    }
  );
};
