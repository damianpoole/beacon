export {};

declare global {
  interface Window {
    beacon: {
      version: string;
      normalizeRepoPath: (input: string) => {
        path?: string;
        error?: string;
      };
      getAuthStatus: () => Promise<{
        authenticated: boolean;
        username?: string;
        message: string;
      }>;
    };
  }
}
