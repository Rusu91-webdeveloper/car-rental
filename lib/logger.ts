type LogLevel = "info" | "warn" | "error" | "debug"

interface LogData {
  message: string
  level: LogLevel
  timestamp: string
  [key: string]: unknown
}

class Logger {
  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const logData: LogData = {
      message,
      level,
      timestamp: new Date().toISOString(),
      ...data,
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

  info(message: string, data?: Record<string, unknown>) {
    this.log("info", message, data)
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log("warn", message, data)
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log("error", message, data)
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "development") {
      this.log("debug", message, data)
    }
  }
}

export const logger = new Logger()
