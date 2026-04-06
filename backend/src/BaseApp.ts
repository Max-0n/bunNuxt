import swagger from '@elysiajs/swagger'
import BarcodesConfigWrapper from '@src/lib/configWrapper'
import Elysia, { NotFoundError } from 'elysia'
import { Config } from './Config'
import { Errors } from './Errors'
import { Metric } from './Metric'
import { Clock } from './utils'

export const BaseApp = (
  clock: Clock,
  metric: Metric,
  config: Config,
  barcodesConfigWrapper: ReturnType<typeof BarcodesConfigWrapper.create>
) => {
  return (
    new Elysia()
      // server timestamp header
      .derive(({ set }) => {
        const now = clock.getNow()
        set.headers['server-time'] = now.toISOString()
        return { now }
      })
      .state('barcodeConfig', barcodesConfigWrapper)
      // set season2 config
      .derive(({ set, now, store: { barcodeConfig } }) => {
        const currentPathlyConfig = barcodeConfig.getCurrent(now)
        set.headers['config-version'] = currentPathlyConfig.publicConf.hash
        if (currentPathlyConfig.nextUpdateDate)
          set.headers['config-next-update'] = currentPathlyConfig.nextUpdateDate.toISOString()
        return { barcodesConf: currentPathlyConfig.conf, publicBarcodesConf: currentPathlyConfig.publicConf }
      })
      .use(swagger({ exclude: '/telegram-webhook', path: '/swagger-super-secret-path' }))
      .error(Errors)
      .onError(async ({ code, error, set, request, path }) => {
        const isProd = config.appName === 'Prod'
        // чтобы в логах не светились чувствительные данные
        const authorizationHeader = request.headers.get('authorization')
        if (authorizationHeader?.startsWith('Bearer ')) request.headers.set('authorization', 'Bearer ****')
        metric.elysia_error_code.inc({ elysia_error_code: code, http_status: set.status })
        switch (code) {
          case 'Client': {
            set.status = 400
            console.error(
              `BadRequest: ${error.error_code}: ${error.error_message || ''} ${JSON.stringify({ ...error.params })};` +
                ` Req: ${request.method} ${request.url};` +
                ` Headers: ${JSON.stringify(request.headers)} <--\n`
            )
            metric.app_error_code.inc({ error_code: error.error_code, http_status: set.status, path })
            return { error_code: error.error_code, error_message: error.error_message, ...error.params }
          }
          case 'Unauthorized': {
            set.status = 401
            console.error(
              `Unauthorized: ${error.error_code}: ${error.error_message || ''};` +
                ` Req: ${request.method} ${request.url};` +
                ` Headers: ${JSON.stringify(request.headers)} <--\n`
            )
            metric.app_error_code.inc({ error_code: error.error_code, http_status: set.status, path })
            return { error_code: error.error_code, error_message: error.error_message }
          }
          case 'VALIDATION': {
            // в случае в VALIDATION ошибкой, error.message это JSON в виде строки. Причем с отступами и нормальным
            // форматированием - на клиенте можно нормально прочитать
            return isProd ? 'VALIDATION' : error.message
          }
          case 'NOT_FOUND': {
            const ignore404Errors = ['/ip']
            const isError404 = error instanceof NotFoundError
            const url = new URL(request.url)

            // Если на тестовом сервере возникла ошибка 404 из списка выше, то ничего не выводим в консоль
            const ignoreError = isError404 && !isProd && ignore404Errors.includes(url.pathname)
            if (!ignoreError) {
              console.warn(`${error.message}:404 ${request.method} ${request.url}`)
            }
            return isProd ? 'NOT_FOUND' : error.message
          }
          default: {
            console.error(error)

            return isProd ? 'INTERNAL_SERVER_ERROR' : error
          }
        }
      })
  )
}
export type BaseApp = ReturnType<typeof BaseApp>
