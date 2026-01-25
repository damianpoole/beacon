import { contextBridge } from "electron";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type NormalizeResult = { path?: string; error?: string };

const normalizeRepoPath = (input: string): NormalizeResult => {
  const trimmed = input.trim();

  if (!trimmed) {
    return { error: "Enter a repository path." };
  }

  const expanded =
    trimmed === "~" || trimmed.startsWith("~/")
      ? join(homedir(), trimmed.slice(2))
      : trimmed;
  const resolved = resolve(expanded);

  if (!existsSync(resolved)) {
    return { error: "Path does not exist." };
  }

  try {
    const stats = statSync(resolved);
    if (!stats.isDirectory()) {
      return { error: "Path is not a directory." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to read path."
    };
  }

  return { path: resolved };
};

contextBridge.exposeInMainWorld("beacon", {
  version: "0.1",
  normalizeRepoPath
});
