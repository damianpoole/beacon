import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, relative, sep } from "node:path";
import { promisify } from "node:util";
import { logError, logInfo } from "./logging.js";

const execFileAsync = promisify(execFile);
const defaultMaxFileBytes = 200_000;
const blockedBasenames = new Set([
  ".env",
  ".env.development",
  ".env.local",
  ".env.production",
  ".env.test",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "known_hosts"
]);
const blockedExtensions = new Set([".key", ".kdbx", ".p12", ".pem", ".pfx"]);
const blockedSubstrings = ["credential", "password", "private_key", "secret", "token"];

type CopilotSessionHandle = {
  client: CopilotClient;
  session: Awaited<ReturnType<CopilotClient["createSession"]>>;
  stop: () => Promise<void>;
};

const createSystemPrompt = (): string =>
  "You are a fix-only Copilot agent for CI failures. " +
  "Use available tools to fetch CI logs and read local files. " +
  "Only read files within the provided repository root. " +
  "Do not request dotfiles or credential-like files. " +
  "Propose a concise unified diff and short summary. " +
  "When asked for a suggestion, respond with JSON containing summary and diff fields only. " +
  "Do not wrap JSON in code fences. " +
  "Do not commit, push, or modify files directly.";

const assertReadableRepoPath = (
  repoPath: string
): { realPath: string } | { error: string } => {
  if (!repoPath) {
    return { error: "Repository path is required." };
  }

  if (!isAbsolute(repoPath)) {
    return { error: "Repository path must be absolute." };
  }

  if (!existsSync(repoPath)) {
    return { error: "Repository path does not exist." };
  }

  try {
    const stats = statSync(repoPath);
    if (!stats.isDirectory()) {
      return { error: "Repository path is not a directory." };
    }
    return { realPath: realpathSync(repoPath) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to read repository path."
    };
  }
};

const assertReadableFile = (
  filePath: string
): { size: number; realPath: string } | { error: string } => {
  if (!filePath) {
    return { error: "File path is required." };
  }

  if (!isAbsolute(filePath)) {
    return { error: "File path must be absolute." };
  }

  if (!existsSync(filePath)) {
    return { error: "File does not exist." };
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { error: "Path is not a file." };
    }
    return { size: stats.size, realPath: realpathSync(filePath) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to read file."
    };
  }
};

const assertAllowedLocalRead = (
  filePath: string,
  repoPath: string
): { size: number; realPath: string } | { error: string } => {
  const repoInfo = assertReadableRepoPath(repoPath);
  if ("error" in repoInfo) {
    return { error: repoInfo.error };
  }

  const fileInfo = assertReadableFile(filePath);
  if ("error" in fileInfo) {
    return { error: fileInfo.error };
  }

  const relativePath = relative(repoInfo.realPath, fileInfo.realPath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return {
      error:
        "File path must be within the repository root. Out-of-repo reads require explicit user confirmation."
    };
  }

  const segments = relativePath.split(sep).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return { error: "Dotfiles are not allowed." };
  }

  const base = basename(fileInfo.realPath).toLowerCase();
  const extension = extname(base);
  if (blockedBasenames.has(base)) {
    return { error: "Credential files are not allowed." };
  }
  if (blockedExtensions.has(extension)) {
    return { error: "Credential files are not allowed." };
  }
  if (blockedSubstrings.some((value) => base.includes(value))) {
    return { error: "Credential-like files are not allowed." };
  }

  return fileInfo;
};

const fetchCiLogTool = defineTool("fetch_ci_log", {
  description: "Fetch failed CI log output for a GitHub Actions run.",
  parameters: {
    type: "object",
    properties: {
      repoPath: { type: "string", description: "Absolute path to repo" },
      runId: { type: "number", description: "GitHub Actions run ID" }
    },
    required: ["repoPath", "runId"]
  },
  handler: async ({
    repoPath,
    runId
  }: {
    repoPath: string;
    runId: number;
  }): Promise<{ log?: string; error?: string }> => {
    if (!repoPath) {
      return { error: "Repository path is required." };
    }

    if (!Number.isFinite(runId) || runId <= 0) {
      return { error: "Run ID must be a positive number." };
    }

    if (!existsSync(repoPath)) {
      return { error: "Repository path does not exist." };
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
        ["run", "view", String(runId), "--log-failed"],
        { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
      );
      return { log: stdout.trimEnd() };
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unable to fetch log.";
      logError("Copilot tool failed to fetch CI log", { error: details, runId });
      return { error: details };
    }
  }
});

const readLocalFileTool = defineTool("read_local_file", {
  description:
    "Read local file contents for context from within the repository root.",
  parameters: {
    type: "object",
    properties: {
      repoPath: { type: "string", description: "Absolute path to repo" },
      filePath: { type: "string", description: "Absolute file path" },
      maxBytes: {
        type: "number",
        description: "Optional max bytes to read"
      }
    },
    required: ["repoPath", "filePath"]
  },
  handler: async ({
    repoPath,
    filePath,
    maxBytes
  }: {
    repoPath: string;
    filePath: string;
    maxBytes?: number;
  }): Promise<{ content?: string; truncated?: boolean; error?: string }> => {
    const fileInfo = assertAllowedLocalRead(filePath, repoPath);
    if ("error" in fileInfo) {
      return { error: fileInfo.error };
    }

    const limit =
      typeof maxBytes === "number" && Number.isFinite(maxBytes)
        ? Math.max(1, Math.floor(maxBytes))
        : defaultMaxFileBytes;
    const shouldTruncate = fileInfo.size > limit;

    try {
      const content = readFileSync(fileInfo.realPath, "utf8");
      return {
        content: shouldTruncate ? content.slice(0, limit) : content,
        truncated: shouldTruncate
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unable to read file.";
      logError("Copilot tool failed to read file", { error: details, filePath });
      return { error: details };
    }
  }
});

export const createCopilotSession = async (model: string): Promise<CopilotSessionHandle> => {
  const client = new CopilotClient();
  await client.start();
  logInfo("Copilot client started");

  const session = await client.createSession({
    model,
    tools: [fetchCiLogTool, readLocalFileTool],
    systemMessage: { content: createSystemPrompt() }
  });

  return {
    client,
    session,
    stop: async () => {
      try {
        await session.destroy();
      } finally {
        await client.stop();
      }
    }
  };
};
