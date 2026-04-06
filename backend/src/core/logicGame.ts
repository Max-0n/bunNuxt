import { AuthHeaders, type GameMode } from '@shared-protocol/types'
import { Config } from '@src/Config'
import { PgDb } from '@src/db/pgDb'
import { Errors } from '@src/Errors'
import { createLogger } from '@src/lib/Logger'
import { formatBalance } from '@src/utils'
import Decimal from 'decimal.js'
import { ALL_GAME_MODES, MIN_DEPOSIT_NANOTON, MIN_DEPOSIT_TON, NEW_ROUND_DELAY_MS } from './constants'
import { RoundTimers } from './roundTimers'
import { TonTransactions } from './tonTransactions'
import { WalletTimers } from './walletTimers'
import { WebSocketManager } from './ws'

export namespace LogicGame {
  const log = createLogger('LogicGame')

  export async function depositInitial(
    pgDb: PgDb,
    amount: string,
    authToken: string,
    walletAddress?: string,
    clientRequestId?: string,
    config?: Config
  ) {
    if (!config) {
      throw new Errors.Client('CONFIG_REQUIRED', 'Config is required for deposit')
    }

    validateAmount(amount, 'deposit')
    validateDepositAmount(amount)

    const authorization = buildAuthorizationHeaderFromToken(authToken)
    const session = await pgDb.getSession(authorization)
    const result = await pgDb.createInitialDepositTransaction(
      session.userId,
      normalizeAmount(amount),
      walletAddress,
      clientRequestId
    )

    scheduleInitialDepositSearch(pgDb, result.transactionId, config)

    return {
      balance: formatBalance(result.balance),
      transactionId: result.transactionId,
      status: result.status,
    }
  }

  export async function deposit(
    pgDb: PgDb,
    headers: AuthHeaders,
    payload: {
      amount?: string
      walletAddress?: string
      txBoc?: string
      txHash?: string
      clientRequestId?: string
      transactionId?: number
    },
    config?: Config
  ) {
    if (!config) {
      throw new Errors.Client('CONFIG_REQUIRED', 'Config is required for deposit')
    }

    const session = await pgDb.getSession(headers.authorization)

    const clientRequestId = payload.clientRequestId?.trim() || undefined
    const providedTransactionId = typeof payload.transactionId === 'number' ? payload.transactionId : undefined

    if (!providedTransactionId && !clientRequestId && !payload.amount) {
      throw new Errors.Client('INVALID_DEPOSIT', 'transactionId, clientRequestId or amount is required.')
    }

    let txHashHint = normalizeTxHashHint(payload.txHash)
    const txBocHint = payload.txBoc || (!txHashHint && payload.txHash?.startsWith('te6') ? payload.txHash : undefined)
    if (!txHashHint && txBocHint && payload.walletAddress) {
      txHashHint = normalizeTxHashHint(
        (await TonTransactions.findTransactionHashFromBoc(txBocHint, payload.walletAddress, config)) || undefined
      )
    }

    let targetTransactionId = providedTransactionId

    if (!targetTransactionId && clientRequestId) {
      const existing = await pgDb.findDepositTransactionByClientRequestId(session.userId, clientRequestId)
      if (existing) {
        targetTransactionId = existing.id
      }
    }

    if (!targetTransactionId) {
      if (!payload.amount) {
        throw new Errors.Client(
          'DEPOSIT_INITIAL_NOT_FOUND',
          'Initial deposit transaction not found. Call /deposit/initial first (before sendTransaction).'
        )
      }
      validateAmount(payload.amount, 'deposit')
      validateDepositAmount(payload.amount)
      const created = await pgDb.createInitialDepositTransaction(
        session.userId,
        normalizeAmount(payload.amount),
        payload.walletAddress,
        clientRequestId
      )
      targetTransactionId = created.transactionId
    }

    const updated = await pgDb.updateInitialDepositTransactionHints({
      userId: session.userId,
      transactionId: targetTransactionId,
      clientRequestId,
      walletAddress: payload.walletAddress,
      txBoc: txBocHint,
      txHash: txHashHint,
    })

    if (!updated) {
      throw new Errors.Client('DEPOSIT_NOT_FOUND', 'Deposit transaction not found')
    }

    scheduleInitialDepositSearch(pgDb, updated.transactionId, config)

    const user = await pgDb.findUser(session.userId)

    return {
      balance: formatBalance(user?.balance || '0'),
      transactionId: updated.transactionId,
      status: updated.status,
    }
  }

  export async function withdraw(pgDb: PgDb, headers: AuthHeaders, amount: string, toAddress: string, config?: Config) {
    const session = await pgDb.getSession(headers.authorization)
    return await executeWithdrawByUserId(pgDb, session.userId, amount, toAddress, config)
  }

  export async function executeWithdrawByUserId(
    pgDb: PgDb,
    userId: string,
    amount: string,
    toAddress: string,
    config?: Config
  ) {
    validateAmount(amount, 'withdraw')
    validateWithdrawAmount(amount)

    const user = await pgDb.findUser(userId)
    if (!user) {
      throw new Errors.Client('USER_NOT_FOUND', 'User not found')
    }

    const stats = await pgDb.getUserStats(userId)
    if (stats.gamesPlayed < 3) {
      throw new Errors.Client(
        'WITHDRAW_MIN_GAMES',
        'Для вывода необходимо сыграть минимум в 3 раундах. Сыграно: ' + stats.gamesPlayed
      )
    }

    if (!toAddress || typeof toAddress !== 'string') {
      throw new Errors.Client('INVALID_ADDRESS', 'Recipient address is required')
    }

    if (!config) {
      throw new Errors.Client('CONFIG_REQUIRED', 'Config is required for withdrawal')
    }

    // Инициируем вывод средств через TON
    const withdrawalResult = await TonTransactions.initiateWithdrawal(
      pgDb,
      userId,
      normalizeAmount(amount),
      toAddress,
      config
    )

    // Обновляем баланс пользователя (средства списываются сразу)
    const result = await pgDb.withdraw(userId, normalizeAmount(amount))

    const formattedBalance = formatBalance(result.balance)

    WebSocketManager.sendToUser(userId, {
      type: 'balanceChanged',
      balance: formattedBalance,
    })

    return {
      balance: formattedBalance,
      txHash: withdrawalResult.txHash,
    }
  }

