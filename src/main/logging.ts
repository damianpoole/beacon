type LogContext = Record<string, unknown>;

const formatContext = (context?: LogContext): string => {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(context)}`;
};

export const logInfo = (message: string, context?: LogContext): void => {
  console.log(`[main] ${message}${formatContext(context)}`);
};

export const logError = (message: string, context?: LogContext): void => {
  console.error(`[main] ${message}${formatContext(context)}`);
};
