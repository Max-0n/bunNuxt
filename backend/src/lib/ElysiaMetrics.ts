import { Timer } from '@src/lib/MetricSchema'
import { Metric } from '@src/Metric'
import { Elysia } from 'elysia'

export const ElysiaMetrics = (metric: Metric, blackList?: string[], whiteList?: string[]) => {
  const _pageNotFoundPath = '/page_not_found'

  const isInList = (path: string, list?: string[]): boolean =>
    list ? list.some(pattern => path.startsWith(pattern)) : false

  const shouldBeLogged = (path: string, params?: string[]): boolean =>
    !isInList(path, blackList) && (!params || params.length === 0 || isInList(path, whiteList))

  const _sendMetrics = (path: string, params: string[] | undefined, status_code: number, timer?: Timer) => {
    if (timer && shouldBeLogged(path, params)) {
      const labels = { path, status_code }
      metric.http_req_rate.inc(labels)
      timer(labels)
    }
  }

  return new Elysia().state('timer', undefined as Timer | undefined).onBeforeHandle({ as: 'scoped' }, context => {
    context.store.timer = metric.http_req_time.startTimer()
  })
}
