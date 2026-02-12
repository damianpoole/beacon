import { createCopilotSession } from "./copilot.js";
import { classifyFailure } from "./classifier.js";
import type { Storage } from "./storage.js";
import { logError, logInfo } from "./logging.js";
import { fetchFailedRunLog } from "./github-service.js";

export type SuggestionResult = {
  diff?: string;
  summary?: string | null;
  runId?: number | null;
  createdAt?: string;
  error?: string;
};

type CopilotSessionHandle = Awaited<ReturnType<typeof createCopilotSession>>;

const defaultCopilotModel = "gpt-5";

const stripJsonFence = (content: string): string => {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : content.trim();
};

const redactLog = (log: string): string => {
  let redacted = log;
  redacted = redacted.replace(
    /\b(token|secret|password|passphrase|api[_-]?key|access[_-]?key|private[_-]?key)\b\s*[:=]\s*([^\s'\"]+)/gi,
    "$1=[REDACTED]"
  );
  redacted = redacted.replace(
    /(Authorization:\s*Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
    "$1[REDACTED]"
  );
  redacted = redacted.replace(/\bghp_[A-Za-z0-9]{30,}\b/g, "ghp_[REDACTED]");
  redacted = redacted.replace(
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    "github_pat_[REDACTED]"
  );
  return redacted;
};

const buildLogExcerpt = (
  log: string,
  maxChars = 12_000
): { text: string; truncated: boolean } => {
  const trimmed = log.trimEnd();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false };
  }

  const dividerPlaceholder = "\n... [snipped log output] ...\n";
  const available = Math.max(0, maxChars - dividerPlaceholder.length);
  if (available <= 0) {
    return { text: trimmed.slice(0, maxChars), truncated: true };
  }

  const minChunk = Math.min(2_000, Math.floor(available / 2));
  let headLength = Math.floor(available * 0.6);
  if (headLength < minChunk) {
    headLength = minChunk;
  }
  let tailLength = available - headLength;
  if (tailLength < minChunk) {
    tailLength = minChunk;
    headLength = available - tailLength;
  }

  const omitted = trimmed.length - headLength - tailLength;
  const divider = `\n... [snipped ${omitted} chars] ...\n`;
  return {
    text: `${trimmed.slice(0, headLength)}${divider}${trimmed.slice(-tailLength)}`,
    truncated: true
  };
};

const parseSuggestionPayload = (
  content: string
): { diff: string; summary: string | null } | { error: string } => {
  const cleaned = stripJsonFence(content);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: "Copilot response did not include JSON payload." };
  }

  let parsed: { diff?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      diff?: unknown;
      summary?: unknown;
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Copilot response JSON parse failed. (${error.message})`
          : "Copilot response JSON parse failed."
    };
  }

  const diff = typeof parsed.diff === "string" ? parsed.diff.trim() : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  if (!diff) {
    return { error: "Copilot response did not include a diff." };
  }

  return { diff, summary: summary.length > 0 ? summary : null };
};

const buildSuggestionPrompt = (params: {
  repoPath: string;
  prNumber: number;
  runId: number;
  log: string;
}): string => {
  const redactedLog = redactLog(params.log);
  const { text: logExcerpt, truncated } = buildLogExcerpt(redactedLog);
  return [
    "You are generating a fix suggestion for a CI failure.",
    "Return JSON only in this shape:",
    '{"summary":"short summary","diff":"unified diff"}',
    "The diff must be a unified diff with ---/+++ headers and no code fences.",
    "If no fix is possible, return a summary explaining why and an empty diff string.",
    "Context:",
    `Repo path: ${params.repoPath}`,
    `PR number: ${params.prNumber}`,
    `Run ID: ${params.runId}`,
    "Failed log (redacted):",
    "Sensitive tokens have been redacted where detected.",
    truncated
      ? "Note: log output truncated; showing head and tail only."
      : "Note: full log output included.",
    logExcerpt
  ].join("\n");
};

export const createSuggestionService = (options: { storage: Storage }) => {
  const { storage } = options;
  let copilotSession: CopilotSessionHandle | null = null;
  let copilotSessionId = 0;

  const resolveCopilotSession = async (): Promise<
    | { session: CopilotSessionHandle; temporary: boolean }
    | { error: string }
  > => {
    if (copilotSession) {
      return { session: copilotSession, temporary: false };
    }

    try {
      const session = await createCopilotSession(defaultCopilotModel);
      logInfo("Copilot session started for suggestion generation", {
        model: defaultCopilotModel
      });
      return { session, temporary: true };
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unable to start Copilot session.";
      logError("Copilot session start failed", { error: details });
      return { error: details };
    }
  };

  const generateSuggestion = async (
    repoPath: string,
    prNumber: number
  ): Promise<SuggestionResult> => {
    const failedLog = await fetchFailedRunLog(repoPath, prNumber);
    if (failedLog.error) {
      return { error: failedLog.error };
    }

    const logText = failedLog.log ?? "";
    if (!logText.trim()) {
      return { error: "Failed log output was empty." };
    }

    const classification = failedLog.classification ?? classifyFailure(logText);
    if (classification.tag !== "code") {
      return {
        error: `Suggestion generation skipped. ${classification.reason}`
      };
    }

    if (!failedLog.runId) {
      return { error: "Failed to determine run ID for suggestion." };
    }

    const sessionResult = await resolveCopilotSession();
    if ("error" in sessionResult) {
      return { error: sessionResult.error };
    }

    const { session, temporary } = sessionResult;
    try {
      const prompt = buildSuggestionPrompt({
        repoPath,
        prNumber,
        runId: failedLog.runId,
        log: logText
      });
      const response = await session.session.sendAndWait({ prompt }, 120_000);
      const content = response?.data?.content;
      if (!content) {
        return { error: "Copilot did not return a suggestion." };
      }

      const parsed = parseSuggestionPayload(content);
      if ("error" in parsed) {
        return { error: parsed.error };
      }

      const saved = storage.saveSuggestionForPullRequest(
        repoPath,
        prNumber,
        parsed.diff,
        failedLog.runId,
        parsed.summary ?? undefined
      );

      return {
        diff: saved.diff,
        summary: saved.summary,
        runId: saved.runId,
        createdAt: saved.createdAt
      };
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unable to generate suggestion.";
      logError("Failed to generate suggestion", {
        error: details,
        repoPath,
        prNumber
      });
      return { error: `Failed to generate suggestion. (${details})` };
    } finally {
      if (temporary) {
        await session.stop().catch((error) => {
          logError("Failed to stop temporary Copilot session", {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }
    }
  };

  const startCopilotSession = async (
    model: string
  ): Promise<{ sessionId: number } | { error: string }> => {
    try {
      if (copilotSession) {
        await copilotSession.stop();
        copilotSession = null;
      }

      const session = await createCopilotSession(model);
      copilotSession = session;
      copilotSessionId += 1;
      logInfo("Copilot session started", { sessionId: copilotSessionId });
      return { sessionId: copilotSessionId };
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unable to start Copilot session.";
      logError("Copilot session start failed", { error: details });
      return { error: details };
    }
  };

  const stopCopilotSession = async (): Promise<{ stopped: boolean; error?: string }> => {
    if (!copilotSession) {
      return { stopped: true };
    }

    try {
      await copilotSession.stop();
      copilotSession = null;
      logInfo("Copilot session stopped", { sessionId: copilotSessionId });
      return { stopped: true };
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unable to stop Copilot session.";
      logError("Copilot session stop failed", { error: details });
      return { stopped: false, error: details };
    }
  };

  const stopOnQuit = (): void => {
    if (!copilotSession) {
      return;
    }

    void copilotSession
      .stop()
      .catch((error) => {
        logError("Copilot session stop failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        copilotSession = null;
      });
  };

  return {
    generateSuggestion,
    startCopilotSession,
    stopCopilotSession,
    stopOnQuit
  };
};
