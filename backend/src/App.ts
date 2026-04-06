import './extension'
import { cors } from '@elysiajs/cors'
import staticPlugin from '@elysiajs/static'
import { PathlyConfig } from '@pathly-protocol/config'
import { EnvName } from '@shared-protocol/config'
import PathlyConfigWrapper from '@src/lib/configWrapper'
import { ElysiaMetrics } from '@src/lib/ElysiaMetrics'
import Elysia from 'elysia'
import { BaseApp } from './BaseApp'
import { Config } from './Config'
import AdminHttp from './core/adminHttp'
import ClientHttp from './core/http'
import { LogicGame } from './core/logicGame'
import { RoundTimers } from './core/roundTimers'
import { WalletTimers } from './core/walletTimers'
import ClientWs from './core/ws'
import { Db } from './Db'
import PgDb from './db/pgDb'
import { Metric } from './Metric'
import TelegramBot from './tg/TelegramBot'
import { telegramBotWebhook } from './tg/webhook'
import { Clock, createClock } from './utils'

const createPathlyConfig = (appConfig: Config): PathlyConfig => {
  const map: Record<string, EnvName> = {
    HamsterShave_Local: 'local',
    HamsterShave_Stage: 'stage',
    HamsterShave_Prod: 'prod',
    HamsterShave_Test: 'test',
  }

  return {
    // TODO: Нужны новые руководства по игре!
    guideLink: {
      ru: '',
      en: '',
    },
    cdn: {
      baseUrl: appConfig.webAppUrl,
      welcomeImage: appConfig.welcomeImage,
    },
    subscribeChannelUrl: '',
    env: map[appConfig.appName],
    webAppUrl: appConfig.webAppUrl,
  }
}

const create = async (arg: { config?: Config; pathlyConf?: PathlyConfig; clock?: Clock } = {}) => {
  const config = arg.config || Config()
  const clock = arg.clock || createClock()
  const now = clock.getNow()

  console.info('Start...')

  const pathlyConf = arg.pathlyConf || createPathlyConfig(config)
  const season2ConfWrapper = PathlyConfigWrapper.create(pathlyConf, now)
  const metricShema = Metric.createSchema()
  const metric = metricShema.metric

  if (!config.postgres) throw Error('config.postgres is required!')
  const postgresDb: Db = Db.create({ config: config.postgres })

  const pgDb = PgDb.create(postgresDb)

  const tgBot = await TelegramBot.create({
    tgConfig: config.telegram,
    config: config,
    clock,
    pgDb,
  })

  // Все пути без параметров разрешены по умолчанию
  const metricsPathBlackList: string[] = ['/public/']

  // Все пути с параметрами запрещены по умолчанию
  const metricsPathWithParamsWhiteList: string[] = ['/season2/config/']

  const bApp = BaseApp(clock, metric, config, season2ConfWrapper)

  const app = new Elysia()
    .use(bApp)
    .use(
      cors({
        // Если оставить 'origin: true', то cors плагин будет ставить 'Vary: *', что ломает кеширование,
        // а если передать пустую функцию, то это будет аналогично *, на с 'Vary: Origin', что будет правильно кешироваться.
        origin: _ => true,
        // Кастомизация времени кеширования preflight (OPTION) запросов
        maxAge: config.corsCacheMaxAge as number,
        exposeHeaders: 'config-version',
      })
    )
    .use(ElysiaMetrics(metric, metricsPathBlackList, metricsPathWithParamsWhiteList))
    .use(ClientHttp.create(bApp, { config, pgDb, tgBot }))
    .use(ClientWs.create(bApp, { config, pgDb, tgBot }))
    .use(AdminHttp.create(bApp, { config, pgDb, tgBot }))
    .get('/', () => 'Hello!', { detail: { tags: ['Test'] } })
    .get('/health', () => 'I am ok!', { detail: { tags: ['Test'] } })
    .get('/metrics', () => metricShema.registry.metrics())
    .use(telegramBotWebhook(tgBot.bot, config.telegram.webhookSecret))
    .use(staticPlugin())
    .listen({
      port: config.httpPort as number,
      hostname: '0.0.0.0',
    })

  const stop = async () => {
    // Очищаем все таймеры раундов
    RoundTimers.clearAll()
    WalletTimers.clearAll()

    // Сейчас из за бага в Bun http server не останавливается если его не просить тормозить активные соединения 🤷
    // Поэтому сначала http server убивается с активными соединениями, а потом уже делается graceful shutdown.
    // TODO нужно убрать когда пофиксят https://github.com/oven-sh/bun/issues/6632
    app.server?.stop(true)
    await app.stop()
    await tgBot.bot.stop()
  }

  console.info(`
🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}/public/playground2.html
Swagger at http://${app.server?.hostname}:${app.server?.port}/swagger-super-secret-path
Open Telegram WebApp at https://t.me/${tgBot.me.username} (send command /get_webapp_links)
  `)

  // Инициализируем таймеры раундов при запуске сервера
  await LogicGame.initializeRoundTimers(pgDb)
  await LogicGame.initializeWalletTimers(pgDb, config)

  return { config, pathlyConf, app, stop }
}

export type App = Awaited<ReturnType<typeof create>>['app']
export default {
  create,
}
