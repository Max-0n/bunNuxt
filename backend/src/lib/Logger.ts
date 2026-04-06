import * as process from 'node:process'
import { Logger } from 'tslog'

const DEV_LOG_TEMPLATE = '{{hh}}:{{MM}}:{{ss}}.{{ms}} [{{name}}] {{logLevelName}} '
const PROD_LOG_TEMPLATE = '[{{name}}] {{logLevelName}} '

const loggers = new Map<string, Logger<any>>()

const COMMON_SETTINGS = {
  hideLogPositionForProduction: true,
  prettyLogTemplate: process.env.NODE_ENV === 'development' ? DEV_LOG_TEMPLATE : PROD_LOG_TEMPLATE,
  stylePrettyLogs: process.env.NODE_ENV === 'development',
  prettyInspectOptions: {
    breakLength: Number.POSITIVE_INFINITY,
    compact: true,
  },
}

export function createLogger(name: string): Logger<any> {
  const current = loggers.get(name)
  if (current) return current

  const logger = new Logger({
    ...COMMON_SETTINGS,
    name,
  })

  loggers.set(name, logger)
  return logger
}

export function setMinLevel(minLevel: number, name?: string): void {
  if (name) {
    const logger = loggers.get(name)
    if (logger) logger.settings.minLevel = minLevel

    return
  }

  for (const logger of loggers.values()) {
    logger.settings.minLevel = minLevel
  }
}
