export {};

declare global {
  interface Window {
    beacon: {
      version: string;
      normalizeRepoPath: (input: string) => {
        path?: string;
        error?: string;
      };
    };
  }
}
