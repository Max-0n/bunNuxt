import client, { Counter, Gauge, Histogram, LabelValues, Registry, Summary } from 'prom-client'

export type Timer = (labels?: LabelValues<string>) => number

export const MetricSchema = <State extends Record<string, PromClientClass<string>>>(initArg: Partial<InitArg<State>>) =>
  _createMetric({
    prefix: initArg.prefix || '',
    metric: initArg.metric || {},
    registry: new client.Registry(),
  })

type InitArg<State extends Record<string, PromClientClass<string>>> = {
  prefix: string
  metric: State
  registry: Registry
}

type PromClientClass<Labels extends string> = Counter<Labels> | Gauge<Labels> | Histogram<Labels> | Summary<Labels>
type TupleOfStrings<T extends readonly string[]> = T extends string[] ? never : T

export type MetricSchema<State extends Record<string, PromClientClass<string>>> = {
  metric: State
  counter: <Name extends string, Labels extends readonly string[]>(arg: {
    name: Exclude<Name, keyof State>
    help: string
    labelNames: TupleOfStrings<Labels>
  }) => MetricSchema<State & Record<Name, Counter<Labels[number]>>>
  gauge: <Name extends string, Labels extends readonly string[]>(arg: {
    name: Exclude<Name, keyof State>
    help: string
    labelNames: TupleOfStrings<Labels>
  }) => MetricSchema<State & Record<Name, Gauge<Labels[number]>>>
  histogram: <Name extends string, Labels extends readonly string[]>(arg: {
    name: Exclude<Name, keyof State>
    help: string
    labelNames: TupleOfStrings<Labels>
    buckets?: number[]
  }) => MetricSchema<State & Record<Name, Histogram<Labels[number]>>>
  summary: <Name extends string, Labels extends readonly string[]>(arg: {
    name: Exclude<Name, keyof State>
    help: string
    labelNames: TupleOfStrings<Labels>
  }) => MetricSchema<State & Record<Name, Summary<Labels[number]>>>
  registry: Registry
}

const _createMetric = <State extends Record<string, PromClientClass<string>>>(
  initArg: InitArg<State>
): MetricSchema<State> => {
  const { prefix, metric, registry } = initArg
  const counter = <Labels extends readonly string[]>(arg: {
    name: string
    help: string
    labelNames: TupleOfStrings<Labels>
  }) => {
    const counter = new client.Counter({
      ...arg,
      name: prefix + arg.name,
      registers: [registry],
    })
    const newMetrics = {
      ...metric,
      [arg.name]: counter,
    }
    return _createMetric({
      ...initArg,
      metric: newMetrics,
    })
  }
  const gauge = <Labels extends readonly string[]>(arg: {
    name: string
    help: string
    labelNames: TupleOfStrings<Labels>
  }) => {
    const gauge = new client.Gauge({
      ...arg,
      name: prefix + arg.name,
      registers: [registry],
    })
    const newMetrics = {
      ...metric,
      [arg.name]: gauge,
    }
    return _createMetric({
      ...initArg,
      metric: newMetrics,
    })
  }
  const histogram = <Labels extends readonly string[]>(arg: {
    name: string
    help: string
    labelNames: TupleOfStrings<Labels>
    buckets?: number[]
  }) => {
    const histogram = new client.Histogram({
      ...arg,
      name: prefix + arg.name,
      registers: [registry],
    })
    const newMetrics = {
      ...metric,
      [arg.name]: histogram,
    }
    return _createMetric({
      ...initArg,
      metric: newMetrics,
    })
  }
  const summary = <Labels extends readonly string[]>(arg: {
    name: string
    help: string
    labelNames: TupleOfStrings<Labels>
    percentiles?: number[]
    maxAgeSeconds?: number
    ageBuckets?: number
    pruneAgedBuckets?: boolean
    compressCount?: number
  }) => {
    const summary = new client.Summary({
      ...arg,
      name: prefix + arg.name,
      registers: [registry],
    })
    const newMetrics = {
      ...metric,
      [arg.name]: summary,
    }
    return _createMetric({
      ...initArg,
      metric: newMetrics,
    })
  }
  return { counter, metric, registry, gauge, histogram, summary }
}
