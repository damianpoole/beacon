export {};

declare global {
  interface Window {
    beacon: {
      version: string;
    };
  }
}
