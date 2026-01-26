export type PollingHandler = () => Promise<void> | void;

export type PollingController = {
  start: (intervalMs: number) => void;
  stop: () => void;
  trigger: () => Promise<void>;
  setHandler: (handler: PollingHandler) => void;
};

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
    if (intervalId) {
      clearInterval(intervalId);
    }
    void trigger();
    intervalId = setInterval(() => {
      void trigger();
    }, intervalMs);
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
