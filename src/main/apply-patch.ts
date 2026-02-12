import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

type Hunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
};

type FilePatch = {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
};

type ApplyPatchResult = {
  appliedFiles: string[];
  errors: string[];
};

const parsePathLine = (line: string): string => {
  const trimmed = line.slice(4).trim();
  const [pathPart] = trimmed.split("\t");
  return pathPart ?? "";
};

const normalizePatchPath = (path: string): string => {
  if (path.startsWith("a/") || path.startsWith("b/")) {
    return path.slice(2);
  }
  if (path.startsWith("./")) {
    return path.slice(2);
  }
  return path;
};

const parseHunkHeader = (line: string): Omit<Hunk, "lines"> | null => {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return null;
  }
  return {
    oldStart: Number.parseInt(match[1], 10),
    oldCount: match[2] ? Number.parseInt(match[2], 10) : 1,
    newStart: Number.parseInt(match[3], 10),
    newCount: match[4] ? Number.parseInt(match[4], 10) : 1
  };
};

const parseUnifiedDiff = (diff: string): { files: FilePatch[]; errors: string[] } => {
  const lines = diff.split(/\r?\n/);
  const files: FilePatch[] = [];
  const errors: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("--- ")) {
      const oldPath = parsePathLine(line);
      const nextLine = lines[index + 1];
      if (!nextLine || !nextLine.startsWith("+++ ")) {
        errors.push("Invalid diff: missing new file marker.");
        break;
      }
      const newPath = parsePathLine(nextLine);
      index += 2;
      const hunks: Hunk[] = [];

      while (index < lines.length) {
        const hunkLine = lines[index];
        if (hunkLine.startsWith("--- ")) {
          break;
        }
        if (hunkLine.startsWith("@@ ")) {
          const header = parseHunkHeader(hunkLine);
          if (!header) {
            errors.push(`Invalid hunk header: ${hunkLine}`);
            index += 1;
            continue;
          }
          const hunk: Hunk = { ...header, lines: [] };
          index += 1;
          while (index < lines.length) {
            const bodyLine = lines[index];
            if (bodyLine.startsWith("@@ ") || bodyLine.startsWith("--- ")) {
              break;
            }
            if (bodyLine.startsWith("\\")) {
              index += 1;
              continue;
            }
            hunk.lines.push(bodyLine);
            index += 1;
          }
          hunks.push(hunk);
          continue;
        }
        index += 1;
      }

      files.push({ oldPath, newPath, hunks });
      continue;
    }
    index += 1;
  }

  if (files.length === 0 && errors.length === 0) {
    errors.push("No file patches found in diff.");
  }

  return { files, errors };
};

type PendingPatch = {
  applied: string;
  targetPath: string;
  content: string;
};

const applyFilePatch = (repoPath: string, patch: FilePatch): { pending?: PendingPatch; error?: string } => {
  if (patch.oldPath === "/dev/null" || patch.newPath === "/dev/null") {
    return {
      error: `File additions/deletions are not supported (${patch.oldPath} -> ${patch.newPath}).`
    };
  }

  const rawPath = normalizePatchPath(patch.newPath || patch.oldPath);
  const normalizedPath = normalize(rawPath);
  if (!normalizedPath || normalizedPath.startsWith("..") || isAbsolute(normalizedPath)) {
    return { error: `Refusing to apply patch outside repo: ${rawPath}` };
  }

  const targetPath = join(repoPath, normalizedPath);
  if (!existsSync(targetPath)) {
    return { error: `File does not exist for patch: ${normalizedPath}` };
  }

  const original = readFileSync(targetPath, "utf8");
  const hasTrailingNewline = original.endsWith("\n");
  const originalLines = original.split(/\r?\n/);
  const workingLines = [...originalLines];
  let offset = 0;

  for (const hunk of patch.hunks) {
    let lineIndex = hunk.oldStart - 1 + offset;
    if (lineIndex < 0 || lineIndex > workingLines.length) {
      return { error: `Hunk out of range for ${normalizedPath}.` };
    }

    for (const line of hunk.lines) {
      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === " ") {
        if (workingLines[lineIndex] !== content) {
          return { error: `Conflict applying patch to ${normalizedPath}.` };
        }
        lineIndex += 1;
      } else if (prefix === "-") {
        if (workingLines[lineIndex] !== content) {
          return { error: `Conflict applying patch to ${normalizedPath}.` };
        }
        workingLines.splice(lineIndex, 1);
      } else if (prefix === "+") {
        workingLines.splice(lineIndex, 0, content);
        lineIndex += 1;
      } else {
        return { error: `Unexpected diff line in ${normalizedPath}: ${line}` };
      }
    }

    offset += hunk.newCount - hunk.oldCount;
  }

  let nextContent = workingLines.join("\n");
  if (hasTrailingNewline && !nextContent.endsWith("\n")) {
    nextContent += "\n";
  }
  if (!hasTrailingNewline && nextContent.endsWith("\n")) {
    nextContent = nextContent.slice(0, -1);
  }

  return {
    pending: {
      applied: normalizedPath,
      targetPath,
      content: nextContent
    }
  };
};

export const applyUnifiedDiff = (repoPath: string, diff: string): ApplyPatchResult => {
  const { files, errors } = parseUnifiedDiff(diff);
  const resultErrors = [...errors];
  const pendingWrites: PendingPatch[] = [];

  for (const file of files) {
    const result = applyFilePatch(repoPath, file);
    if (result.error) {
      resultErrors.push(result.error);
    } else if (result.pending) {
      pendingWrites.push(result.pending);
    }
  }

  if (resultErrors.length > 0) {
    return { appliedFiles: [], errors: resultErrors };
  }

  for (const pending of pendingWrites) {
    writeFileSync(pending.targetPath, pending.content, "utf8");
  }

  return {
    appliedFiles: pendingWrites.map((pending) => pending.applied),
    errors: []
  };
};