  export async function withdrawRequest(pgDb: PgDb, headers: AuthHeaders, amount: string, toAddress: string) {
    const session = await pgDb.getSession(headers.authorization)

    validateAmount(amount, 'withdraw')
    validateWithdrawAmount(amount)

    const stats = await pgDb.getUserStats(session.userId)
    if (stats.gamesPlayed < 3) {
      throw new Errors.Client(
        'WITHDRAW_MIN_GAMES',
        'Для вывода необходимо сыграть минимум в 3 раундах. Сыграно: ' + stats.gamesPlayed
      )
    }

    const request = await pgDb.createWithdrawRequest(session.userId, normalizeAmount(amount), toAddress)

    return {
      requestId: request.id,
      status: request.status,
      createdAt: request.createdAt,
    }
  }

  export async function processWithdrawRequestStatus(
    pgDb: PgDb,
    adminUserId: string,
    requestId: number,
    status: 'payed' | 'rejected',
    config?: Config
  ) {
    const request = await pgDb.getWithdrawRequestById(requestId)
    if (!request) {
      throw new Errors.Client('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found')
    }
    if (request.status !== 'pending') {
      throw new Errors.Client('WITHDRAW_REQUEST_ALREADY_PROCESSED', 'Withdraw request already processed')
    }

    if (status === 'rejected') {
      const rejected = await pgDb.setWithdrawRequestRejected(requestId, adminUserId)
      if (!rejected) {
        throw new Errors.Client('WITHDRAW_REQUEST_PROCESS_FAILED', 'Failed to reject request')
      }
      return rejected
    }

    const user = await pgDb.findUser(request.userId)
    if (!user) {
      throw new Errors.Client('USER_NOT_FOUND', 'User not found')
    }
    const currentBalance = new Decimal(user.balance || '0')
    const requestAmount = new Decimal(request.amount || '0')
    if (currentBalance.lt(requestAmount)) {
      throw new Errors.Client('INSUFFICIENT_FUNDS', 'Not enough balance')
    }

    const withdrawalResult = await executeWithdrawByUserId(
      pgDb,
      request.userId,
      request.amount,
      request.toAddress,
      config
    )
    const payed = await pgDb.setWithdrawRequestPayed(requestId, adminUserId, withdrawalResult.txHash)
    if (!payed) {
      throw new Errors.Client('WITHDRAW_REQUEST_PROCESS_FAILED', 'Failed to mark request as payed')
    }

    return payed
  }

  export async function bet(
    pgDb: PgDb,
    headers: AuthHeaders,
    amount: string,
    game: GameMode,
    now: Date,
    color?: 'light' | 'dark' | 'red'
  ) {
    const session = await pgDb.getSession(headers.authorization)

    validateAmount(amount, 'bet')

    // Создаем ставку
    const result = await pgDb.placeBet(
      session.userId,
      normalizeAmount(amount),
      game,
      now,
      (roundId, game, now) => finishRound(pgDb, roundId, game, now),
      color
    )
    const formattedBalance = formatBalance(result.balance)

    // После любой ставки отправляем обновлённое состояние раунда
    const current = await getCurrentRound(pgDb, game)
    WebSocketManager.broadcast({
      type: 'roundUpdated',
      state: { [game]: current },
    })

    return {
      balance: formattedBalance,
      roundId: result.round.id,
      roundStatus: result.round.status,
    }
  }

  export async function freeRoll(pgDb: PgDb, headers: AuthHeaders, now: Date) {
    const session = await pgDb.getSession(headers.authorization)

    const alreadyPlayedToday = await pgDb.hasFreeRollToday(session.userId, now)
    if (alreadyPlayedToday) {
      throw new Errors.Client(
        'FREE_ROLL_ALREADY_USED',
        'You have already used your free roll today. Try again tomorrow (UTC 00:00).'
      )
    }

    const result = await pgDb.playFreeRoll(session.userId, now)
    return { balance: formatBalance(result.balance), prizeTon: result.prizeTon }
  }

  export async function betNft(pgDb: PgDb, headers: AuthHeaders, nftAddress: string, game: GameMode, now: Date) {
    if (game === '32') {
      throw new Errors.Client('NFT_NOT_ALLOWED_IN_32', 'NFT bets are not allowed in mode 32')
    }
    const session = await pgDb.getSession(headers.authorization)

    const result = await pgDb.placeNftBet(session.userId, nftAddress, game, now, (roundId, game, now) =>
      finishRound(pgDb, roundId, game, now)
    )
    const formattedBalance = formatBalance(result.balance)

    const current = await getCurrentRound(pgDb, game)
    WebSocketManager.broadcast({
      type: 'roundUpdated',
      state: { [game]: current },
    })

    return {
      balance: formattedBalance,
      roundId: result.round.id,
      roundStatus: result.round.status,
    }
  }

