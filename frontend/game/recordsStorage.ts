export type CircleDrawRecord = {
  scorePercent: number
  createdAtMs: number
}

const RECORDS_STORAGE_KEY = 'circle-draw-records-v1'
const MAX_STORED_RECORDS = 100

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readRecords(): CircleDrawRecord[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap(item => {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.scorePercent !== 'number' ||
        typeof item.createdAtMs !== 'number'
      ) {
        return []
      }

      return [
        {
          scorePercent: clampPercent(item.scorePercent),
          createdAtMs: item.createdAtMs,
        },
      ]
    })
  } catch {
    return []
  }
}

function writeRecords(records: CircleDrawRecord[]): void {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_STORED_RECORDS)))
  } catch {
    // noop
  }
}

export function getSortedCircleDrawRecords(): CircleDrawRecord[] {
  return readRecords().sort((a, b) => b.scorePercent - a.scorePercent || b.createdAtMs - a.createdAtMs)
}

export function getTopCircleDrawRecord(): CircleDrawRecord | null {
  const records = getSortedCircleDrawRecords()
  return records[0] ?? null
}

export function addCircleDrawRecord(scorePercent: number): CircleDrawRecord {
  const record: CircleDrawRecord = {
    scorePercent: clampPercent(scorePercent),
    createdAtMs: Date.now(),
  }
  const records = readRecords()
  records.push(record)
  writeRecords(records)
  return record
}

export function formatRecordDateTime(createdAtMs: number): string {
  return new Date(createdAtMs).toLocaleString('ru-RU', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
