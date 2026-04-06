import type { GameMode } from '@shared-protocol/types'

interface TimerEntry {
  timer: ReturnType<typeof setTimeout>
  callback: () => Promise<void>
}

// Хранилище таймеров для завершения раундов: roundId -> TimerEntry
const roundFinishTimers = new Map<number, TimerEntry>()

// Хранилище таймеров для создания раундов: gameMode -> TimerEntry
const roundCreateTimers = new Map<GameMode, TimerEntry>()

export const RoundTimers = {
  // === Таймеры завершения раундов ===

  // Установить таймер завершения раунда
  setFinishTimer(roundId: number, delayMs: number, callback: () => Promise<void>) {
    // Очищаем предыдущий таймер, если есть
    this.clearFinishTimer(roundId)

    const timer = setTimeout(async () => {
      try {
        await callback()
      } finally {
        // Удаляем таймер из хранилища после выполнения
        roundFinishTimers.delete(roundId)
      }
    }, delayMs)

    roundFinishTimers.set(roundId, { timer, callback })
  },

  // Изменить время до выполнения таймера завершения раунда
  rescheduleFinishTimer(roundId: number, newDelayMs: number): boolean {
    const entry = roundFinishTimers.get(roundId)
    if (!entry) {
      return false
    }

    // Очищаем старый таймер
    clearTimeout(entry.timer)

    // Создаём новый таймер с тем же callback
    const newTimer = setTimeout(async () => {
      try {
        await entry.callback()
      } finally {
        roundFinishTimers.delete(roundId)
      }
    }, newDelayMs)

    roundFinishTimers.set(roundId, { timer: newTimer, callback: entry.callback })
    return true
  },

  // Очистить таймер завершения раунда
  clearFinishTimer(roundId: number) {
    const entry = roundFinishTimers.get(roundId)
    if (entry) {
      clearTimeout(entry.timer)
      roundFinishTimers.delete(roundId)
    }
  },

  // Проверить, есть ли таймер завершения раунда
  hasFinishTimer(roundId: number): boolean {
    return roundFinishTimers.has(roundId)
  },

  // === Таймеры создания раундов ===

  // Установить таймер создания раунда
  setCreateTimer(game: GameMode, delayMs: number, callback: () => Promise<void>) {
    // Очищаем предыдущий таймер, если есть
    this.clearCreateTimer(game)

    const timer = setTimeout(async () => {
      try {
        await callback()
      } finally {
        // Удаляем таймер из хранилища после выполнения
        roundCreateTimers.delete(game)
      }
    }, delayMs)

    roundCreateTimers.set(game, { timer, callback })
  },

  // Изменить время до выполнения таймера создания раунда
  rescheduleCreateTimer(game: GameMode, newDelayMs: number): boolean {
    const entry = roundCreateTimers.get(game)
    if (!entry) {
      return false
    }

    // Очищаем старый таймер
    clearTimeout(entry.timer)

    // Создаём новый таймер с тем же callback
    const newTimer = setTimeout(async () => {
      try {
        await entry.callback()
      } finally {
        roundCreateTimers.delete(game)
      }
    }, newDelayMs)

    roundCreateTimers.set(game, { timer: newTimer, callback: entry.callback })
    return true
  },

  // Очистить таймер создания раунда
  clearCreateTimer(game: GameMode) {
    const entry = roundCreateTimers.get(game)
    if (entry) {
      clearTimeout(entry.timer)
      roundCreateTimers.delete(game)
    }
  },

  // Проверить, есть ли таймер создания раунда
  hasCreateTimer(game: GameMode): boolean {
    return roundCreateTimers.has(game)
  },

  // === Утилиты ===

  // Очистить все таймеры (для graceful shutdown)
  clearAll() {
    roundFinishTimers.forEach(entry => clearTimeout(entry.timer))
    roundFinishTimers.clear()

    roundCreateTimers.forEach(entry => clearTimeout(entry.timer))
    roundCreateTimers.clear()
  },

  // Получить количество активных таймеров (для отладки)
  getStats() {
    return {
      finishTimers: roundFinishTimers.size,
      createTimers: roundCreateTimers.size,
    }
  },
}