  export async function getCurrentRound(pgDb: PgDb, game: GameMode) {
    const data = await pgDb.getCurrentRoundWithMembers(game)
    if (!data) {
      return null
    }

    const { round, bets } = data

    // Получаем NFT данные для ставок
    const nftAddresses = Array.from(
      new Set(
        bets
          .filter(b => b.type === 'nft' && b.nftAddress)
          .map(b => String(b.nftAddress).trim())
          .filter(Boolean)
      )
    )

    const nftsMap = new Map<string, any>()
    if (nftAddresses.length > 0) {
      const nftsData = await pgDb.getNftsByAddresses(nftAddresses)
      for (const nft of nftsData) {
        nftsMap.set(nft.address, nft)
      }
    }

    // Агрегируем ставки по пользователю: у одного userId одна запись с суммой
    const aggregated = new Map<
      string,
      {
        userId: string
        username?: string | null
        firstName?: string | null
        avatar?: string | null
        amount: Decimal
        createdAt: Date
        nftAddresses: string[] // Массив всех NFT адресов
      }
    >()

    for (const b of bets) {
      const existing = aggregated.get(b.userId)
      const amountDec = new Decimal(b.amount)

      if (!existing) {
        aggregated.set(b.userId, {
          userId: b.userId,
          username: b.username,
          firstName: b.firstName,
          avatar: b.avatar,
          amount: amountDec,
          createdAt: b.createdAt,
          nftAddresses: b.type === 'nft' && b.nftAddress ? [String(b.nftAddress)] : [],
        })
      } else {
        existing.amount = existing.amount.plus(amountDec)
        // Обновим betId/createdAt на последнюю ставку (по времени)
        if (b.createdAt > existing.createdAt) {
          existing.createdAt = b.createdAt
        }
        // Добавляем NFT адрес, если ставка - NFT
        if (b.type === 'nft' && b.nftAddress) {
          const nftAddr = String(b.nftAddress)
          if (!existing.nftAddresses.includes(nftAddr)) {
            existing.nftAddresses.push(nftAddr)
          }
        }
      }
    }

    // Для режима '32' группируем ставки по пользователю и собираем все цвета
    let members: any[]
    if (game === '32') {
      const userBetsMap = new Map<
        string,
        {
          userId: string
          firstName?: string | null
          avatar?: string | null
          totalAmount: Decimal
          colorAmounts: Map<'light' | 'dark' | 'red', Decimal>
          createdAt: Date
        }
      >()

      for (const b of bets) {
        if (b.type === 'ton' && b.color && ['light', 'dark', 'red'].includes(b.color)) {
          const existing = userBetsMap.get(b.userId)
          const amountDec = new Decimal(b.amount)
          const betColor = b.color as 'light' | 'dark' | 'red'

          if (!existing) {
            const colorAmounts = new Map<'light' | 'dark' | 'red', Decimal>()
            colorAmounts.set(betColor, amountDec)
            userBetsMap.set(b.userId, {
              userId: b.userId,
              firstName: b.firstName,
              avatar: b.avatar,
              totalAmount: amountDec,
              colorAmounts,
              createdAt: b.createdAt,
            })
          } else {
            existing.totalAmount = existing.totalAmount.plus(amountDec)
            const currentColorAmount = existing.colorAmounts.get(betColor) || new Decimal(0)
            existing.colorAmounts.set(betColor, currentColorAmount.plus(amountDec))
            if (b.createdAt > existing.createdAt) {
              existing.createdAt = b.createdAt
            }
          }
        }
      }

      members = Array.from(userBetsMap.values()).map(m => {
        const colorBets: Array<{ color: 'light' | 'dark' | 'red'; amount: string }> = []
        for (const [color, amount] of m.colorAmounts.entries()) {
          colorBets.push({
            color,
            amount: formatBalance(amount.toFixed(8)),
          })
        }
        // Сортируем по порядку: light, dark, red
        colorBets.sort((a, b) => {
          const order: Record<'light' | 'dark' | 'red', number> = { light: 0, dark: 1, red: 2 }
          return order[a.color] - order[b.color]
        })

        return {
          userId: m.userId,
          firstName: m.firstName ?? undefined,
          avatar: m.avatar ?? undefined,
          amount: formatBalance(m.totalAmount.toFixed(8)),
          createdAt: m.createdAt,
          colorBets,
        }
      })
    } else {
      // Для остальных режимов - агрегированные ставки по пользователю
      members = Array.from(aggregated.values()).map(m => {
        const member: any = {
          userId: m.userId,
          firstName: m.firstName ?? undefined,
          avatar: m.avatar ?? undefined,
          amount: formatBalance(m.amount.toFixed(8)),
          createdAt: m.createdAt,
        }

        // Добавляем массив NFT информации, если есть
        if (m.nftAddresses.length > 0) {
          const nfts = m.nftAddresses
            .map(addr => {
              const nft = nftsMap.get(addr)
              if (!nft) return null
              return {
                address: nft.address,
                name: nft.name,
                image: nft.image,
                preview100x100: nft.preview100x100,
                preview500x500: nft.preview500x500,
                price: nft.price,
              }
            })
            .filter(Boolean)

          // Всегда отправляем массив, даже если NFT один
          if (nfts.length > 0) {
            member.nfts = nfts
          }
        }

        return member
      })
    }

    // bankAmount — сумма всех ставок в текущем раунде
    let totalAmount = new Decimal(0)
    for (const m of aggregated.values()) {
      totalAmount = totalAmount.plus(m.amount)
    }

    // Для режима '32' вычисляем colorBets - агрегированные ставки по цветам
    let colorBets: { light: string[]; dark: string[]; red: string[] } | undefined
    if (game === '32') {
      colorBets = {
        light: [],
        dark: [],
        red: [],
      }

      for (const b of bets) {
        if (b.type === 'ton' && b.color && ['light', 'dark', 'red'].includes(b.color)) {
          colorBets[b.color as 'light' | 'dark' | 'red'].push(formatBalance(b.amount))
        }
      }
    }

    const result: any = {
      id: round.id,
      status: round.status,
      startTime: round.startTime,
      endTime: round.endTime,
      game: round.game,
      bankAmount: formatBalance(totalAmount.toFixed(8)),
      winnerUserId: round.winnerUserId,
      winnerColor: round.winnerColor || undefined,
      members,
      ...(colorBets && { colorBets }),
    }

    return result
  }

