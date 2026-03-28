export {};

declare global {
  interface Window {
    electronApp?: {
      platform: string;
      windowControlsRightInset: number;
      getWindowControlsInset?: () => Promise<number>;
    };
  }
}

