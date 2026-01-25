import { contextBridge, ipcRenderer } from "electron";

type NormalizeResult = { path?: string; error?: string };
type AuthStatus = { authenticated: boolean; username?: string; message: string };

contextBridge.exposeInMainWorld("beacon", {
  version: "0.1",
  normalizeRepoPath: (input: string): Promise<NormalizeResult> =>
    ipcRenderer.invoke("repo:normalize", input),
  getAuthStatus: (): Promise<AuthStatus> => ipcRenderer.invoke("auth:status")
});