  export async function finishRound(pgDb: PgDb, roundId: number, game: GameMode, now: Date) {
    const result = await pgDb.finishRound(roundId, game, now)

    if (!result) {
      // Раунд не был завершен (уже завершен или нет ставок)
      return
    }

    // Если в процессе завершения раунда была начислена реферальная награда — уведомляем реферера
    if (result.referrerId) {
      WebSocketManager.sendToUser(result.referrerId, {
        type: 'rewardReferral',
      })
    }

    // Получаем завершенный раунд (возможно излишнее)
    const finishedRound = await getCurrentRound(pgDb, game)
    if (!finishedRound) {
      return
    }

    WebSocketManager.broadcast({
      type: 'roundUpdated',
      state: { [game]: finishedRound },
    })

    // Отправляем события о ТОП победителе и победителе предыдущего раунда для этого режима игры
    setTimeout(async () => {
      await sendWinnerEvents(pgDb, game)
    }, NEW_ROUND_DELAY_MS)

    // Создаём новый раунд с задержкой (для небольшого "пауза перед новой игрой")
    // Создаем новый раунд для той же игры, что и завершенный раунд
    scheduleRoundCreation(pgDb, game, NEW_ROUND_DELAY_MS)
  }

  // Планирует создание нового раунда через заданное время
  function scheduleRoundCreation(pgDb: PgDb, game: GameMode, delayMs: number) {
    RoundTimers.setCreateTimer(game, delayMs, async () => {
      try {
        await pgDb.createNewRound(game, new Date())

        // Получаем текущий раунд (новый, который был создан)
        const current = await getCurrentRound(pgDb, game)

        // Отправляем обновленное состояние раунда (новый раунд)
        if (current) {
          WebSocketManager.broadcast({
            type: 'roundUpdated',
            state: { [game]: current },
          })
        }
      } catch (err) {
        console.error('[LogicGame] Error creating new round:', err)
      }
    })
  }

  // Инициализация таймеров при запуске сервера
  export async function initializeRoundTimers(pgDb: PgDb) {
    const now = new Date()
    log.info('Initializing round timers...')

    // 1. Восстанавливаем таймеры для запущенных раундов
    const runningRounds = await pgDb.getRunningRounds()
    for (const round of runningRounds) {
      if (round.endTime) {
        const endTime = new Date(round.endTime).getTime()
        const delayMs = Math.max(0, endTime - now.getTime())

        log.info(`Scheduling finish timer for round ${round.id} (game: ${round.game}) in ${delayMs}ms`)

        RoundTimers.setFinishTimer(round.id, delayMs, async () => {
          try {
            await finishRound(pgDb, round.id, round.game as GameMode, new Date())
          } catch (err) {
            console.error(`[initializeRoundTimers] Error finishing round ${round.id}:`, err)
          }
        })
      }
    }

    // 2. Проверяем, есть ли активные раунды для каждого режима игры
    const activeRoundsPerGame = await pgDb.getActiveRoundsPerGame()
    for (const game of ALL_GAME_MODES) {
      if (!activeRoundsPerGame[game]) {
        // Нет активного раунда для этого режима — создаём сразу
        log.info(`No active round for game ${game}, creating new round immediately`)
        try {
          await pgDb.createNewRound(game, now)

          // Отправляем обновленное состояние раунда
          const current = await getCurrentRound(pgDb, game)
          if (current) {
            WebSocketManager.broadcast({
              type: 'roundUpdated',
              state: { [game]: current },
            })
          }
        } catch (err) {
          console.error(`[initializeRoundTimers] Error creating round for ${game}:`, err)
        }
      }
    }

    log.info(`Round timers initialized: ${JSON.stringify(RoundTimers.getStats())}`)
  }

  export async function initializeWalletTimers(pgDb: PgDb, config: Config) {
    log.info('Initializing wallet timers...')

    const initialTransactions = await pgDb.getInitialDepositTransactions()
    for (const transaction of initialTransactions) {
      log.info('[initializeWalletTimers] scheduling deposit check', {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
      })
      scheduleInitialDepositSearch(pgDb, transaction.id, config)
    }

    log.info(`Wallet timers initialized: ${JSON.stringify(WalletTimers.getStats())}`)
  }

  function scheduleInitialDepositSearch(pgDb: PgDb, transactionId: number, config: Config) {
    WalletTimers.setInitialTimer(transactionId, async () => {
      return await processInitialDepositTransaction(pgDb, transactionId, config)
    })
  }

  const MAX_DEPOSIT_CHECK_CYCLES = 120
  const AMOUNT_TOLERANCE_NANOTON = BigInt(20_000_000) // 0.02 TON
  function compareLt(a: string, b: string): number {
    try {
      const aLt = BigInt(a || '0')
      const bLt = BigInt(b || '0')
      if (aLt === bLt) return 0
      return aLt < bLt ? -1 : 1
    } catch {
      return String(a || '').localeCompare(String(b || ''))
    }
  }

