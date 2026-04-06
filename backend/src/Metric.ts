import { MetricSchema } from './lib/MetricSchema'

const createSchema = () => {
  const prefix = 'hamster_'

  // TODO вынести в другое место (стандартные метрики)
  // import client from 'prom-client'
  // const collectDefaultMetrics = client.collectDefaultMetrics
  // collectDefaultMetrics({ prefix })
  // <<

  return MetricSchema({ prefix })
    .counter({
      name: 'onchain',
      help: 'TON Transactions metrics',
      labelNames: ['event'] as const,
    })
    .counter({
      name: 'game_logic',
      help: 'Game logic metrics',
      labelNames: ['event', 'level'] as const,
    })
    .counter({
      name: 'app_error_code',
      help: 'App error code counter',
      labelNames: ['error_code', 'http_status', 'path'] as const,
    })
    .counter({
      name: 'elysia_error_code',
      help: 'Elysia error code counter',
      labelNames: ['elysia_error_code', 'http_status'] as const,
    })
    .counter({
      name: 'http_req_rate',
      help: 'HTTP request rate metric',
      labelNames: ['path', 'status_code'] as const,
    })
    .histogram({
      name: 'http_req_time',
      help: 'HTTP request time metric',
      labelNames: ['path', 'status_code'] as const,
    })
}

export const Metric = {
  createSchema,
  create: () => createSchema().metric,
}
export type Metric = ReturnType<typeof Metric.create>
