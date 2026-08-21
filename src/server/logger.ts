// Minimal dependency-free logger. Wraps the console so server output is
// structured (level, timestamp, message, optional context) instead of ad-hoc
// strings, which keeps logs greppable and machine-readable.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message,
  };
  if (context && Object.keys(context).length > 0) entry.context = context;
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    write("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    write("error", message, context);
  },
};
