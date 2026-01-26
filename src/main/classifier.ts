export type FailureClassification = {
  tag: "infra" | "code" | "unknown";
  actionable: boolean;
  requiresCopilot: boolean;
  reason: string;
  matched?: string[];
};

const infraKeywords = [
  "timeout",
  "timed out",
  "network",
  "connection reset",
  "connection refused",
  "broken pipe",
  "econnreset",
  "econnrefused",
  "dns",
  "rate limit",
  "429",
  "503",
  "service unavailable",
  "runner lost",
  "job cancelled",
  "cancelled",
  "out of memory",
  "oom",
  "no space left",
  "disk",
  "pipeline aborted",
  "signal: killed"
];

const codeKeywords = [
  "typeerror",
  "referenceerror",
  "syntaxerror",
  "assertionerror",
  "lint",
  "eslint",
  "prettier",
  "tsc",
  "typescript",
  "compile error",
  "compilation failed",
  "module not found",
  "cannot find module",
  "failed to compile",
  "test failed",
  "tests failed",
  "expected",
  "snapshot",
  "stack trace",
  "failed",
  "error"
];

const normalize = (value: string): string => value.toLowerCase();

const collectMatches = (log: string, keywords: string[]): string[] => {
  const normalized = normalize(log);
  return keywords.filter((keyword) => normalized.includes(keyword));
};

export const classifyFailure = (log: string): FailureClassification => {
  const trimmed = log.trim();
  if (!trimmed) {
    return {
      tag: "unknown",
      actionable: false,
      requiresCopilot: true,
      reason: "Empty or missing log content."
    };
  }

  const infraMatches = collectMatches(trimmed, infraKeywords);
  const codeMatches = collectMatches(trimmed, codeKeywords);

  if (infraMatches.length === 0 && codeMatches.length === 0) {
    return {
      tag: "unknown",
      actionable: false,
      requiresCopilot: true,
      reason: "No heuristic keywords matched."
    };
  }

  if (infraMatches.length > codeMatches.length) {
    return {
      tag: "infra",
      actionable: false,
      requiresCopilot: false,
      reason: "Infra keywords dominated the log.",
      matched: infraMatches
    };
  }

  if (codeMatches.length > infraMatches.length) {
    return {
      tag: "code",
      actionable: true,
      requiresCopilot: false,
      reason: "Code keywords dominated the log.",
      matched: codeMatches
    };
  }

  return {
    tag: "unknown",
    actionable: false,
    requiresCopilot: true,
    reason: "Mixed infra and code signals; requires model review.",
    matched: [...new Set([...infraMatches, ...codeMatches])]
  };
};
