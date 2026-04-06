export type Interval = {
  start: Date
  end: Date
  contains: (date: Date) => boolean
  intersects: (other: Interval) => boolean
  diff: () => number
}

export const Interval = (start: Date, end: Date): Interval => {
  return {
    start,
    end,
    contains: (date: Date): boolean => start.getTime() <= date.getTime() && date.getTime() <= end.getTime(),
    intersects: (other: Interval): boolean =>
      (start.getTime() >= other.start.getTime() && start.getTime() < other.end.getTime()) ||
      (other.start.getTime() >= start.getTime() && other.start.getTime() < end.getTime()),
    diff: (): number => end.getTime() - start.getTime(),
  }
}

/**
 * Проверить, одинаковый ли день у двух дат
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  )
}

/**
 * Проверить, одинаковый ли час у двух дат
 */
export function isSameHour(d1: Date, d2: Date): boolean {
  return isSameDay(d1, d2) && d1.getHours() === d2.getHours()
}
