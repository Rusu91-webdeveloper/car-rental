type LogLevel = "info" | "warn" | "error" | "debug"

interface LogData {
  message: string
  level: LogLevel
  timestamp: string
  [key: string]: unknown
}

const SENSITIVE_KEY = /(email|phone|name|address|licen[cs]e|document|blob|path|token|secret|credential|password|authorization|cookie|recipient|error)/i

function sanitize(data: unknown): Record<string, unknown> {
  if (data instanceof Error) return { error: "[REDACTED]", errorName: data.name }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : value instanceof Error
          ? { name: value.name }
          : value,
    ]),
  )
}

class Logger {
  private log(level: LogLevel, message: string, data?: unknown) {
    const logData: LogData = {
      message,
      level,
      timestamp: new Date().toISOString(),
      ...sanitize(data),
    }

    // In production, you would send this to a logging service
    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify(logData))
    } else {
      const emoji = {
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
        debug: "🐛",
      }[level]

      console.log(`${emoji} [${level.toUpperCase()}]`, message, data || "")
    }
  }

  info(message: string, data?: unknown) {
    this.log("info", message, data)
  }

  warn(message: string, data?: unknown) {
    this.log("warn", message, data)
  }

  error(message: string, data?: unknown) {
    this.log("error", message, data)
  }

  debug(message: string, data?: unknown) {
    if (process.env.NODE_ENV === "development") {
      this.log("debug", message, data)
    }
  }
}

export const logger = new Logger()
