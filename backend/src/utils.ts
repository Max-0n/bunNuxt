import { heapStats } from 'bun:jsc'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { Interval, isSameDay as logicUtils_IsSameDay } from '@pathly-protocol/logic/logicUtils'
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns'
import murmurhash from 'murmurhash'
import { salt } from './core/constants'
import { Error400 } from './Errors'

export { Interval }

export const isStatus200 = (status: number) => status >= 200 && status <= 299
export const isStatus400 = (status: number) => status >= 400 && status <= 499

export function isError(e: unknown): e is Error {
  if (typeof e !== 'object' || !e) return false

  return 'message' in e && typeof e.message === 'string' && 'name' in e && typeof e.name === 'string'
}

export const safeJsonParse = <T>(str: string) => {
  try {
    const jsonValue: T = JSON.parse(str)

    return jsonValue
  } catch {
    return undefined
  }
}

export const msToTimestamp = (ms: number) => Math.floor(ms / 1000)
export const dateToTimestamp = (date: Date) => msToTimestamp(date.getTime())
export const getNextMidnightTimestamp = (now: Date) =>
  dateToTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
export function getNextMidnightSeconds(now: Date): number {
  const nextNextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return msToTimestamp(nextNextMidnight.getTime() - now.getTime())
}
export const getNextTimeForMinute = (minuteInterval: number, now: Date) => {
  const minutesNow = now.getMinutes()
  const nextInterval = minuteInterval - (minutesNow % minuteInterval)
  const nextTime = new Date(now.getTime() + nextInterval * 60 * 1000) // Преобразование в миллисекунды
  nextTime.setSeconds(0) // Обнуляем секунды для получения точного времени кратного минуте
  nextTime.setMilliseconds(0) // Обнуляем миллисекунды для получения точного времени
  return nextTime
}
export const getNextTimeForMinuteSeconds = (minuteInterval: number, now: Date): number =>
  dateToTimestamp(getNextTimeForMinute(minuteInterval, now))
export const getStartOfToday = (now: Date) => new Date(new Date(now).setUTCHours(0, 0, 0, 0))
export const getEndOfToday = (now: Date) => new Date(new Date(now).setUTCHours(23, 59, 59, 999))
export const getDayAfterMonth = (now: Date) => new Date(new Date(now).setMonth(now.getMonth() + 1))
export const shiftDateBySeconds = (date: Date, shift: number) => new Date(date.getTime() + shift * 1000)

export function getDifferenceInSeconds(date1: Date, date2: Date): number {
  const diffInMs = Math.abs(date1.getTime() - date2.getTime())
  return Math.floor(diffInMs / 1000)
}

export function getInterval(arg: {
  now: Date
  intervalUnit: { unit: 'day'; days: number } | { unit: 'minute'; minutes: number }
  offset?: number
}): Interval {
  const { now, intervalUnit: interval, offset = 0 } = arg
  switch (interval.unit) {
    case 'day': {
      return _getInterval({
        now,
        unitInMillis: 1000 * 60 * 60 * 24,
        intervalSize: interval.days,
        offset,
      })
    }
    case 'minute': {
      return _getInterval({
        now,
        unitInMillis: 1000 * 60,
        intervalSize: interval.minutes,
        offset,
      })
    }
  }
}

const _getInterval = (arg: { now: Date; unitInMillis: number; intervalSize: number; offset: number }): Interval => {
  const { now, unitInMillis, intervalSize, offset } = arg
  const currentUnits = Math.floor(now.getTime() / unitInMillis)
  const step = unitInMillis * intervalSize
  const startIntervalMillis = (currentUnits - (currentUnits % intervalSize)) * unitInMillis + offset * step
  return Interval(new Date(startIntervalMillis), new Date(startIntervalMillis + step))
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return logicUtils_IsSameDay(d1, d2)
}

export function shiftDays(date: Date, days: number): Date {
  if (days === 0) return new Date(date)

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  )
}

export type Clock = ReturnType<typeof createClock>
export const createClock = () => {
  const getNow = () => new Date()
  return {
    getNow,
  }
}
export type FakeClock = Clock & {
  updateNow: (f: (now: Date) => void) => void
  upSeconds: (seconds: number) => void
}
export const createFakeClock = (fakeNow: Date): FakeClock => {
  // let fakeDelta = new Date().getTime() - fakeNow.getTime()
  // const getNow = () => new Date(new Date().getTime() + fakeDelta)
  const getNow = () => fakeNow
  const updateNow = (f: (now: Date) => void) => f(fakeNow)
  const upSeconds = (seconds: number) => updateNow(_ => _.setSeconds(_.getSeconds() + seconds))
  return {
    getNow,
    updateNow,
    upSeconds,
  }
}

