import * as t from '@sinclair/typebox/type'
import { type Static } from '@sinclair/typebox/type'
import * as Value from '@sinclair/typebox/value'
import { Date2Str } from './types'

export type BaseToggle = Static<typeof BaseToggle>
const BaseToggle = t.Object({
  // между полями логическое "И"
  enabled: t.Optional(t.Boolean()), // enabled by default
  enableAt: t.Optional(Date2Str()),
  disableAt: t.Optional(Date2Str()),
})

/**
 * Свитч для включения/выключения функциональности в конфиге.
 */
export type Toggle = Static<typeof Toggle>
export const Toggle = t.Intersect([
  BaseToggle,
  t.Object({
    // специфичный для клиента выключатель, оверрайдит базовый
    client: t.Optional(BaseToggle),
  }),
])

export const Toggleable = <T extends t.TSchema>(schema: T) =>
  t.Intersect([t.Object({ toggle: t.Optional(Toggle) }), schema])
export const ToggleableArray = <T extends t.TSchema>(schema: T) => t.Array(Toggleable(schema))

export type Side = 'client' | 'server'
/**
 * Проходит рекурсивно в глубину по value,
 *  отфильтровывает все объекты с полем toggle в неактивном состоянии.
 * Если в дереве будет какой-либо объект с полем toggle, но другого типа, то поведение не определено.
 */
export const applyToggles = <T>(value: T, now: Date, side: Side): [T, Date | undefined] => {
  const dates: (Date | undefined)[][] = []
  const newValue = deepFilter(value, <T>(value: T): value is T => {
    const toggle = getToggle(value)
    if (toggle) {
      dates.push(toggleDates(toggle, side))
      return isToggleEnabled(toggle, now, side)
    } else return true
  })
  const nextUpdateDate = nextDateAfterNow(dates.flat(), now)
  return [newValue, nextUpdateDate] as const
}

const getToggle = (value: unknown): Toggle | undefined =>
  Value.IsStandardObject(value) && 'toggle' in value && value.toggle ? (value.toggle as Toggle) : undefined

const deepFilter = <T>(value: T, fun: <V>(value: V) => value is V): T => {
  if (Value.IsStandardObject(value)) {
    const result: any = {}
    for (const [key, subValue] of Object.entries(value)) if (fun(subValue)) result[key] = deepFilter(subValue, fun)
    return result
  } else if (Value.IsArray(value)) {
    return value.filter(fun).map(subValue => deepFilter(subValue, fun)) as T
  } else return value
}

const isToggleEnabled = (toggle: Toggle, now: Date, side: Side) =>
  side === 'client' ? isBaseToggleEnabled({ ...toggle, ...toggle.client }, now) : isBaseToggleEnabled(toggle, now)

const isBaseToggleEnabled = (toggle: Toggle, now: Date) =>
  (toggle.enabled === undefined || toggle.enabled) &&
  (!toggle.enableAt || toggle.enableAt <= now) &&
  (!toggle.disableAt || toggle.disableAt > now)

const toggleDates = (toggle: Toggle, side: Side) =>
  side === 'client' ? baseToggleDates({ ...toggle, ...toggle.client }) : baseToggleDates(toggle)

const baseToggleDates = (toggle: Toggle) =>
  toggle.enabled === undefined || toggle.enabled ? [toggle.disableAt, toggle.enableAt] : []

export const nextDateAfterNow = (dates: (Date | undefined)[], now: Date) => {
  const numDates = dates.filter((date): date is Date => !!date && date > now).map(date => date.getTime())
  return numDates.length === 0 ? undefined : new Date(Math.min(...numDates))
}
