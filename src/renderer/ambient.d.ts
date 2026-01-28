export {};

declare global {
  interface Window {
    beacon: {
      version: string;
      normalizeRepoPath: (input: string) => Promise<{
        path?: string;
        error?: string;
      }>;
      getAuthStatus: () => Promise<{
        authenticated: boolean;
        username?: string;
        message: string;
      }>;
      listPullRequests: (repoPath: string) => Promise<{
        prs?: Array<{
          number: number;
          title: string;
          branch: string;
          status: string;
        }>;
        error?: string;
      }>;
      fetchFailedRunLog: (
        repoPath: string,
        prNumber: number
      ) => Promise<{
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
      }>;
      generateSuggestion: (
        repoPath: string,
        prNumber: number
      ) => Promise<{
        diff?: string;
        summary?: string | null;
        runId?: number | null;
        createdAt?: string;
        error?: string;
      }>;
      getLatestSuggestion: (
        repoPath: string,
        prNumber: number
      ) => Promise<{
        diff?: string;
        summary?: string | null;
        runId?: number | null;
        createdAt?: string;
        error?: string;
      }>;
      applySuggestion: (
        repoPath: string,
        prNumber: number
      ) => Promise<{
        appliedFiles?: string[];
        errors?: string[];
        error?: string;
      }>;
      startCopilotSession: (model: string) => Promise<
        | {
            sessionId: number;
          }
        | {
            error: string;
          }
      >;
      stopCopilotSession: () => Promise<{
        stopped: boolean;
        error?: string;
      }>;
    };
  }
}
