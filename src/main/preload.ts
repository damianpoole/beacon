import { contextBridge, ipcRenderer } from "electron";

type NormalizeResult = { path?: string; error?: string };
type AuthStatus = { authenticated: boolean; username?: string; message: string };
type PullRequest = {
  number: number;
  title: string;
  branch: string;
  status: string;
};
type PullRequestResult = { prs?: PullRequest[]; error?: string };
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

contextBridge.exposeInMainWorld("beacon", {
  version: "0.1",
  normalizeRepoPath: (input: string): Promise<NormalizeResult> =>
    ipcRenderer.invoke("repo:normalize", input),
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke("auth:status"),
  listPullRequests: (repoPath: string): Promise<PullRequestResult> =>
    ipcRenderer.invoke("repo:list-prs", repoPath),
  fetchFailedRunLog: (
    repoPath: string,
    prNumber: number
  ): Promise<FailedLogResult> =>
    ipcRenderer.invoke("ci:failed-log", repoPath, prNumber)
});
