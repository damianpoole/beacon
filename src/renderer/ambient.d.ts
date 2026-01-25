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
    };
  }
}