export const tgLinkToUsername = (tgLink: string): string | undefined => {
  // https://t.me/mega_test_chat_public
  if (!tgLink.startsWith('https://t.me/')) return undefined
  const username = tgLink.slice('https://t.me/'.length)
  return username ? '@' + username : undefined
}

export const doAndLogTime = async <T>(fun: () => Promise<T>): Promise<T> => {
  const startTime = Date.now()
  const r = await fun()
  const endTime = Date.now()
  console.log(`done in ${endTime - startTime} ms`)
  return r
}

export const memoryDump = () => {
  const memoryMb = (process.memoryUsage.rss() / 1024 / 1024).toFixed(3)
  const stat = heapStats()
  const myStat = {
    heapSize: (stat.heapSize / 1024 / 1024).toFixed(3),
    heapCapacity: (stat.heapCapacity / 1024 / 1024).toFixed(3),
    extraMemorySize: (stat.extraMemorySize / 1024 / 1024).toFixed(3),
    objectCount: (stat.objectCount / 1000).toFixed(1) + 'k',
  }
  console.log(
    `MemUse ${memoryMb} mb | heap ${myStat.heapSize} mb | heapCapacity ${myStat.heapCapacity} mb | extraMemory ${myStat.extraMemorySize} mb | objs ${myStat.objectCount}`
  )
  // Bun.gc(true)
  // console.log(`MemUse ${memoryMb} mb | heap ${myStat.heapSize} mb | heapCapacity ${myStat.heapCapacity} mb | extraMemory ${myStat.extraMemorySize} mb | objs ${myStat.objectCount}`)
  console.log('-')
  // console.log(stat)
  // const snapshot = generateHeapSnapshot();
  // await Bun.write("heap.json", JSON.stringify(snapshot))
}

export const getRemainSeconds = (arg: { startDate: Date; endDate: Date }): number => {
  const { startDate, endDate } = arg
  return Math.abs(differenceInSeconds(endDate, startDate))
}

export const getRemainHours = (arg: { startDate: Date; endDate: Date }): number => {
  const { startDate, endDate } = arg
  return Math.abs(differenceInHours(endDate, startDate))
}

export const getRemainDays = (arg: { startDate: Date; endDate: Date }): number => {
  const { startDate, endDate } = arg
  return Math.abs(differenceInDays(endDate, startDate))
}
export const exitSignalHandler = (onStopApp: () => Promise<void>) => {
  const gracefullStop = async (event: NodeJS.Signals) => {
    process.once(event, forceStop)
    console.log('shutting down...')
    await onStopApp()
    process.exit(0)
  }
  const forceStop = async (event: NodeJS.Signals) => {
    process.once(event, forceStop)
    console.log('force shutting down...')
    process.exit(1)
  }
  process.once('SIGINT', gracefullStop)
  process.once('SIGTERM', gracefullStop)
}

export const stringToHashedNumber = murmurhash.v3

/**
 * Convert unsigned 32 bit number to base32 reprsentaion using provided custom
 * alphabet. Result are always 7 character length. Since 7 characters for base32
 * represents 35 bit, 3 bits from junk used
 * @param {string} alphabet - alphabet for encoding. Should be exactly 32
 * symbols length. No checks are made in favor of performance
 * @param {number} value - value to encode
 * @param {number} junk - lower 3 bit from junk used in append to last digit
 * @return {string} - base32 representation of value
 */
export function base32(alphabet: string, value: number, junk: number): string {
  let s = ''
  let valueAcc = value
  for (let i = 0; i < 6; ++i) {
    s = alphabet[valueAcc & 0x1f] + s
    valueAcc >>>= 5
  }
  s = alphabet[(valueAcc & 0x1f) | ((junk & 0x7) * 8)] + s

  return s
}

export function decodeBase32(alphabet: string, value: string): number {
  let result = 0
  for (let i = 0; i < value.length; ++i) {
    const c = value.charAt(i)
    const k = alphabet.indexOf(c)
    if (k < 0) return -1
    if (i === 0) {
      result = k & 0x1f
    } else {
      result = (result << 5) + k
    }
  }

  return result >>> 0
}

export function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function' &&
    'catch' in value &&
    typeof value.catch === 'function'
  )
}

