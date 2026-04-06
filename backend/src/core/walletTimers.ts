interface WalletTimerEntry {
  callback: () => Promise<boolean>
}

const BETWEEN_CHECKS_DELAY_MS = 2000
const NEXT_CYCLE_DELAY_MS = 10000

// Хранилище initial-транзакций пополнений: transactionId -> callback
const initialDepositTimers = new Map<number, WalletTimerEntry>()

let cycleTimer: ReturnType<typeof setTimeout> | null = null
let isCycleRunning = false

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const scheduleCycle = (delayMs: number) => {
  if (cycleTimer) {
    clearTimeout(cycleTimer)
    cycleTimer = null
  }

  if (initialDepositTimers.size === 0) {
    return
  }

  cycleTimer = setTimeout(() => {
    cycleTimer = null
    void runCycle()
  }, delayMs)
}

const runCycle = async () => {
  if (isCycleRunning) return
  isCycleRunning = true

  try {
    const entries = Array.from(initialDepositTimers.entries())
    for (let i = 0; i < entries.length; i++) {
      const [transactionId, entry] = entries[i]

      // Транзакция могла быть удалена во время предыдущих проверок цикла.
      if (!initialDepositTimers.has(transactionId)) {
        continue
      }

      try {
        const shouldKeepWatching = await entry.callback()
        if (!shouldKeepWatching) {
          initialDepositTimers.delete(transactionId)
        }
      } catch (error) {
        console.error(`[WalletTimers] Error processing initial deposit ${transactionId}:`, error)
      }

      if (i < entries.length - 1) {
        await sleep(BETWEEN_CHECKS_DELAY_MS)
      }
    }
  } finally {
    isCycleRunning = false
    scheduleCycle(NEXT_CYCLE_DELAY_MS)
  }
}

export const WalletTimers = {
  setInitialTimer(transactionId: number, callback: () => Promise<boolean>) {
    initialDepositTimers.set(transactionId, { callback })

    // Если цикл не запущен — запускаем немедленно.
    if (!isCycleRunning && !cycleTimer) {
      scheduleCycle(0)
    }
  },

  clearInitialTimer(transactionId: number) {
    initialDepositTimers.delete(transactionId)
    if (initialDepositTimers.size === 0 && cycleTimer) {
      clearTimeout(cycleTimer)
      cycleTimer = null
    }
  },

  hasInitialTimer(transactionId: number): boolean {
    return initialDepositTimers.has(transactionId)
  },

  clearAll() {
    if (cycleTimer) {
      clearTimeout(cycleTimer)
      cycleTimer = null
    }
    initialDepositTimers.clear()
    isCycleRunning = false
  },

  getStats() {
    return {
      initialTimers: initialDepositTimers.size,
      isCycleRunning,
    }
  },
}
