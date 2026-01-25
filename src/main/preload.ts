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

contextBridge.exposeInMainWorld("beacon", {
  version: "0.1",
  normalizeRepoPath: (input: string): Promise<NormalizeResult> =>
    ipcRenderer.invoke("repo:normalize", input),
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke("auth:status"),
  listPullRequests: (repoPath: string): Promise<PullRequestResult> =>
    ipcRenderer.invoke("repo:list-prs", repoPath)
});
