import type { GameMode } from '@shared-protocol/types'

export const salt = '~--~%__bojes--#%#--tbvenno__%-~-~'

// Все режимы игры
export const ALL_GAME_MODES: GameMode[] = ['pvp', 'duel', 'limit', '32']

// Длительность раунда в миллисекундах
export const ROUND_DURATION_MS = 15_000
export const NEW_ROUND_DELAY_MS = 10_000

// Минимальное количество подтверждений блоков для транзакций TON
export const MIN_CONFIRMATIONS = 2
// Минимальная сумма депозита (0.5 TON)
export const MIN_DEPOSIT_TON = '0.5'
// Минимальная сумма входящего депозита в nanotons (0.5 TON = 500_000_000 nanoton)
export const MIN_DEPOSIT_NANOTON = BigInt(500_000_000)

// Стандартный walletId для WalletContractV4 R2 (698983191)
export const WALLET_V4R2_ID = 0x29a9a317

// Процент налога с выигрыша
export const TAX_PERCENTAGE = 20

// Процент награды рефереру (от транзакции налога)
export const REFERRAL_REWARD_PERCENTAGE = 10

// === Режимы 'duel' и 'limit' ===
// Задержка при добавлении ставки (продлеваем таймер на 3 секунды)
export const DUEL_DOUBLE_BET_DELAY_MS = 3_000

// === Режим 'limit' ===
// Максимальная сумма первой ставки в режиме limit (в TON)
export const LIMIT_MAX_FIRST_BET = '5'
// Максимальное отклонение суммарной ставки от соперника (50%)
export const LIMIT_MAX_DIFF_PERCENT = 50

// === Режим '32' ===
// Максимальная ставка в режиме 32 (в TON)
export const SOLO_32_MAX_BET = '10'
// Множители выигрыша по цветам
export const SOLO_32_WIN_MULTIPLIERS = {
  light: 2,
  dark: 2,
  red: 10,
} as const

// Допустимые цвета ставки/результата для режима 32.
export type Solo32Color = 'light' | 'dark' | 'red'
// Фиксированный порядок нужен для детерминированных tie-break'ов в сортировках.
export const SOLO_32_COLORS: Solo32Color[] = ['light', 'dark', 'red']
// Старт периода расчёта reward-пула: 3 марта 2026, 00:00:00 UTC.
export const REWARD_POOL_CALC_START_DATE_UTC = new Date('2026-03-04T12:00:00.000Z')
