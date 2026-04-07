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
import { Db } from './Db'
import PgDb from './db/pgDb'
import { Metric } from './Metric'
import { Clock, createClock } from './utils'

const createPathlyConfig = (appConfig: Config): PathlyConfig => {
  const map: Record<string, EnvName> = {
    HamsterShave_Local: 'local',
    HamsterShave_Stage: 'stage',
    HamsterShave_Prod: 'prod',
    HamsterShave_Test: 'test',
    Local: 'local',
    Test: 'test',
    Stage: 'stage',
    Prod: 'prod',
  }

  return {
    guideLink: {
      ru: '',
      en: '',
    },
    cdn: {
      baseUrl: 'https://localhost',
      welcomeImage: '/images/welcomeNew.jpg',
    },
    subscribeChannelUrl: '',
    env: map[appConfig.appName] ?? 'local',
    webAppUrl: 'https://localhost',
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

  // Все пути без параметров разрешены по умолчанию
  const metricsPathBlackList: string[] = ['/public/']

  // Все пути с параметрами запрещены по умолчанию
  const metricsPathWithParamsWhiteList: string[] = ['/season2/config/']

  const bApp = BaseApp(clock, metric, config, season2ConfWrapper)

  const app = new Elysia()
    .use(bApp)
    .use(
      cors({
        origin: _ => true,
        maxAge: config.corsCacheMaxAge as number,
        exposeHeaders: 'config-version',
      })
    )
    .use(ElysiaMetrics(metric, metricsPathBlackList, metricsPathWithParamsWhiteList))
    .use(ClientHttp.create(bApp, { config, pgDb }))
    .use(AdminHttp.create(bApp, { config, pgDb }))
    .get('/', () => 'Hello!', { detail: { tags: ['Test'] } })
    .get('/health', () => 'I am ok!', { detail: { tags: ['Test'] } })
    .get('/metrics', () => metricShema.registry.metrics())
    .use(staticPlugin())
    .listen({
      port: config.httpPort as number,
      hostname: '0.0.0.0',
    })

  const stop = async () => {
    app.server?.stop(true)
    await app.stop()
  }

  console.info(`
🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}/public/playground2.html
Swagger at http://${app.server?.hostname}:${app.server?.port}/swagger-super-secret-path
  `)

  return { config, pathlyConf, app, stop }
}

export type App = Awaited<ReturnType<typeof create>>['app']
export default {
  create,
}