export function shuffleItems<T>(r: () => number, array: T[]): T[] {
  return array
    .map(item => ({ item, sortValue: r() }))
    .sort((a, b) => a.sortValue - b.sortValue)
    .map(({ item }) => item)
}

export function trimTelegramInvoiceLink(telegramLink: string): string {
  return telegramLink.replace('https://t.me/', '')
}

export const EMPTY_PROGRESS = { DEV: 0, ART: 0, GD: 0 }

export const getRandomRetryDelay = () => {
  const minDelay = 5 * 60 * 1000
  const maxDelay = 25 * 60 * 1000
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
}

export function skipUndefined<T>(value: T): T | undefined {
  return value ? value : undefined
}

export const extractAuthToken_fromHeader = (authorization: string): string | undefined =>
  authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined

export function sha256Hash(string: string): string {
  const hash = createHash('sha256')
  hash.update(string)
  return hash.digest('hex')
}

export const getAuthTokenHash = (authorization: string): string => {
  const authToken = extractAuthToken_fromHeader(authorization)
  if (!authToken) {
    throw new Error400('BAD_AUTH_TOKEN', `Bad auth header authorization=${authorization}`)
  }
  return sha256Hash(salt + authToken)
}

export const canAuthenticate = (telegramId: string | number | undefined): boolean => {
  if (!telegramId) {
    return false
  }

  return true //Whitelist.some(id => id === +telegramId)
}

export function getMimeTypeFromBase64(base64String: string): string | null {
  const signatures = {
    iVBORw0KGgo: 'image/png',
    '/9j/': 'image/jpeg',
    R0lGODdh: 'image/gif',
    R0lGODlh: 'image/gif',
    UklGR: 'image/webp',
    PHN2Zy: 'image/svg+xml',
    PD94bWwg: 'image/svg+xml',
  }

  for (const [prefix, mimeType] of Object.entries(signatures)) {
    if (base64String.startsWith(prefix)) {
      return mimeType
    }
  }

  return null
}

export const friendshipId = (user1: number, user2: number): string => {
  return user1 < user2 ? `${user1}${user2}` : `${user2}${user1}`
}

// Форматирование баланса: убираем лишние нули в конце дробной части
export const formatBalance = (value: string): string => {
  if (!value) return '0'
  const [intPart, fracPart] = value.split('.')
  if (!fracPart) return intPart
  const trimmedFrac = fracPart.replace(/0+$/, '')
  return trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart
}

export function getMonsterHunger(last_feed: Date): number {
  return Math.min(Math.abs(differenceInMinutes(last_feed, new Date())), 100)
}

export function extractFirstPrompt(generatedText: string): string | null {
  const promptRegex = /{\s*"prompt":\s*"([^"]+?)"\s*}/g

  const match = promptRegex.exec(generatedText)
  if (match?.[1]) {
    // Декодируем экранированные символы, если есть
    return match[1].replace(/\\"/g, '"')
  }

  return null
}

export function extractMonsterName(generatedText: string): string | null {
  const jsonRegex = /{[^{}]*"name"\s*:\s*"([^"]*?)"[^{}]*}/g

  // Optional: strip everything before the first curly brace
  if (generatedText.indexOf('{') !== -1) {
    generatedText = generatedText.substring(generatedText.indexOf('{'))
  }

  const matches = [...generatedText.matchAll(jsonRegex)]

  for (const match of matches) {
    try {
      const jsonText = match[0].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\'/g, "'")

      const obj = JSON.parse(jsonText)
      if (typeof obj.name === 'string') {
        return obj.name
      }
    } catch (e) {
      console.error('Error parsing name JSON:', e)
    }
  }

  return null
}

export function extractMonsterDesc(generatedText: string): string | null {
  const jsonRegex = /{[^{}]*"description"\s*:\s*"([^"]*?)"[^{}]*}/g

  const matches = [...generatedText.matchAll(jsonRegex)]

  for (const match of matches) {
    try {
      const jsonText = match[0]
        .replace(/\\n/g, '') // Remove escaped newlines
        .replace(/\\"/g, '"') // Replace escaped quotes
        .replace(/\\'/g, "'") // Optional: fix escaped single quotes

      const obj = JSON.parse(jsonText)
      if (typeof obj.description === 'string') {
        return obj.description
      }
    } catch (e) {
      console.error('Error parsing JSON:', e)
    }
  }

  return null
}

export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase()

  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  } as const

  return mimeTypes[ext as keyof typeof mimeTypes] || 'application/octet-stream'
}