  async function processInitialDepositTransaction(pgDb: PgDb, transactionId: number, config: Config): Promise<boolean> {
    const transaction = await pgDb.getInitialDepositTransactionById(transactionId)
    if (!transaction || !['initial', 'pending'].includes(transaction.status || '')) {
      return false
    }
    if (!transaction.userId) {
      log.warn('[processInitialDepositTransaction] missing userId in deposit transaction', { transactionId })
      return false
    }

    const projectWalletAddress = config.ton.address
    if (!projectWalletAddress) {
      log.warn('[processInitialDepositTransaction] TON_ADDRESS is not configured', { transactionId })
      return true
    }

    const payload =
      transaction.payload && typeof transaction.payload === 'object'
        ? (transaction.payload as Record<string, unknown>)
        : {}
    const checkCycles = Array.isArray(payload.depositChecks) ? payload.depositChecks.length : 0
    if (checkCycles >= MAX_DEPOSIT_CHECK_CYCLES) {
      log.warn('[processInitialDepositTransaction] max cycles reached, marking as failed', { transactionId })
      await pgDb.failInitialDepositTransaction(transactionId, 'max_check_cycles_reached')
      await pgDb.logDepositCheck(transactionId, {
        cycle: checkCycles + 1,
        candidatesCount: 0,
        result: 'failed',
        details: 'max_check_cycles_reached',
      })
      return false
    }

    const walletAddressHint =
      transaction.walletId || (typeof payload.walletAddressHint === 'string' ? payload.walletAddressHint : undefined)
    const txBocHint = typeof payload.txBocHint === 'string' ? payload.txBocHint : transaction.txBoc || undefined
    let txHashHint = normalizeTxHashHint(typeof payload.txHashHint === 'string' ? payload.txHashHint : undefined)

    if (!txHashHint && txBocHint && walletAddressHint) {
      try {
        txHashHint = normalizeTxHashHint(
          (await TonTransactions.findTransactionHashFromBoc(txBocHint, walletAddressHint, config)) || undefined
        )
        if (txHashHint) {
          await pgDb.updateInitialDepositTransactionHints({
            userId: transaction.userId,
            transactionId,
            txHash: txHashHint,
          })
        }
      } catch (error) {
        log.warn('[processInitialDepositTransaction] failed to derive txHash from txBoc', { transactionId, error })
      }
    }

    const expectedAmountNanoton = BigInt(toNanotonAmount(transaction.amount))
    const minAmountNanoton = expectedAmountNanoton - AMOUNT_TOLERANCE_NANOTON
    const maxAmountNanoton = expectedAmountNanoton + AMOUNT_TOLERANCE_NANOTON
    const createdAtUnix = Math.floor(new Date(transaction.createdAt).getTime() / 1000)
    const minAllowedTimestamp = Number.isFinite(createdAtUnix) ? Math.max(0, createdAtUnix - 120) : 0

    let candidates: TonTransactions.IncomingWalletTransaction[] = []

    if (txHashHint) {
      const byHash = await TonTransactions.getIncomingTransactionByHash(txHashHint, projectWalletAddress, config)
      if (byHash) {
        if (TonTransactions.areAddressesEqual(byHash.to, projectWalletAddress, config)) {
          const amountOk =
            BigInt(byHash.amountNanoton) >= minAmountNanoton && BigInt(byHash.amountNanoton) <= maxAmountNanoton
          const minDepositOk = BigInt(byHash.amountNanoton) >= MIN_DEPOSIT_NANOTON
          const commentTargetOk = !byHash.depositCommentId || byHash.depositCommentId === transactionId
          if (
            minDepositOk &&
            commentTargetOk &&
            amountOk &&
            (!walletAddressHint || TonTransactions.areAddressesEqual(byHash.from, walletAddressHint, config))
          ) {
            candidates = [byHash]
          }
        }
      }
    }

    if (candidates.length === 0) {
      const incomingTransactions = await TonTransactions.getIncomingWalletTransactions(
        projectWalletAddress,
        config,
        500
      )
      candidates = incomingTransactions
        .filter(tx => {
          if (!TonTransactions.areAddressesEqual(tx.to, projectWalletAddress, config)) {
            return false
          }
          if (BigInt(tx.amountNanoton) < MIN_DEPOSIT_NANOTON) {
            return false
          }
          if (tx.depositCommentId && tx.depositCommentId !== transactionId) {
            return false
          }
          if (walletAddressHint && !TonTransactions.areAddressesEqual(tx.from, walletAddressHint, config)) {
            return false
          }
          // txHashHint из BOC — это hash транзакции на СТОРОНЕ ОТПРАВИТЕЛЯ. У получателя другая транзакция с другим hash.
          // Фильтр по txHash здесь отбрасывал бы корректную входящую tx — не используем.
          const amountNano = BigInt(tx.amountNanoton)
          if (amountNano < minAmountNanoton || amountNano > maxAmountNanoton) {
            return false
          }
          if (tx.utime !== null && tx.utime < minAllowedTimestamp) {
            return false
          }
          return true
        })
        .sort((a, b) => {
          const at = a.utime ?? 0
          const bt = b.utime ?? 0
          if (at !== bt) return at - bt
          return compareLt(a.lt, b.lt)
        })
    }

    const result = candidates.length > 0 ? 'found' : 'not_found'
    log.info('[depositCheck]', {
      transactionId,
      cycle: checkCycles + 1,
      candidatesCount: candidates.length,
      result,
      txHashHint: txHashHint ?? undefined,
    })
    await pgDb.logDepositCheck(transactionId, {
      cycle: checkCycles + 1,
      candidatesCount: candidates.length,
      txHashHint,
      result,
    })

    for (const candidate of candidates) {
      const confirmed = await pgDb.confirmInitialDepositTransaction(transactionId, {
        txHash: candidate.txHash,
        lt: candidate.lt,
        from: candidate.from,
        to: candidate.to,
        amountNanoton: candidate.amountNanoton,
        amountTon: candidate.amountTon,
        message: candidate.message,
        depositCommentId: candidate.depositCommentId,
        utime: candidate.utime,
      })

      if (confirmed.success && confirmed.userId && confirmed.newBalance) {
        const formattedBalance = formatBalance(confirmed.newBalance)
        WebSocketManager.sendToUser(confirmed.userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'completed',
          balance: formattedBalance,
        })
        WebSocketManager.sendToUser(confirmed.userId, {
          type: 'balanceChanged',
          balance: formattedBalance,
        })
        return false
      }

      if (!confirmed.success && confirmed.reason === 'hash_already_used') {
        await pgDb.failInitialDepositTransaction(transactionId, 'tx_hash_already_used')
        await pgDb.logDepositCheck(transactionId, {
          cycle: checkCycles + 1,
          candidatesCount: candidates.length,
          txHashHint,
          result: 'failed',
          details: 'tx_hash_already_used',
        })
        WebSocketManager.sendToUser(transaction.userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'failed',
          reason: 'This blockchain transaction hash has already been used',
        })
        return false
      }

