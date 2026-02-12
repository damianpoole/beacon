export type PollingHandler = () => Promise<void> | void;

export type PollingController = {
  start: (intervalMs: number) => void;
  stop: () => void;
  trigger: () => Promise<void>;
  setHandler: (handler: PollingHandler) => void;
};

const MIN_INTERVAL_MS = 1000;

export const createPollingController = (handler: PollingHandler): PollingController => {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let onTick = handler;

  const trigger = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      await onTick();
    } finally {
      inFlight = false;
    }
  };

  const start = (intervalMs: number): void => {
    if (!Number.isFinite(intervalMs)) {
      return;
    }
    const nextInterval = Math.max(MIN_INTERVAL_MS, intervalMs);
    if (intervalId) {
      clearInterval(intervalId);
    }
    void trigger();
    intervalId = setInterval(() => {
      void trigger();
    }, nextInterval);
  };

  const stop = (): void => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    intervalId = null;
    inFlight = false;
  };

  const setHandler = (nextHandler: PollingHandler): void => {
    onTick = nextHandler;
  };

  return {
    start,
    stop,
    trigger,
    setHandler
  };
};