      if (!confirmed.success && confirmed.reason === 'transaction_not_initial') {
        return false
      }
    }

    return true
  }

  // Вычисляет шанс победы в процентах (округление до сотых)
  function calculateWinChance(betAmount: Decimal, totalBank: Decimal): number {
    if (totalBank.isZero()) {
      return 0
    }
    const chance = betAmount.div(totalBank).mul(100)
    // Округление до сотых (2 знака после запятой)
    return Math.round(chance.mul(100).toNumber()) / 100
  }

  // Вычисляет шанс победы в процентах (округление до сотых)
  function calculateWinChance32(winnerColor: 'light' | 'dark' | 'red'): number {
    if (winnerColor === 'red') {
      return 2
    }
    return 49
  }

  // Получает ТОП победителя из раунда с максимальным банком (со статусом finished) для конкретного режима игры
  async function getTopWinner(pgDb: PgDb, game: GameMode) {
    const data = await pgDb.getFinishedRoundWithMaxBank(game)
    if (!data) {
      return null
    }

    const { round, winnerBet, totalBank } = data

    if (!winnerBet) {
      return null
    }

    const winChance =
      game === '32'
        ? calculateWinChance32(round.winnerColor as 'light' | 'dark' | 'red')
        : calculateWinChance(winnerBet.amount, totalBank)

    const winnerColor =
      round.winnerColor && ['light', 'dark', 'red'].includes(round.winnerColor)
        ? (round.winnerColor as 'light' | 'dark' | 'red')
        : undefined

    return {
      userId: round.winnerUserId!,
      firstName: winnerBet.firstName ?? undefined,
      avatar: winnerBet.avatar ?? undefined,
      winChance,
      bankAmount: formatBalance(totalBank.toFixed(8)),
      winnerColor,
    }
  }

  // Получает победителя предыдущего раунда для конкретного режима игры
  async function getPreviousRoundWinner(pgDb: PgDb, game: GameMode) {
    const previousRound = await pgDb.getPreviousFinishedRound(game)
    if (!previousRound) {
      return null
    }

    const winChance = calculateWinChance(previousRound.winnerBetAmount, previousRound.totalBank)

    const winnerColor =
      previousRound.winnerColor && ['light', 'dark', 'red'].includes(previousRound.winnerColor)
        ? (previousRound.winnerColor as 'light' | 'dark' | 'red')
        : undefined

    return {
      userId: previousRound.winnerUserId,
      firstName: previousRound.winnerFirstName,
      avatar: previousRound.winnerAvatar,
      winChance,
      bankAmount: formatBalance(previousRound.totalBank.toFixed(8)),
      winnerColor,
    }
  }

  type WinnerData = {
    userId: string
    firstName?: string
    avatar?: string
    winChance: number
    bankAmount: string
    winnerColor?: 'light' | 'dark' | 'red'
  }

  // Отправляет события о ТОП победителе и победителе предыдущего раунда для конкретного режима игры
  export async function sendWinnerEvents(pgDb: PgDb, game: GameMode, targetUserId?: string) {
    const topWinner = await getTopWinner(pgDb, game)
    const previousWinner = await getPreviousRoundWinner(pgDb, game)

    const sendMessage = (message: any) => {
      if (targetUserId) {
        WebSocketManager.sendToUser(targetUserId, message)
      } else {
        WebSocketManager.broadcast(message)
      }
    }

    // Формируем state в формате { [game]: winnerData }
    const topWinnerState: Record<GameMode, WinnerData | null> = {} as Record<GameMode, WinnerData | null>
    topWinnerState[game] = topWinner

    const previousWinnerState: Record<GameMode, WinnerData | null> = {} as Record<GameMode, WinnerData | null>
    previousWinnerState[game] = previousWinner

    sendMessage({
      type: 'topWinner',
      state: topWinnerState,
    })

    sendMessage({
      type: 'previousRoundWinner',
      state: previousWinnerState,
    })
  }

  // Отправляет события о ТОП победителе и победителе предыдущего раунда для ВСЕХ режимов игры
  export async function sendAllWinnerEvents(pgDb: PgDb, targetUserId?: string) {
    const sendMessage = (message: any) => {
      if (targetUserId) {
        WebSocketManager.sendToUser(targetUserId, message)
      } else {
        WebSocketManager.broadcast(message)
      }
    }

    const topWinnerState: Record<GameMode, WinnerData | null> = {} as Record<GameMode, WinnerData | null>
    const previousWinnerState: Record<GameMode, WinnerData | null> = {} as Record<GameMode, WinnerData | null>

    for (const game of ALL_GAME_MODES) {
      topWinnerState[game] = await getTopWinner(pgDb, game)
      previousWinnerState[game] = await getPreviousRoundWinner(pgDb, game)
    }

    sendMessage({
      type: 'topWinner',
      state: topWinnerState,
    })

    sendMessage({
      type: 'previousRoundWinner',
      state: previousWinnerState,
    })
  }

  function validateAmount(amount: string, field: string) {
    if (typeof amount !== 'string') {
      throw new Errors.Client('BAD_AMOUNT_TYPE', `${field} amount must be a string`)
    }
    let dec: Decimal
    try {
      dec = new Decimal(amount)
    } catch {
      throw new Errors.Client('BAD_AMOUNT_FORMAT', `${field} amount has invalid format`)
    }
    if (!dec.isFinite() || dec.lte(0)) {
      throw new Errors.Client('BAD_AMOUNT_VALUE', `${field} amount must be positive number`)
    }
  }

  function validateWithdrawAmount(amount: string) {
    const dec = new Decimal(amount)
    if (dec.lt(1)) {
      throw new Errors.Client('WITHDRAW_MIN_AMOUNT', 'Минимальная сумма для вывода: 1 TON')
    }
  }

  function validateDepositAmount(amount: string) {
    const dec = new Decimal(amount)
    if (dec.lt(MIN_DEPOSIT_TON)) {
      throw new Errors.Client('DEPOSIT_MIN_AMOUNT', `Минимальная сумма для депозита: ${MIN_DEPOSIT_TON} TON`)
    }
  }

  function normalizeAmount(amount: string): string {
    return new Decimal(amount).toFixed(8)
  }

  function toNanotonAmount(amount: string): string {
    return new Decimal(amount).mul(1000000000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
  }

  function normalizeTxHashHint(raw?: string): string | undefined {
    if (!raw) return undefined
    const value = String(raw).trim()
    if (!value) return undefined
    return /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : undefined
  }

  function buildAuthorizationHeaderFromToken(authToken: string): string {
    const token = String(authToken || '').trim()
    if (!token) {
      throw new Errors.Client('MISSING_AUTH_TOKEN', 'authToken is required')
    }
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  async function confirmDepositInBackground(args: {
    pgDb: PgDb
    userId: string
    transactionId: number
    txBoc: string
    walletAddress: string
    config: Config
  }) {
    const { pgDb, userId, transactionId, txBoc, walletAddress, config } = args

    const startedAt = Date.now()
    const mask = (s: string, keepStart = 6, keepEnd = 6) => {
      if (!s) return s
      if (s.length <= keepStart + keepEnd + 3) return s
      return `${s.slice(0, keepStart)}...${s.slice(-keepEnd)}`
    }

    try {
      const projectAddress = config.ton.address
      log.info('[confirmDepositInBackground] start', {
        userId,
        transactionId,
        walletAddress: mask(walletAddress),
        txBocLen: txBoc?.length ?? 0,
        projectAddress: projectAddress ? mask(projectAddress) : null,
      })

      if (!projectAddress) {
        log.warn('[confirmDepositInBackground] TON_ADDRESS is not configured -> fail pending deposit', {
          userId,
          transactionId,
        })
        await pgDb.failDepositTransaction(transactionId)
        log.info('[confirmDepositInBackground] ws: depositConfirmed failed (TON_ADDRESS missing)', {
          userId,
          transactionId,
          elapsedMs: Date.now() - startedAt,
        })
        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'failed',
          reason: 'TON_ADDRESS is not configured',
        })
        return
      }

      log.info('[confirmDepositInBackground] stage=beforeBalance getWalletInfo', { userId, transactionId })
      const beforeInfo = await TonTransactions.getWalletInfo(projectAddress, config)
      const beforeBalance = BigInt(beforeInfo.balanceNanoton ?? 0n)
      log.info('[confirmDepositInBackground] stage=beforeBalance ok', {
        userId,
        transactionId,
        beforeBalanceNanoton: beforeBalance.toString(),
      })

      // (2-3) подождать и найти tx в сети (Toncenter может индексировать дольше 2–3 секунд)
      const retryDelaysMs = [2000 + Math.floor(Math.random() * 1000), 3000, 5000, 8000, 13000]
      let txHash: string | null = null
      for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
        const delayMs = retryDelaysMs[attempt]
        log.info('[confirmDepositInBackground] stage=findTxHashFromBoc delay', {
          userId,
          transactionId,
          attempt: attempt + 1,
          maxAttempts: retryDelaysMs.length,
          delayMs,
        })
        await new Promise(resolve => setTimeout(resolve, delayMs))

        log.info('[confirmDepositInBackground] stage=findTxHashFromBoc', {
          userId,
          transactionId,
          attempt: attempt + 1,
          maxAttempts: retryDelaysMs.length,
          walletAddress: mask(walletAddress),
          txBocLen: txBoc?.length ?? 0,
        })
        txHash = await TonTransactions.findTransactionHashFromBoc(txBoc, walletAddress, config)
        if (txHash) break

        log.warn('[confirmDepositInBackground] stage=findTxHashFromBoc -> txHash not found (still indexing?)', {
          userId,
          transactionId,
          attempt: attempt + 1,
          maxAttempts: retryDelaysMs.length,
          elapsedMs: Date.now() - startedAt,
        })

        // Для UX в модалке: не фейлим сразу, держим pending.
        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'pending',
        })
      }

      if (!txHash) {
        log.warn('[confirmDepositInBackground] stage=findTxHashFromBoc -> txHash not found after retries', {
          userId,
          transactionId,
          elapsedMs: Date.now() - startedAt,
        })
        await pgDb.failDepositTransaction(transactionId)
        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'failed',
          reason: 'Transaction not found in blockchain (timeout)',
        })
        return
      }

      log.info('[confirmDepositInBackground] stage=findTxHashFromBoc ok', {
        userId,
        transactionId,
        txHash: mask(txHash),
      })

      // (4) баланс нашего кошелька увеличился
      // Баланс тоже может отставать в API, поэтому даем пару попыток прежде чем фейлить.
      const afterBalanceRetryDelaysMs = [0, 2000, 4000, 8000, 13000, 21000, 34000]
      let afterBalance = beforeBalance
      for (let attempt = 0; attempt < afterBalanceRetryDelaysMs.length; attempt++) {
        const delayMs = afterBalanceRetryDelaysMs[attempt]
        if (delayMs > 0) {
          log.info('[confirmDepositInBackground] stage=afterBalance delay', {
            userId,
            transactionId,
            attempt: attempt + 1,
            maxAttempts: afterBalanceRetryDelaysMs.length,
            delayMs,
          })
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }

        log.info('[confirmDepositInBackground] stage=afterBalance getWalletInfo', {
          userId,
          transactionId,
          attempt: attempt + 1,
          maxAttempts: afterBalanceRetryDelaysMs.length,
        })
        const afterInfo = await TonTransactions.getWalletInfo(projectAddress, config)
        afterBalance = BigInt(afterInfo.balanceNanoton ?? 0n)
        if (afterBalance > beforeBalance) break

        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'pending',
        })
      }

      if (afterBalance <= beforeBalance) {
        log.warn('[confirmDepositInBackground] stage=afterBalance -> project balance did not increase after retries', {
          userId,
          transactionId,
          beforeBalanceNanoton: beforeBalance.toString(),
          afterBalanceNanoton: afterBalance.toString(),
          elapsedMs: Date.now() - startedAt,
        })
        await pgDb.failDepositTransaction(transactionId)
        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'failed',
          reason: 'Project wallet balance did not increase (timeout)',
        })
        return
      }

      log.info('[confirmDepositInBackground] stage=afterBalance ok', {
        userId,
        transactionId,
        beforeBalanceNanoton: beforeBalance.toString(),
        afterBalanceNanoton: afterBalance.toString(),
      })

      // После успешных проверок начисляем баланс в БД
      log.info('[confirmDepositInBackground] stage=confirmDepositTransaction', { userId, transactionId })
      const confirmedResult = await pgDb.confirmDepositTransaction(transactionId)
      if (confirmedResult.success && confirmedResult.userId && confirmedResult.newBalance) {
        const newFormattedBalance = formatBalance(confirmedResult.newBalance)
        log.info('[confirmDepositInBackground] stage=confirmDepositTransaction ok', {
          userId: confirmedResult.userId,
          transactionId,
          newBalance: newFormattedBalance,
          elapsedMs: Date.now() - startedAt,
        })
        log.info('[confirmDepositInBackground] ws: depositConfirmed completed', {
          userId: confirmedResult.userId,
          transactionId,
        })
        WebSocketManager.sendToUser(confirmedResult.userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'completed',
          balance: newFormattedBalance,
        })
        log.info('[confirmDepositInBackground] ws: balanceChanged', {
          userId: confirmedResult.userId,
          transactionId,
        })
        WebSocketManager.sendToUser(confirmedResult.userId, {
          type: 'balanceChanged',
          balance: newFormattedBalance,
        })
      } else {
        log.warn(
          '[confirmDepositInBackground] stage=confirmDepositTransaction -> already processed or invalid result',
          {
            userId,
            transactionId,
            confirmedSuccess: confirmedResult.success,
            confirmedUserId: confirmedResult.userId ?? null,
            hasNewBalance: Boolean(confirmedResult.newBalance),
            elapsedMs: Date.now() - startedAt,
          }
        )
        log.info('[confirmDepositInBackground] ws: depositConfirmed failed (already processed)', {
          userId,
          transactionId,
        })
        WebSocketManager.sendToUser(userId, {
          type: 'depositConfirmed',
          transactionId,
          status: 'failed',
          reason: 'Transaction already processed',
        })
      }
    } catch (err) {
      log.error('[confirmDepositInBackground] unhandled error confirming deposit', {
        userId,
        transactionId,
        walletAddress: mask(walletAddress),
        txBocLen: txBoc?.length ?? 0,
        err,
      })
      try {
        await pgDb.failDepositTransaction(transactionId)
      } catch (failErr) {
        log.error('[confirmDepositInBackground] failed to mark deposit as failed', {
          userId,
          transactionId,
          err: failErr,
        })
      }
      log.info('[confirmDepositInBackground] ws: depositConfirmed failed (internal error)', { userId, transactionId })
      WebSocketManager.sendToUser(userId, {
        type: 'depositConfirmed',
        transactionId,
        status: 'failed',
        reason: 'Internal error',
      })
    }
  }
}
