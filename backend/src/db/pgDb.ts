// import { Whitelist } from '@src/core/Whitelist'

import type {
  GameMode,
  HistoryRoundWinner,
  InsertNftsIfNotExistsResult,
  Referral_Resp,
  Solo32ColorScenario,
  UpsertNftsResult,
  UserShortDTO,
  UserStats,
} from '@shared-protocol/types'
import { FREE_ROLL_PRIZES, getReferralRewardPercent } from '@shared-protocol/types'
import type { Solo32Color } from '@src/core/constants'
import {
  DUEL_DOUBLE_BET_DELAY_MS,
  LIMIT_MAX_DIFF_PERCENT,
  LIMIT_MAX_FIRST_BET,
  REWARD_POOL_CALC_START_DATE_UTC,
  ROUND_DURATION_MS,
  SOLO_32_COLORS,
  SOLO_32_MAX_BET,
  SOLO_32_WIN_MULTIPLIERS,
  TAX_PERCENTAGE,
} from '@src/core/constants'
import { RoundTimers } from '@src/core/roundTimers'
import { Db } from '@src/Db'
import { Errors } from '@src/Errors'
import { getAuthTokenHash } from '@src/utils'
import Decimal from 'decimal.js'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import {
  bets,
  NewNft,
  NewPromocode,
  NewTransaction,
  NewUser,
  NewWallet,
  nfts,
  promocodes,
  rounds,
  Session,
  sessions,
  transactions,
  users,
  wallets,
  withdrawRequests,
} from './schema'

export type PgDb = Awaited<ReturnType<typeof create>>

function hash32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const create = ({ db }: Db) => {
  type WithdrawRequestStatus = 'pending' | 'payed' | 'rejected'

  type RewardPoolStats = {
    totalLosingAmount: Decimal
    totalWonAmount: Decimal
    allowedWinAmount: Decimal
  }

  // Возвращает доступный reward-пул для выплат в режимах 32 и freeRoll.
  // Формула: (50% от всех проигрышей в 32) - (все уже выплаченные суммы в 32/freeRoll).
  async function getModesRewardPoolAvailable(tx: any): Promise<RewardPoolStats> {
    // Потери пользователей в 32 = все TON ставки, кроме выигрышного цвета
    const [lossesRow] = await tx
      .select({
        totalLosingAmount: sql<string>`COALESCE(
          SUM(
            CASE
              WHEN ${bets.type} = 'ton' AND ${bets.color} IS DISTINCT FROM ${rounds.winnerColor}
              THEN ${bets.amount}::numeric
              ELSE 0
            END
          ),
          0
        )`,
      })
      .from(rounds)
      .leftJoin(bets, and(eq(bets.roundId, rounds.id), eq(bets.game, rounds.game)))
      .where(
        and(
          eq(rounds.game, '32'),
          eq(rounds.status, 'finished'),
          isNotNull(rounds.winnerColor),
          gte(rounds.updatedAt, REWARD_POOL_CALC_START_DATE_UTC)
        )
      )

    // Выплаты, которые уже были выданы и должны уменьшать reward-пул:
    // - type='win' с payload.game='32'
    // - type='freeRoll' (amount здесь уже равен выданному призу)
    const [winsRow] = await tx
      .select({
        totalWonAmount: sql<string>`COALESCE(
          SUM(
            CASE
              WHEN ${transactions.type} = 'win'
                AND ${transactions.status} = 'completed'
                AND "transactions"."payload"->>'game' = '32'
              THEN ${transactions.amount}::numeric
              WHEN ${transactions.type} = 'freeRoll'
                AND ${transactions.status} = 'completed'
              THEN ${transactions.amount}::numeric
              ELSE 0
            END
          ),
          0
        )`,
      })
      .from(transactions)
      .where(gte(transactions.createdAt, REWARD_POOL_CALC_START_DATE_UTC))

    const totalLosingAmount = new Decimal(lossesRow?.totalLosingAmount || '0')
    // В reward-пул уходит только половина проигрышей (вторая половина остаётся платформе как tax).
    const rewardPoolFromLosses = totalLosingAmount.mul(50).div(100)
    const totalWonAmount = new Decimal(winsRow?.totalWonAmount || '0')
    const available = rewardPoolFromLosses.minus(totalWonAmount)
    console.info(`[RewardPool] total 32 losses: ${totalLosingAmount.toFixed(8)} TON`)
    console.info(`[RewardPool] total paid wins (32 + freeRoll): ${totalWonAmount.toFixed(8)} TON`)

    // Пул не может быть отрицательным.
    const allowedWinAmount = available.gt(0) ? available : new Decimal(0)
    console.info(`[RewardPool] allowed win amount: ${allowedWinAmount.toFixed(8)} TON`)
    return {
      totalLosingAmount,
      totalWonAmount,
      allowedWinAmount,
    }
  }

  async function findUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user) return undefined
    return user
  }

  async function addUser(user: NewUser) {
    await db.insert(users).values(user)
  }

  async function addSession(session: Session) {
    return db.insert(sessions).values(session)
  }

  async function softDeleteUserSessions(userId: string): Promise<number> {
    const result = await db
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
      .execute()

    return result.rowCount || 0
  }

  async function getUserSession(userId: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
    if (!session) return undefined
    return session
  }

  async function getSessionOrUndefined(authorization: string): Promise<Session | undefined> {
    const authTokenHash = getAuthTokenHash(authorization)
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, authTokenHash), isNull(sessions.deletedAt)))
    if (!session || session.logoutAt) {
      return undefined
    }

    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.userId)).limit(1)
    if (!user || user.role === 'banned') {
      return undefined
    }

    return session
  }

  async function getSession(authorization: string): Promise<Session> {
    const authTokenHash = getAuthTokenHash(authorization)

    const [session] = await db.select().from(sessions).where(eq(sessions.id, authTokenHash))
    if (!session || session.logoutAt) {
      return Promise.reject(new Errors.Unauthorized('NotFound_Session'))
    }
    if (session.deletedAt) {
      await db
        .update(sessions)
        .set({
          deletedAt: null,
        })
        .where(eq(sessions.id, authTokenHash))
    }

    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.userId)).limit(1)
    if (!user || user.role === 'banned') {
      throw new Errors.Unauthorized('USER_BANNED', 'This user is banned')
    }

    // if (!Whitelist.some(id => id === session.userId)) throw new Errors.Client('AuthError')

    return session
  }

  async function searchUsersForAdmin(rawQuery: string, limit = 50) {
    const query = String(rawQuery || '').trim()
    if (!query) return []

    const safeLike = query.toLowerCase().replace(/[%_\\]/g, '\\$&')
    const likePattern = `%${safeLike}%`
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50))

    return await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .where(
        or(
          sql`LOWER(${users.username}) LIKE ${likePattern} ESCAPE '\\'`,
          sql`LOWER(COALESCE(${users.firstName}, '')) LIKE ${likePattern} ESCAPE '\\'`,
          sql`LOWER(COALESCE(${users.lastName}, '')) LIKE ${likePattern} ESCAPE '\\'`,
          sql`LOWER(${users.id}) LIKE ${likePattern} ESCAPE '\\'`
        )
      )
      .orderBy(desc(users.createdAt))
      .limit(boundedLimit)
  }

  async function toggleUserBanRole(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      throw new Errors.Client('USER_NOT_FOUND', 'User not found')
    }
    const nextRole = user.role === 'banned' ? 'user' : 'banned'
    await db.update(users).set({ role: nextRole }).where(eq(users.id, userId))

    return {
      ...user,
      role: nextRole,
    }
  }

  async function setReferral(referrerId: string, userId: string) {
    await db.update(users).set({ invitee: referrerId, trafficId: 'viral' }).where(eq(users.invitee, userId))
  }

  async function getMyProfile(userId: string): Promise<UserShortDTO> {
    return await db.transaction(async tx => {
      const result = await tx
        .select({
          user: {
            id: users.id,
            avatar: users.avatar,
            username: users.username,
            balance: users.balance,
          },
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!result[0]) {
        throw new Errors.Unauthorized('User not found')
      }

      return {
        ...result[0].user,
        balance: result[0].user.balance || '0',
      }
    })
  }

  // ----------------- WALLET OPERATIONS -----------------
  async function findUserIdByWalletAddress(walletAddress: string): Promise<string | undefined> {
    const [row] = await db
      .select({ userId: wallets.userId })
      .from(wallets)
      .where(and(eq(wallets.id, walletAddress), isNull(wallets.deletedAt)))
      .limit(1)
    return row?.userId
  }

  async function upsertNfts(rows: NewNft[]): Promise<UpsertNftsResult> {
    if (!rows.length) return { insertedOrUpdated: 0 }

    const res = await db
      .insert(nfts)
      .values(rows)
      .onConflictDoUpdate({
        target: nfts.address,
        set: {
          name: sql`excluded."name"`,
          description: sql`excluded."description"`,
          image: sql`excluded."image"`,
          animationUrl: sql`excluded."animationUrl"`,
          attributes: sql`excluded."attributes"`,
          preview5x5: sql`excluded."preview5x5"`,
          preview100x100: sql`excluded."preview100x100"`,
          preview500x500: sql`excluded."preview500x500"`,
          preview1500x1500: sql`excluded."preview1500x1500"`,
          // userId обновляем только если он вычислен (не null)
          userId: sql`COALESCE(excluded."userId", "nfts"."userId")`,
          updatedAt: new Date(),
          // price/status не трогаем — price=10 только при первой вставке, status по умолчанию disabled
        },
      })
      .execute()

    return { insertedOrUpdated: res.rowCount || rows.length }
  }

  async function insertNftsIfNotExists(rows: NewNft[]): Promise<InsertNftsIfNotExistsResult> {
    if (!rows.length) return { inserted: 0 }

    const res = await db.insert(nfts).values(rows).onConflictDoNothing({ target: nfts.address }).execute()

    return { inserted: res.rowCount || 0 }
  }

  async function getActiveNftsWithoutUser() {
    return await db
      .select({
        address: nfts.address,
        name: nfts.name,
        description: nfts.description,
        image: nfts.image,
        animationUrl: nfts.animationUrl,
        attributes: nfts.attributes,
        preview5x5: nfts.preview5x5,
        preview100x100: nfts.preview100x100,
        preview500x500: nfts.preview500x500,
        preview1500x1500: nfts.preview1500x1500,
        price: nfts.price,
        status: nfts.status,
      })
      .from(nfts)
      .where(and(eq(nfts.status, 'active'), isNull(nfts.userId)))
  }

  async function getActiveNftsByUserId(userId: string) {
    return await db
      .select({
        address: nfts.address,
        name: nfts.name,
        description: nfts.description,
        image: nfts.image,
        animationUrl: nfts.animationUrl,
        attributes: nfts.attributes,
        preview5x5: nfts.preview5x5,
        preview100x100: nfts.preview100x100,
        preview500x500: nfts.preview500x500,
        preview1500x1500: nfts.preview1500x1500,
        price: nfts.price,
        status: nfts.status,
      })
      .from(nfts)
      .where(and(eq(nfts.status, 'active'), eq(nfts.userId, userId)))
    // Исключаем NFT со статусом 'bet' (они в игре)
  }

  async function getNftsByAddresses(addresses: string[]) {
    if (addresses.length === 0) return []
    return await db
      .select({
        address: nfts.address,
        name: nfts.name,
        description: nfts.description,
        image: nfts.image,
        preview100x100: nfts.preview100x100,
        preview500x500: nfts.preview500x500,
        price: nfts.price,
      })
      .from(nfts)
      .where(inArray(nfts.address, addresses))
  }

  // ----------------- GAME / BALANCE OPERATIONS -----------------

  async function deposit(
    userId: string,
    amount: string,
    walletAddress?: string,
    txBoc?: string,
    options:
      | boolean
      | {
          confirmed?: boolean
          status?: 'initial' | 'pending' | 'completed'
          payload?: Record<string, unknown>
        } = false
  ) {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_DEPOSIT_AMOUNT', 'Amount must be positive')
    }

    const confirmed = typeof options === 'boolean' ? options : options.confirmed === true
    const status = typeof options === 'boolean' ? (confirmed ? 'completed' : 'pending') : options.status
    const payload = typeof options === 'boolean' ? undefined : options.payload
    const transactionStatus = status || (confirmed ? 'completed' : 'pending')

    return db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      // Получаем или создаем кошелек, если передан адрес (внутри транзакции)
      let walletId: string | undefined
      if (walletAddress) {
        // Проверяем, существует ли кошелек
        const [existingWallet] = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.id, walletAddress), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
          .limit(1)

        if (existingWallet) {
          walletId = existingWallet.id
        } else {
          // Создаем новый кошелек
          const newWallet: NewWallet = {
            id: walletAddress,
            userId,
          }
          const [createdWallet] = await tx.insert(wallets).values(newWallet).returning()
          walletId = createdWallet.id
        }
      }

      const txRow: NewTransaction = {
        userId,
        walletId,
        type: 'deposit',
        amount: amountDec.toFixed(8),
        status: transactionStatus,
        txBoc,
        payload,
      }
      const [createdTx] = await tx.insert(transactions).values(txRow).returning()

      let newBalance = user.balance || '0'
      if (confirmed || transactionStatus === 'completed') {
        const currentBalance = new Decimal(user.balance || '0')
        newBalance = currentBalance.plus(amountDec).toFixed(8)
        await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))
      }

      return { balance: newBalance, transactionId: createdTx.id, confirmed }
    })
  }

  async function findDepositTransactionByClientRequestId(userId: string, clientRequestId: string) {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'deposit'),
          sql`"transactions"."payload"->>'clientRequestId' = ${clientRequestId}`
        )
      )
      .orderBy(desc(transactions.id))
      .limit(1)
    return transaction
  }

  async function createInitialDepositTransaction(
    userId: string,
    amount: string,
    walletAddress?: string,
    clientRequestId?: string
  ) {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_DEPOSIT_AMOUNT', 'Amount must be positive')
    }

    const normalizedClientRequestId = clientRequestId?.trim() || undefined

    return db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      if (normalizedClientRequestId) {
        const [existing] = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.type, 'deposit'),
              sql`"transactions"."payload"->>'clientRequestId' = ${normalizedClientRequestId}`
            )
          )
          .orderBy(desc(transactions.id))
          .limit(1)

        if (existing) {
          return {
            balance: user.balance || '0',
            transactionId: existing.id,
            status: existing.status,
            isNew: false,
          }
        }
      }

      let walletId: string | undefined
      if (walletAddress) {
        const [existingWallet] = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.id, walletAddress), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
          .limit(1)

        if (existingWallet) {
          walletId = existingWallet.id
        } else {
          const [createdWallet] = await tx
            .insert(wallets)
            .values({
              id: walletAddress,
              userId,
            })
            .returning()
          walletId = createdWallet.id
        }
      }

      const payload: Record<string, unknown> = {
        initialRequestedAt: new Date().toISOString(),
      }
      if (normalizedClientRequestId) {
        payload.clientRequestId = normalizedClientRequestId
      }
      if (walletAddress) {
        payload.walletAddressHint = walletAddress
      }

      const [createdTx] = await tx
        .insert(transactions)
        .values({
          userId,
          walletId,
          type: 'deposit',
          amount: amountDec.toFixed(8),
          status: 'initial',
          payload,
        })
        .returning()

      return {
        balance: user.balance || '0',
        transactionId: createdTx.id,
        status: createdTx.status,
        isNew: true,
      }
    })
  }

  async function updateInitialDepositTransactionHints(args: {
    userId: string
    transactionId?: number
    clientRequestId?: string
    walletAddress?: string
    txBoc?: string
    txHash?: string
  }) {
    const { userId, transactionId, clientRequestId, walletAddress, txBoc, txHash } = args
    const normalizedClientRequestId = clientRequestId?.trim() || undefined

    return db.transaction(async tx => {
      let target: typeof transactions.$inferSelect | undefined

      if (typeof transactionId === 'number') {
        const [byId] = await tx
          .select()
          .from(transactions)
          .where(
            and(eq(transactions.id, transactionId), eq(transactions.userId, userId), eq(transactions.type, 'deposit'))
          )
          .limit(1)
        target = byId
      } else if (normalizedClientRequestId) {
        const [byClientRequest] = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.type, 'deposit'),
              sql`"transactions"."payload"->>'clientRequestId' = ${normalizedClientRequestId}`
            )
          )
          .orderBy(desc(transactions.id))
          .limit(1)
        target = byClientRequest
      }

      if (!target) {
        return null
      }

      const allowedStatuses = ['initial', 'pending']
      if (!allowedStatuses.includes(target.status || '')) {
        return {
          transactionId: target.id,
          status: target.status,
          updated: false,
        }
      }

      let walletId = target.walletId || undefined
      if (walletAddress) {
        const [existingWallet] = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.id, walletAddress), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
          .limit(1)

        if (existingWallet) {
          walletId = existingWallet.id
        } else {
          const [createdWallet] = await tx
            .insert(wallets)
            .values({
              id: walletAddress,
              userId,
            })
            .returning()
          walletId = createdWallet.id
        }
      }

      const nextPayload: Record<string, unknown> =
        target.payload && typeof target.payload === 'object' ? { ...(target.payload as Record<string, unknown>) } : {}
      if (normalizedClientRequestId) {
        nextPayload.clientRequestId = normalizedClientRequestId
      }
      if (walletAddress) {
        nextPayload.walletAddressHint = walletAddress
      }
      if (txHash) {
        nextPayload.txHashHint = txHash
      }
      if (txBoc) {
        nextPayload.txBocHint = txBoc
      }
      nextPayload.lastHintsUpdatedAt = new Date().toISOString()

      const hasHints = Boolean(txBoc || txHash || normalizedClientRequestId)
      const newStatus = target.status === 'initial' && hasHints ? 'pending' : target.status

      const [updatedTx] = await tx
        .update(transactions)
        .set({
          walletId,
          status: newStatus,
          txBoc: txBoc || target.txBoc || undefined,
          payload: nextPayload as any,
        })
        .where(eq(transactions.id, target.id))
        .returning()

      return {
        transactionId: updatedTx.id,
        status: updatedTx.status,
        updated: true,
      }
    })
  }

  async function getInitialDepositTransactions() {
    return await db
      .select()
      .from(transactions)
      .where(and(inArray(transactions.status, ['initial', 'pending']), eq(transactions.type, 'deposit')))
      .orderBy(asc(transactions.createdAt), asc(transactions.id))
  }

  async function getInitialDepositTransactionById(transactionId: number) {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.type, 'deposit')))
      .limit(1)
    return transaction
  }

  type DepositCheckLogEntry = {
    at: string
    cycle: number
    candidatesCount: number
    txHashHint?: string
    result: 'found' | 'not_found' | 'failed'
    details?: string
  }

  async function logDepositCheck(transactionId: number, logEntry: Omit<DepositCheckLogEntry, 'at'>): Promise<void> {
    const [row] = await db
      .select({ payload: transactions.payload })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1)
    if (!row) return

    const entry: DepositCheckLogEntry = {
      ...logEntry,
      at: new Date().toISOString(),
    }
    const prev = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {}
    const checks = Array.isArray(prev.depositChecks) ? [...prev.depositChecks, entry] : [entry]

    await db
      .update(transactions)
      .set({ payload: { ...prev, depositChecks: checks } as any })
      .where(eq(transactions.id, transactionId))
  }

  async function failInitialDepositTransaction(transactionId: number, reason: string): Promise<boolean> {
    const [row] = await db
      .select({ payload: transactions.payload })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.type, 'deposit'),
          inArray(transactions.status, ['initial', 'pending'])
        )
      )
      .limit(1)
    if (!row) return false

    const prev = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {}
    const res = await db
      .update(transactions)
      .set({ status: 'failed', payload: { ...prev, failReason: reason } as any })
      .where(eq(transactions.id, transactionId))
      .returning()
    return res.length > 0
  }

  async function confirmInitialDepositTransaction(
    transactionId: number,
    blockchainMatch: {
      txHash: string
      lt: string
      from: string
      to: string
      amountNanoton: string
      amountTon: string
      message?: string
      depositCommentId?: number
      utime: number | null
    }
  ) {
    return db.transaction(async tx => {
      const normalizedOnchainTxHash = String(blockchainMatch.txHash || '')
        .trim()
        .toLowerCase()
      if (!normalizedOnchainTxHash) {
        return { success: false as const, reason: 'missing_tx_hash' as const }
      }
      const normalizedLt = String(blockchainMatch.lt || '').trim()
      const normalizedLtHashKey = normalizedLt ? `${normalizedLt}:${normalizedOnchainTxHash}` : normalizedOnchainTxHash

      const [transaction] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, transactionId),
            eq(transactions.type, 'deposit'),
            inArray(transactions.status, ['initial', 'pending'])
          )
        )
        .limit(1)

      if (!transaction) {
        return { success: false as const, reason: 'transaction_not_initial' as const }
      }

      if (!transaction.userId) {
        return { success: false as const, reason: 'missing_user' as const }
      }

      const [alreadyUsedHash] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.type, 'deposit'),
            sql`(
              COALESCE("transactions"."payload"->>'onchainLtHashKey', '') = ${normalizedLtHashKey}
              OR LOWER(COALESCE("transactions"."payload"->>'onchainTxHash', '')) = ${normalizedOnchainTxHash}
            )`,
            sql`"transactions"."id" <> ${transactionId}`
          )
        )
        .limit(1)

      if (alreadyUsedHash) {
        return { success: false as const, reason: 'hash_already_used' as const }
      }

      const [user] = await tx.select().from(users).where(eq(users.id, transaction.userId)).limit(1)
      if (!user) {
        return { success: false as const, reason: 'user_not_found' as const }
      }

      const amountDec = new Decimal(transaction.amount)
      const currentBalance = new Decimal(user.balance || '0')
      const newBalance = currentBalance.plus(amountDec).toFixed(8)

      const nextPayload: Record<string, unknown> =
        transaction.payload && typeof transaction.payload === 'object'
          ? { ...(transaction.payload as Record<string, unknown>) }
          : {}
      nextPayload.onchainTxHash = normalizedOnchainTxHash
      nextPayload.onchainLtHashKey = normalizedLtHashKey
      nextPayload.onchainFrom = blockchainMatch.from
      nextPayload.onchainTo = blockchainMatch.to
      nextPayload.onchainAmountNanoton = blockchainMatch.amountNanoton
      nextPayload.onchainAmountTon = blockchainMatch.amountTon
      nextPayload.onchainMessage = blockchainMatch.message || null
      nextPayload.onchainDepositCommentId =
        typeof blockchainMatch.depositCommentId === 'number' ? blockchainMatch.depositCommentId : null
      nextPayload.onchainUtime = blockchainMatch.utime
      nextPayload.onchainLt = normalizedLt
      nextPayload.onchainMatchedAt = new Date().toISOString()

      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, transaction.userId))
      await tx
        .update(transactions)
        .set({
          status: 'completed',
          payload: nextPayload as any,
        })
        .where(eq(transactions.id, transaction.id))

      return {
        success: true as const,
        userId: transaction.userId,
        newBalance,
      }
    })
  }

  async function withdraw(userId: string, amount: string) {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_WITHDRAW_AMOUNT', 'Amount must be positive')
    }

    return db.transaction(async tx => {
      // Advisory lock: сериализация выводов (защита от race condition)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash32(`withdraw:${userId}`)})`)

      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      const currentBalance = new Decimal(user.balance || '0')
      if (currentBalance.lt(amountDec)) {
        throw new Errors.Client('INSUFFICIENT_FUNDS', 'Not enough balance')
      }

      const txRow: NewTransaction = {
        userId,
        type: 'withdraw',
        amount: amountDec.toFixed(8),
        status: 'pending',
      }
      const [createdTx] = await tx.insert(transactions).values(txRow).returning()

      const newBalance = currentBalance.minus(amountDec).toFixed(8)

      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))
      await tx.update(transactions).set({ status: 'completed' }).where(eq(transactions.id, createdTx.id))

      return { balance: newBalance }
    })
  }

  async function createWithdrawRequest(userId: string, amount: string, toAddress: string) {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_WITHDRAW_AMOUNT', 'Amount must be positive')
    }

    const normalizedAddress = String(toAddress || '').trim()
    if (!normalizedAddress) {
      throw new Errors.Client('INVALID_ADDRESS', 'Recipient address is required')
    }

    return db.transaction(async tx => {
      // Advisory lock защищает от гонок при параллельных запросах на вывод для одного пользователя.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash32(`withdraw_request:${userId}`)})`)

      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      const pendingRequests = await tx
        .select({ id: withdrawRequests.id })
        .from(withdrawRequests)
        .where(and(eq(withdrawRequests.userId, userId), eq(withdrawRequests.status, 'pending')))
        .limit(3)

      if (pendingRequests.length >= 3) {
        throw new Errors.Client(
          'TOO_MANY_PENDING_WITHDRAW_REQUESTS',
          'You already have 3 pending withdraw requests. Please wait until they are processed.'
        )
      }

      const currentBalance = new Decimal(user.balance || '0')
      if (currentBalance.lt(amountDec)) {
        throw new Errors.Client('INSUFFICIENT_FUNDS', 'Not enough balance')
      }

      const [created] = await tx
        .insert(withdrawRequests)
        .values({
          userId,
          amount: amountDec.toFixed(8),
          toAddress: normalizedAddress,
          status: 'pending',
        })
        .returning()

      return created
    })
  }

  async function getMyWithdrawRequests(userId: string, limit: number = 50) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    return await db
      .select()
      .from(withdrawRequests)
      .where(eq(withdrawRequests.userId, userId))
      .orderBy(desc(withdrawRequests.createdAt), desc(withdrawRequests.id))
      .limit(normalizedLimit)
  }

  async function getWithdrawRequestsForAdmin(limit: number = 200, status?: WithdrawRequestStatus) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500)
    return await db
      .select({
        id: withdrawRequests.id,
        userId: withdrawRequests.userId,
        username: users.username,
        balance: users.balance,
        amount: withdrawRequests.amount,
        toAddress: withdrawRequests.toAddress,
        status: withdrawRequests.status,
        createdAt: withdrawRequests.createdAt,
        confirmedAt: withdrawRequests.confirmedAt,
        processedByAdminId: withdrawRequests.processedByAdminId,
        txHash: withdrawRequests.txHash,
      })
      .from(withdrawRequests)
      .innerJoin(users, eq(withdrawRequests.userId, users.id))
      .where(status ? eq(withdrawRequests.status, status) : sql`TRUE`)
      .orderBy(desc(withdrawRequests.createdAt), desc(withdrawRequests.id))
      .limit(normalizedLimit)
  }

  async function getWithdrawRequestById(requestId: number) {
    const [row] = await db.select().from(withdrawRequests).where(eq(withdrawRequests.id, requestId)).limit(1)
    return row
  }

  async function setWithdrawRequestRejected(requestId: number, processedByAdminId: string) {
    const [updated] = await db
      .update(withdrawRequests)
      .set({
        status: 'rejected',
        confirmedAt: new Date(),
        processedByAdminId,
      })
      .where(and(eq(withdrawRequests.id, requestId), eq(withdrawRequests.status, 'pending')))
      .returning()
    return updated
  }

  async function setWithdrawRequestPayed(requestId: number, processedByAdminId: string, txHash?: string) {
    const [updated] = await db
      .update(withdrawRequests)
      .set({
        status: 'payed',
        confirmedAt: new Date(),
        processedByAdminId,
        txHash: txHash || null,
      })
      .where(and(eq(withdrawRequests.id, requestId), eq(withdrawRequests.status, 'pending')))
      .returning()
    return updated
  }

  async function buyNft(userId: string, nftId: string) {
    return db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      const [nft] = await tx
        .select({
          address: nfts.address,
          userId: nfts.userId,
          status: nfts.status,
          price: nfts.price,
        })
        .from(nfts)
        .where(eq(nfts.address, nftId))
        .limit(1)

      if (!nft) {
        throw new Errors.Client('NFT_NOT_FOUND', 'NFT not found')
      }
      if (nft.userId) {
        throw new Errors.Client('NFT_ALREADY_OWNED', 'NFT already has an owner')
      }
      if (nft.status !== 'active') {
        throw new Errors.Client('NFT_NOT_FOR_SALE', 'NFT is not for sale')
      }

      const priceDec = new Decimal(nft.price || '0')
      if (priceDec.lte(0)) {
        throw new Errors.Client('BAD_NFT_PRICE', 'NFT price must be positive')
      }

      const currentBalance = new Decimal(user.balance || '0')
      if (currentBalance.lt(priceDec)) {
        throw new Errors.Client('INSUFFICIENT_FUNDS', 'Not enough balance')
      }

      const buyTx: NewTransaction = {
        userId,
        type: 'buyNft',
        amount: priceDec.toFixed(8),
        status: 'pending',
        payload: { nft: nftId },
      }
      const [createdTx] = await tx.insert(transactions).values(buyTx).returning()

      const newBalance = currentBalance.minus(priceDec).toFixed(8)
      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))

      const updated = await tx
        .update(nfts)
        .set({ userId })
        .where(and(eq(nfts.address, nftId), isNull(nfts.userId), eq(nfts.status, 'active')))
        .returning({ address: nfts.address })

      if (updated.length === 0) {
        throw new Errors.Client('NFT_ALREADY_SOLD', 'NFT already sold')
      }

      await tx.update(transactions).set({ status: 'completed' }).where(eq(transactions.id, createdTx.id))

      return { balance: newBalance }
    })
  }

  async function applyPromocode(userId: string, code: string): Promise<{ balance: string; reward: string }> {
    const trimmedCode = String(code || '').trim()
    if (!trimmedCode) {
      throw new Errors.Client('PROMOCODE_INVALID', 'Код промокода не указан')
    }

    return db.transaction(async tx => {
      const [promo] = await tx
        .select()
        .from(promocodes)
        .where(sql`LOWER(${promocodes.code}) = LOWER(${trimmedCode})`)
        .limit(1)

      if (!promo) {
        throw new Errors.Client('PROMOCODE_INVALID', 'Промокод не найден')
      }
      if (!promo.active) {
        throw new Errors.Client('PROMOCODE_INACTIVE', 'Промокод недействителен')
      }
      if (promo.count <= 0) {
        throw new Errors.Client('PROMOCODE_EXHAUSTED', 'Промокод закончился')
      }

      const accountsList = (promo.payload as { accountsList?: string[] })?.accountsList ?? []
      if (accountsList.includes(userId)) {
        throw new Errors.Client('PROMOCODE_ALREADY_USED', 'Вы уже использовали этот промокод')
      }

      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      const rewardDec = new Decimal(promo.reward || '0')
      if (rewardDec.lte(0)) {
        throw new Errors.Client('PROMOCODE_INVALID', 'Награда промокода недействительна')
      }

      const currentBalance = new Decimal(user.balance || '0')
      const newBalance = currentBalance.plus(rewardDec).toFixed(8)

      const newAccountsList = [...accountsList, userId]

      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))
      await tx
        .update(promocodes)
        .set({
          count: promo.count - 1,
          payload: { accountsList: newAccountsList } as any,
          updatedAt: new Date(),
        })
        .where(eq(promocodes.id, promo.id))

      const txRow: NewTransaction = {
        userId,
        type: 'promocode',
        amount: rewardDec.toFixed(8),
        status: 'completed',
        payload: { promocodeId: promo.id, code: promo.code } as any,
      }
      await tx.insert(transactions).values(txRow)

      return { balance: newBalance, reward: rewardDec.toFixed(8) }
    })
  }

  async function getPromocodes(): Promise<(typeof promocodes.$inferSelect)[]> {
    return db.select().from(promocodes).orderBy(desc(promocodes.createdAt))
  }

  async function createPromocode(data: NewPromocode): Promise<typeof promocodes.$inferSelect> {
    const [row] = await db.insert(promocodes).values(data).returning()
    if (!row) throw new Errors.Client('PROMOCODE_CREATE_FAILED', 'Failed to create promocode')
    return row
  }

  async function updatePromocode(id: number, data: Partial<NewPromocode>): Promise<typeof promocodes.$inferSelect> {
    const [row] = await db
      .update(promocodes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(promocodes.id, id))
      .returning()
    if (!row) throw new Errors.Client('PROMOCODE_NOT_FOUND', 'Promocode not found')
    return row
  }

  async function deletePromocode(id: number): Promise<void> {
    await db.delete(promocodes).where(eq(promocodes.id, id))
  }

  async function getPromocodeUsage(
    promocodeId: number
  ): Promise<Array<{ userId: string; login: string; createdAt: Date }>> {
    const rows = await db
      .select({
        userId: transactions.userId,
        login: users.username,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(
        and(eq(transactions.type, 'promocode'), sql`("transactions"."payload"->>'promocodeId')::int = ${promocodeId}`)
      )
      .orderBy(asc(transactions.createdAt))

    return rows.filter(r => r.userId).map(r => ({ userId: r.userId!, login: r.login || '', createdAt: r.createdAt! }))
  }

  async function updateNftStatusToSend(userId: string, nftAddress: string) {
    return db.transaction(async tx => {
      // Проверяем, что NFT принадлежит пользователю и имеет статус 'active'
      const [nft] = await tx
        .select({
          address: nfts.address,
          userId: nfts.userId,
          status: nfts.status,
        })
        .from(nfts)
        .where(eq(nfts.address, nftAddress))
        .limit(1)

      if (!nft) {
        throw new Errors.Client('NFT_NOT_FOUND', 'NFT not found')
      }
      if (nft.userId !== userId) {
        throw new Errors.Client('NFT_NOT_OWNED', 'NFT does not belong to user')
      }
      if (nft.status !== 'active') {
        throw new Errors.Client('NFT_INVALID_STATUS', 'NFT status must be active')
      }

      // Обновляем статус на 'send'
      await tx.update(nfts).set({ status: 'send' }).where(eq(nfts.address, nftAddress))

      return { success: true }
    })
  }

  /**
   * Получает все pending транзакции типа deposit с txBoc
   */
  async function getPendingDepositTransactions() {
    return await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.status, 'pending'), eq(transactions.type, 'deposit'), isNotNull(transactions.txBoc)))
  }

  /**
   * Обновляет статус транзакции и баланс пользователя при подтверждении депозита
   */
  async function confirmDepositTransaction(transactionId: number) {
    return db.transaction(async tx => {
      // Получаем транзакцию
      const [transaction] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'pending')))
        .limit(1)

      if (!transaction) {
        return { success: false, message: 'Transaction not found or already processed' }
      }

      if (!transaction.userId) {
        return { success: false, message: 'Transaction userId is missing' }
      }

      // Получаем пользователя
      const [user] = await tx.select().from(users).where(eq(users.id, transaction.userId)).limit(1)
      if (!user) {
        return { success: false, message: 'User not found' }
      }

      // Обновляем баланс
      const currentBalance = new Decimal(user.balance || '0')
      const amountDec = new Decimal(transaction.amount)
      const newBalance = currentBalance.plus(amountDec).toFixed(8)

      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, transaction.userId))

      // Обновляем статус транзакции
      await tx.update(transactions).set({ status: 'completed' }).where(eq(transactions.id, transactionId))

      return { success: true, newBalance, userId: transaction.userId }
    })
  }

  /**
   * Помечает pending deposit транзакцию как failed (без изменения баланса)
   */
  async function failDepositTransaction(transactionId: number) {
    const res = await db
      .update(transactions)
      .set({ status: 'failed' })
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.status, 'pending'), eq(transactions.type, 'deposit'))
      )
      .returning()
    return { success: res.length > 0 }
  }

  async function placeBet(
    userId: string,
    amount: string,
    game: GameMode,
    now: Date,
    onRoundFinish?: (roundId: number, game: GameMode, now: Date) => Promise<void>,
    color?: 'light' | 'dark' | 'red'
  ) {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_BET_AMOUNT', 'Amount must be positive')
    }

    return db.transaction(async tx => {
      // Advisory lock: сериализация ставок пользователя в режиме (защита от race condition)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash32(`${game}:${userId}`)})`)

      // Находим пользователя
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      // Проверяем баланс пользователя (если не хватает, выбрасываем ошибку)
      const currentBalance = new Decimal(user.balance || '0')
      if (currentBalance.lt(amountDec)) {
        throw new Errors.Client('INSUFFICIENT_FUNDS', 'Not enough balance')
      }

      // Найти текущий активный раунд (waiting | running) для конкретного режима игры
      let [currentRound] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.game, game), inArray(rounds.status, ['waiting' as any, 'running' as any])))
        .orderBy(desc(rounds.id))
        .limit(1)

      // Если активного раунда нет — выбрасываем ошибку
      if (!currentRound) {
        throw new Errors.Client('NO_ACTIVE_ROUND', `No active round available [${game}]`)
      }

      // Получаем текущие ставки в раунде ДО создания новой ставки
      const existingBets = await tx
        .select({
          userId: bets.userId,
          amount: bets.amount,
          type: bets.type,
          color: bets.color,
        })
        .from(bets)
        .where(and(eq(bets.roundId, currentRound.id), eq(bets.game, currentRound.game)))

      const uniqueUserIds = new Set(existingBets.map(b => b.userId))
      const uniqueParticipantsCount = uniqueUserIds.size

      // === Проверки для режима 'duel' ===
      if (game === 'duel') {
        // В duel могут участвовать только 2 игрока
        if (uniqueParticipantsCount >= 2 && !uniqueUserIds.has(userId)) {
          throw new Errors.Client('DUEL_FULL', 'Duel round already has 2 players')
        }
      }

      // === Проверки для режима '32' ===
      if (game === '32') {
        // В 32 цвет обязателен: без него невозможно корректно посчитать сценарии выплат.
        if (!color || !SOLO_32_COLORS.includes(color)) {
          throw new Errors.Client('SOLO_32_COLOR_REQUIRED', 'Color is required in mode 32')
        }

        const maxBet32 = new Decimal(SOLO_32_MAX_BET)
        if (amountDec.gt(maxBet32)) {
          throw new Errors.Client('SOLO_32_BET_TOO_HIGH', `Bet in mode 32 cannot exceed ${SOLO_32_MAX_BET} TON`)
        }

        const alreadyHasBetForColor = existingBets.some(
          b => b.userId === userId && b.type === 'ton' && b.color === color
        )
        // Один пользователь может сделать только одну ставку на каждый цвет в пределах текущего раунда.
        if (alreadyHasBetForColor) {
          throw new Errors.Client(
            'SOLO_32_COLOR_ALREADY_BET',
            `You can place only one bet per color in mode 32 (${color})`
          )
        }
      }

      // === Проверки для режима 'limit' ===
      if (game === 'limit') {
        // В limit могут участвовать только 2 игрока
        if (uniqueParticipantsCount >= 2 && !uniqueUserIds.has(userId)) {
          throw new Errors.Client('LIMIT_FULL', 'Limit round already has 2 players')
        }

        // Считаем суммы ставок по игрокам
        const betsByUser = new Map<string, Decimal>()
        for (const b of existingBets) {
          // Учитываем TON и NFT (у NFT amount = price в TON эквиваленте)
          const current = betsByUser.get(b.userId) || new Decimal(0)
          betsByUser.set(b.userId, current.plus(new Decimal(b.amount)))
        }

        const myCurrentBets = betsByUser.get(userId) || new Decimal(0)
        const myTotalAfterBet = myCurrentBets.plus(amountDec)

        // Если это первая ставка в раунде - проверяем лимит первой ставки
        if (uniqueParticipantsCount === 0) {
          const maxFirstBet = new Decimal(LIMIT_MAX_FIRST_BET)
          if (amountDec.gt(maxFirstBet)) {
            throw new Errors.Client(
              'LIMIT_FIRST_BET_TOO_HIGH',
              `First bet in limit cannot exceed ${LIMIT_MAX_FIRST_BET} TON`
            )
          }
        }

        // Если есть соперник - проверяем диапазон ставок
        if (uniqueParticipantsCount >= 1) {
          // Находим соперника (другой userId с ненулевыми ставками)
          let opponentTotal = new Decimal(0)
          for (const [uid, total] of betsByUser.entries()) {
            if (uid !== userId) {
              opponentTotal = opponentTotal.plus(total)
            }
          }

          // Если соперник уже сделал ставки, проверяем диапазон
          if (opponentTotal.gt(0)) {
            const minAllowed = opponentTotal.mul(100 - LIMIT_MAX_DIFF_PERCENT).div(100)
            const maxAllowed = opponentTotal.mul(100 + LIMIT_MAX_DIFF_PERCENT).div(100)

            // Любая ставка: общая сумма должна быть строго больше minAllowed (в диапазоне)
            if (myTotalAfterBet.lt(minAllowed)) {
              throw new Errors.Client(
                'LIMIT_BET_TOO_LOW',
                `Your total bets (${myTotalAfterBet.toFixed(2)}) must be greater than ${minAllowed.toFixed(2)} TON (within ${LIMIT_MAX_DIFF_PERCENT}% of opponent's ${opponentTotal.toFixed(2)})`
              )
            }

            if (myTotalAfterBet.gt(maxAllowed)) {
              throw new Errors.Client(
                'LIMIT_BET_TOO_HIGH',
                `Your total bets (${myTotalAfterBet.toFixed(2)}) would exceed opponent's bets (${opponentTotal.toFixed(2)}) by more than ${LIMIT_MAX_DIFF_PERCENT}%`
              )
            }
          }
        }
      }

      // Обновляем баланс пользователя
      const newBalance = currentBalance.minus(amountDec).toFixed(8)
      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))

      // Создаем ставку
      const [createdBet] = await tx
        .insert(bets)
        .values({
          userId,
          roundId: currentRound.id,
          type: 'ton',
          amount: amountDec.toFixed(8),
          game: currentRound.game,
          color: color || null,
          createdAt: now,
        })
        .returning()

      // Создаем транзакцию ставки
      const betTx: NewTransaction = {
        userId,
        type: 'bet',
        amount: amountDec.toFixed(8),
        status: 'completed',
        payload: {
          roundId: currentRound.id,
          game: currentRound.game,
          color,
        },
      }
      await tx.insert(transactions).values(betTx).returning()

      // Получаем все ставки для раунда (включая только что созданную)
      const allBets = await tx
        .select({
          userId: bets.userId,
          amount: bets.amount,
          type: bets.type,
        })
        .from(bets)
        .where(and(eq(bets.roundId, currentRound.id), eq(bets.game, currentRound.game)))

      // Пересчитываем банк раунда (ТОЛЬКО TON ставки; NFT не должны "создавать" TON)
      let bank = new Decimal(0)
      for (const bet of allBets) {
        if (bet.type === 'ton') bank = bank.plus(new Decimal(bet.amount))
      }
      const bankAmount = bank.toFixed(8)
      // Обновляем банк раунда
      await tx
        .update(rounds)
        .set({
          bankAmount,
          updatedAt: now,
        })
        .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))

      // Обновляем currentRound с актуальным bankAmount
      currentRound = {
        ...currentRound,
        bankAmount,
      }

      // Пересчитываем уникальных участников после создания ставки
      const allUniqueUserIds = new Set(allBets.map(b => b.userId))
      const allUniqueParticipantsCount = allUniqueUserIds.size

      // Определяем условия старта раунда в зависимости от режима
      let shouldStartRound = false
      if (game === '32') {
        // Режим '32': раунд стартует сразу с первой ставкой
        shouldStartRound = currentRound.status === 'waiting'
      } else {
        // Остальные режимы: раунд стартует при 2+ уникальных участниках
        shouldStartRound = allUniqueParticipantsCount >= 2 && currentRound.status === 'waiting'
      }

      let roundJustStarted = false
      if (shouldStartRound) {
        const startTime = now
        const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS)
        await tx
          .update(rounds)
          .set({
            status: 'running',
            startTime,
            endTime,
            updatedAt: now,
          })
          .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))
        currentRound = {
          ...currentRound,
          status: 'running',
          startTime,
          endTime,
        }
        roundJustStarted = true

        // Запускаем задачу на завершение раунда
        if (onRoundFinish) {
          RoundTimers.setFinishTimer(currentRound.id, ROUND_DURATION_MS, async () => {
            try {
              await onRoundFinish(currentRound.id, currentRound.game as GameMode, now)
            } catch (err) {
              console.error('[placeBet] Error finishing round:', err)
            }
          })
        }
      } else if (currentRound.status === 'running' && ['duel', 'limit'].includes(game)) {
        // Для duel/limit: если раунд уже запущен и делается новая ставка - продлеваем таймер на 3 секунды
        if (RoundTimers.hasFinishTimer(currentRound.id)) {
          // Вычисляем новое время окончания раунда
          const prevEndTime = currentRound.endTime ? new Date(currentRound.endTime).getTime() : now.getTime()
          const newEndTime = new Date(prevEndTime + DUEL_DOUBLE_BET_DELAY_MS)
          // Задержка для таймера = разница между новым endTime и текущим временем
          const timerDelay = Math.max(0, newEndTime.getTime() - now.getTime())
          RoundTimers.rescheduleFinishTimer(currentRound.id, timerDelay)

          // Обновляем endTime раунда в БД
          await tx
            .update(rounds)
            .set({ endTime: newEndTime, updatedAt: now })
            .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))
          currentRound = { ...currentRound, endTime: newEndTime }
        }
      }

      return {
        balance: newBalance,
        bet: createdBet,
        round: currentRound,
        roundJustStarted,
      }
    })
  }

  async function placeNftBet(
    userId: string,
    nftAddress: string,
    game: GameMode,
    now: Date,
    onRoundFinish?: (roundId: number, game: GameMode, now: Date) => Promise<void>
  ) {
    const addr = (nftAddress || '').trim()
    if (!addr) {
      throw new Errors.Client('BAD_NFT_ADDRESS', 'nftAddress is required')
    }
    if (game === '32') {
      throw new Errors.Client('NFT_NOT_ALLOWED_IN_32', 'NFT bets are not allowed in mode 32')
    }

    return db.transaction(async tx => {
      // Advisory lock: сериализация ставок пользователя в режиме (защита от race condition)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash32(`${game}:${userId}`)})`)

      // Находим пользователя
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      // Находим NFT
      const [nft] = await tx
        .select({ address: nfts.address, userId: nfts.userId, price: nfts.price, status: nfts.status })
        .from(nfts)
        .where(and(eq(nfts.address, addr), eq(nfts.userId, userId)))
        .limit(1)

      // Если NFT не найден, выбрасываем ошибку
      if (!nft) {
        throw new Errors.Client('NFT_NOT_OWNED', 'NFT is not owned by user')
      }

      // Если NFT не активен, выбрасываем ошибку
      if (nft.status !== 'active') {
        throw new Errors.Client('NFT_NOT_AVAILABLE', 'NFT is not available for betting')
      }

      // Преобразуем цену NFT в Decimal
      const priceDec = new Decimal(nft.price || '0')
      // Если цена NFT не положительная, выбрасываем ошибку
      if (priceDec.lte(0)) {
        throw new Errors.Client('BAD_NFT_PRICE', 'NFT price must be positive')
      }

      // Найти текущий активный раунд (waiting | running) для конкретного режима игры
      let [currentRound] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.game, game), inArray(rounds.status, ['waiting' as any, 'running' as any])))
        .orderBy(desc(rounds.id))
        .limit(1)

      // Если активного раунда нет, выбрасываем ошибку
      if (!currentRound) {
        throw new Errors.Client('NO_ACTIVE_ROUND', `No active round available [${game}]`)
      }

      // Получаем текущие ставки в раунде ДО создания новой ставки
      const existingBets = await tx
        .select({
          userId: bets.userId,
          amount: bets.amount,
          type: bets.type,
        })
        .from(bets)
        .where(and(eq(bets.roundId, currentRound.id), eq(bets.game, currentRound.game)))

      const uniqueUserIds = new Set(existingBets.map(b => b.userId))
      const uniqueParticipantsCount = uniqueUserIds.size

      // === Проверки для режима 'duel' ===
      if (game === 'duel') {
        // В duel могут участвовать только 2 игрока
        if (uniqueParticipantsCount >= 2 && !uniqueUserIds.has(userId)) {
          throw new Errors.Client('DUEL_FULL', 'Duel round already has 2 players')
        }
      }

      // === Проверки для режима 'limit' ===
      if (game === 'limit') {
        // В limit могут участвовать только 2 игрока
        if (uniqueParticipantsCount >= 2 && !uniqueUserIds.has(userId)) {
          throw new Errors.Client('LIMIT_FULL', 'Limit round already has 2 players')
        }

        // Для NFT ставок в режиме limit используем цену NFT как сумму ставки
        // Считаем суммы ставок по игрокам (учитываем все ставки, включая NFT по их price)
        const betsByUser = new Map<string, Decimal>()
        for (const b of existingBets) {
          const current = betsByUser.get(b.userId) || new Decimal(0)
          betsByUser.set(b.userId, current.plus(new Decimal(b.amount)))
        }

        const myCurrentBets = betsByUser.get(userId) || new Decimal(0)
        const myTotalAfterBet = myCurrentBets.plus(priceDec)

        // Если это первая ставка в раунде - проверяем лимит первой ставки
        if (uniqueParticipantsCount === 0) {
          const maxFirstBet = new Decimal(LIMIT_MAX_FIRST_BET)
          if (priceDec.gt(maxFirstBet)) {
            throw new Errors.Client(
              'LIMIT_FIRST_BET_TOO_HIGH',
              `First bet in limit cannot exceed ${LIMIT_MAX_FIRST_BET} TON (NFT price: ${priceDec.toFixed(2)})`
            )
          }
        }

        // Если есть соперник - проверяем диапазон ставок
        if (uniqueParticipantsCount >= 1) {
          let opponentTotal = new Decimal(0)
          for (const [uid, total] of betsByUser.entries()) {
            if (uid !== userId) {
              opponentTotal = opponentTotal.plus(total)
            }
          }

          if (opponentTotal.gt(0)) {
            const maxAllowed = opponentTotal.mul(100 + LIMIT_MAX_DIFF_PERCENT).div(100)

            if (myTotalAfterBet.gt(maxAllowed)) {
              throw new Errors.Client(
                'LIMIT_BET_TOO_HIGH',
                `Your total bets (${myTotalAfterBet.toFixed(2)}) would exceed opponent's bets (${opponentTotal.toFixed(2)}) by more than ${LIMIT_MAX_DIFF_PERCENT}%`
              )
            }
          }
        }
      }

      // "Лочим" NFT на время раунда: устанавливаем статус 'bet' и снимаем владельца (дальше передадим победителю)
      const locked = await tx
        .update(nfts)
        .set({ userId: null, status: 'bet', updatedAt: now })
        .where(and(eq(nfts.address, addr), eq(nfts.userId, userId), eq(nfts.status, 'active')))
        .returning({ address: nfts.address })

      // Если NFT не заблокирован, выбрасываем ошибку
      if (!locked.length) {
        throw new Errors.Client('NFT_LOCK_FAILED', 'Failed to lock NFT')
      }

      // Создаем ставку
      const [createdBet] = await tx
        .insert(bets)
        .values({
          userId,
          roundId: currentRound.id,
          type: 'nft',
          nftAddress: addr,
          // amount используется как вес; для NFT берём price
          amount: priceDec.toFixed(8),
          game: currentRound.game,
          createdAt: now,
        })
        .returning()

      // Создаем транзакцию ставки
      const betTx: NewTransaction = {
        userId,
        type: 'bet',
        amount: '0',
        status: 'completed',
        payload: {
          roundId: currentRound.id,
          nft: addr,
          nftPrice: priceDec.toFixed(8),
          game: currentRound.game,
        },
      }
      await tx.insert(transactions).values(betTx)

      // Получаем все ставки для раунда (включая только что созданную)
      const allBets = await tx
        .select({
          userId: bets.userId,
          amount: bets.amount,
          type: bets.type,
        })
        .from(bets)
        .where(and(eq(bets.roundId, currentRound.id), eq(bets.game, currentRound.game)))

      // bankAmount — только TON ставки
      let bank = new Decimal(0)
      for (const bet of allBets) {
        if (bet.type === 'ton') bank = bank.plus(new Decimal(bet.amount))
      }
      const bankAmount = bank.toFixed(8)
      await tx
        .update(rounds)
        .set({
          bankAmount,
          updatedAt: now,
        })
        .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))

      currentRound = {
        ...currentRound,
        bankAmount,
      }

      // Пересчитываем уникальных участников после создания ставки
      const allUniqueUserIds = new Set(allBets.map(b => b.userId))
      const allUniqueParticipantsCount = allUniqueUserIds.size

      // NFT-режимы (pvp/duel/limit): раунд стартует при 2+ участниках
      const shouldStartRound = allUniqueParticipantsCount >= 2 && currentRound.status === 'waiting'

      let roundJustStarted = false
      if (shouldStartRound) {
        const startTime = now
        const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS)
        await tx
          .update(rounds)
          .set({
            status: 'running',
            startTime,
            endTime,
            updatedAt: now,
          })
          .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))
        currentRound = {
          ...currentRound,
          status: 'running',
          startTime,
          endTime,
        }
        roundJustStarted = true

        if (onRoundFinish) {
          RoundTimers.setFinishTimer(currentRound.id, ROUND_DURATION_MS, async () => {
            try {
              await onRoundFinish(currentRound.id, currentRound.game as GameMode, now)
            } catch (err) {
              console.error('[placeNftBet] Error finishing round:', err)
            }
          })
        }
      } else if (currentRound.status === 'running' && ['duel', 'limit'].includes(game)) {
        // Для duel/limit: если раунд уже запущен и делается новая ставка - продлеваем таймер на 3 секунды
        if (RoundTimers.hasFinishTimer(currentRound.id)) {
          // Вычисляем новое время окончания раунда
          const prevEndTime = currentRound.endTime ? new Date(currentRound.endTime).getTime() : now.getTime()
          const newEndTime = new Date(prevEndTime + DUEL_DOUBLE_BET_DELAY_MS)
          // Задержка для таймера = разница между новым endTime и текущим временем
          const timerDelay = Math.max(0, newEndTime.getTime() - now.getTime())
          RoundTimers.rescheduleFinishTimer(currentRound.id, timerDelay)

          // Обновляем endTime раунда в БД
          await tx
            .update(rounds)
            .set({ endTime: newEndTime, updatedAt: now })
            .where(and(eq(rounds.id, currentRound.id), eq(rounds.game, currentRound.game)))
          currentRound = { ...currentRound, endTime: newEndTime }
        }
      }

      return {
        balance: user.balance || '0',
        bet: createdBet,
        round: currentRound,
        roundJustStarted,
      }
    })
  }

  // Получаем текущий раунд с участниками (из всех ставок) для конкретного режима игры
  async function getCurrentRoundWithMembers(game: GameMode) {
    const [currentRound] = await db.select().from(rounds).where(eq(rounds.game, game)).orderBy(desc(rounds.id)).limit(1)

    if (!currentRound) return null

    const roundBets = await db
      .select({
        id: bets.id,
        userId: bets.userId,
        amount: bets.amount,
        type: bets.type,
        game: bets.game,
        nftAddress: bets.nftAddress,
        color: bets.color,
        createdAt: bets.createdAt,
        username: users.username,
        firstName: users.firstName,
        avatar: users.avatar,
      })
      .from(bets)
      .leftJoin(users, eq(bets.userId, users.id))
      .where(and(eq(bets.roundId, currentRound.id), eq(bets.game, game)))
      .orderBy(asc(bets.createdAt))

    return {
      round: currentRound,
      bets: roundBets,
    }
  }

  // ----------------- ADMIN OPERATIONS -----------------
  async function startRound(now: Date) {
    return db.transaction(async tx => {
      // Найти текущий раунд в статусе 'waiting'
      const [currentRound] = await tx
        .select()
        .from(rounds)
        .where(eq(rounds.status, 'waiting' as any))
        .orderBy(desc(rounds.id))
        .limit(1)

      // Если текущего раунда нет, выбрасываем ошибку
      if (!currentRound) {
        return null
      }

      // Устанавливаем время начала и окончания раунда
      const startTime = now
      const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS)

      // Запускаем раунд
      await tx
        .update(rounds)
        .set({
          status: 'running',
          startTime,
          endTime,
          updatedAt: now,
        })
        .where(eq(rounds.id, currentRound.id))

      return {
        roundId: currentRound.id,
        startTime,
        endTime,
      }
    })
  }

  // Рассчитывает налог с выигрыша: 13% от суммы всех TON ставок (без ставок победителя)
  async function calculateTax(
    betsForRound: Array<{ userId: string; type: string; amount: string }>,
    tonBank: Decimal,
    winnerUserId: string
  ) {
    let winnerTonBets = new Decimal(0)
    for (const b of betsForRound) {
      if (b.type === 'ton' && b.userId === winnerUserId) {
        winnerTonBets = winnerTonBets.plus(new Decimal(b.amount))
      }
    }
    // taxBase = ставки противников (все ставки минус ставки победителя)
    const taxBase = tonBank.minus(winnerTonBets)
    // taxAmount = налог с ставок противников (13%)
    const taxAmount = taxBase.mul(TAX_PERCENTAGE).div(100)
    // winnerAmount = (ставки противников - налог) + ставка победителя
    // = taxBase - taxAmount + winnerTonBets
    // = tonBank - taxAmount (эквивалентно, но более понятно)
    const winnerAmount = taxBase.minus(taxAmount).plus(winnerTonBets)
    return { taxBase, taxAmount, winnerAmount }
  }

  // Рассчитывает награду рефереру от суммы налога с учётом уровня по кол-ву рефералов
  function calculateReferralReward(
    taxAmount: Decimal,
    referralCount: number
  ): { amount: Decimal; percent: number; referralCount: number } {
    const percent = getReferralRewardPercent(referralCount)
    if (!percent || percent <= 0) return { amount: new Decimal(0), percent, referralCount }
    // Округляем вниз до 8 знаков, чтобы не "переплатить" из налога
    const amount = taxAmount.mul(percent).div(100).toDecimalPlaces(8, Decimal.ROUND_DOWN)
    return { amount, percent, referralCount }
  }

  // Завершить раунд: выбирает победителя, начисляет выигрыш и помечает раунд как finished
  async function finishRound(roundId: number, game: GameMode, now: Date) {
    return db.transaction(async tx => {
      // Проверяем, что раунд еще в статусе 'running' и соответствует переданному режиму игры
      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.id, roundId), eq(rounds.game, game)))
        .limit(1)
      if (!round || round.status !== 'running') {
        // Раунд уже завершен, не найден или не соответствует режиму игры
        return null
      }

      // Получаем все ставки для раунда (с учетом режима игры)
      const betsForRound = await tx
        .select({
          id: bets.id,
          userId: bets.userId,
          amount: bets.amount,
          type: bets.type,
          nftAddress: bets.nftAddress,
          color: bets.color,
        })
        .from(bets)
        .where(and(eq(bets.roundId, roundId), eq(bets.game, game)))

      if (betsForRound.length === 0) {
        // Нет ставок - раунд не должен был начаться, возвращаем в 'waiting'
        await tx
          .update(rounds)
          .set({
            status: 'waiting' as any,
            startTime: null,
            endTime: null,
            updatedAt: now,
          })
          .where(and(eq(rounds.id, roundId), eq(rounds.game, game)))
        return null
      }

      // TON банк: только ton-ставки
      let tonBank = new Decimal(0)
      for (const b of betsForRound) {
        if (b.type === 'ton') tonBank = tonBank.plus(new Decimal(b.amount))
      }

      const bankAmount = tonBank.toFixed(8)

      // === Режим '32': особая логика ===
      if (game === '32') {
        // Лимит выплат для текущего раунда берём из общего reward-пула (по всей истории).
        const rewardPoolStats = await getModesRewardPoolAvailable(tx)
        const availablePoolBeforeRound = rewardPoolStats.allowedWinAmount

        // Для расчётов по 32 учитываем только TON-ставки с валидным цветом.
        const tonColorBets = betsForRound
          .filter(b => b.type === 'ton' && b.color && SOLO_32_COLORS.includes(b.color as Solo32Color))
          .map(b => ({ ...b, color: b.color as Solo32Color }))

        // Сценарий = что произойдёт в раунде, если выиграет конкретный цвет.
        type ColorScenario = Solo32ColorScenario<(typeof tonColorBets)[number], Decimal> & {
          // Укладывается ли полная выплата по сценарию в текущий лимит.
          isWithinLimit: boolean
        }

        // Считаем 3 независимых сценария: light / dark / red.
        const colorScenarios: ColorScenario[] = SOLO_32_COLORS.map(color => {
          const multiplier = SOLO_32_WIN_MULTIPLIERS[color]
          const winningBets = tonColorBets.filter(b => b.color === color)

          let totalWinningStake = new Decimal(0)
          let requestedPayout = new Decimal(0)

          for (const bet of winningBets) {
            const betAmount = new Decimal(bet.amount)
            const requestedWin = betAmount.mul(multiplier)
            totalWinningStake = totalWinningStake.plus(betAmount)
            requestedPayout = requestedPayout.plus(requestedWin)
          }

          const losingAmountRaw = tonBank.minus(totalWinningStake)
          const losingAmount = losingAmountRaw.gt(0) ? losingAmountRaw : new Decimal(0)

          return {
            color,
            winningBets,
            requestedPayout,
            losingAmount,
            isWithinLimit: availablePoolBeforeRound.gte(requestedPayout),
          }
        })

        // В первую очередь предпочитаем сценарии, где выплата полностью укладывается в лимит.
        const withinLimitScenarios = colorScenarios.filter(s => s.isWithinLimit)

        // Рандом в 32 сохраняется: выбираем цвет случайно по базовым шансам (49/49/2),
        // но только из отфильтрованных сценариев.
        const candidateScenarios = withinLimitScenarios.length > 0 ? withinLimitScenarios : colorScenarios
        const colorChanceWeights: Record<Solo32Color, number> = {
          light: 49,
          dark: 49,
          red: 2,
        }
        const weightedCandidates = candidateScenarios.map(s => ({
          scenario: s,
          weight: colorChanceWeights[s.color],
        }))
        const totalWeight = weightedCandidates.reduce((sum, c) => sum + c.weight, 0)

        let selectedScenario = candidateScenarios[0]!
        if (totalWeight > 0) {
          const random = Math.random() * totalWeight
          let acc = 0
          for (const c of weightedCandidates) {
            acc += c.weight
            if (random < acc) {
              selectedScenario = c.scenario
              break
            }
          }
        }

        const winningColor = selectedScenario.color
        const multiplier = SOLO_32_WIN_MULTIPLIERS[winningColor]
        const winningBets = selectedScenario.winningBets
        const totalLosingAmount = selectedScenario.losingAmount

        // Выплаты победителям всегда полные: ставка * множитель выбранного цвета.
        for (const bet of winningBets) {
          const requestedByBet = new Decimal(bet.amount).mul(multiplier)
          const winAmount = requestedByBet.toDecimalPlaces(8, Decimal.ROUND_DOWN)
          if (winAmount.lte(0)) continue

          // Получаем пользователя
          const [user] = await tx.select().from(users).where(eq(users.id, bet.userId)).limit(1)
          if (!user) continue

          // Создаём транзакцию выигрыша
          const winTx: NewTransaction = {
            userId: bet.userId,
            type: 'win',
            amount: winAmount.toFixed(8),
            status: 'pending',
            payload: {
              roundId: roundId,
              game: round.game as GameMode,
              multiplier,
              color: winningColor,
              requestedWinAmount: requestedByBet.toFixed(8),
              rewardPoolTotal32Losses: rewardPoolStats.totalLosingAmount.toFixed(8),
              rewardPoolTotalPaidWins: rewardPoolStats.totalWonAmount.toFixed(8),
              rewardPoolAllowedWinAmount: rewardPoolStats.allowedWinAmount.toFixed(8),
            },
          }
          const [createdTx] = await tx.insert(transactions).values(winTx).returning()

          // Обновляем баланс пользователя
          const userBalance = new Decimal(user.balance || '0')
          const newBalance = userBalance.plus(winAmount).toFixed(8)
          await tx.update(users).set({ balance: newBalance }).where(eq(users.id, bet.userId))
          await tx.update(transactions).set({ status: 'completed' }).where(eq(transactions.id, createdTx.id))
        }

        if (totalLosingAmount.gt(0)) {
          // В tax как и раньше уходит полный объём проигрышей.
          // Отдельно в payload фиксируем часть, которая считается доступной для reward-пула.
          const rewardPoolAmount = totalLosingAmount.mul(50).div(100).toDecimalPlaces(8, Decimal.ROUND_DOWN)

          const taxTx: NewTransaction = {
            userId: null,
            type: 'tax',
            amount: totalLosingAmount.toFixed(8),
            status: 'completed',
            payload: {
              roundId: roundId,
              tax: '100%',
              rewardPoolAmount: rewardPoolAmount.toFixed(8),
              game: round.game as GameMode,
              color: winningColor,
              rewardPoolTotal32Losses: rewardPoolStats.totalLosingAmount.toFixed(8),
              rewardPoolTotalPaidWins: rewardPoolStats.totalWonAmount.toFixed(8),
              rewardPoolAllowedWinAmount: rewardPoolStats.allowedWinAmount.toFixed(8),
            },
          }
          await tx.insert(transactions).values(taxTx)
        }

        // Завершаем раунд
        // Для режима 32 используем winnerColor вместо winnerUserId
        await tx
          .update(rounds)
          .set({
            status: 'finished',
            winnerUserId: null, // Для режима 32 не используем winnerUserId
            winnerColor: winningColor,
            bankAmount,
            updatedAt: now,
          })
          .where(and(eq(rounds.id, roundId), eq(rounds.game, game)))

        return {
          roundId: round.id,
          winnerUserId: null,
          bankAmount,
          game: round.game as GameMode,
        }
      }

      // === Стандартная логика для pvp, duel, limit ===

      // Weighted random winner
      let totalWeight = new Decimal(0)
      for (const b of betsForRound) {
        totalWeight = totalWeight.plus(new Decimal(b.amount))
      }
      const r = totalWeight.mul(Math.random()).toNumber()
      let acc = 0
      let winnerUserId = betsForRound[0].userId
      for (const b of betsForRound) {
        acc += Number(b.amount)
        if (r <= acc) {
          winnerUserId = b.userId
          break
        }
      }

      const [winner] = await tx.select().from(users).where(eq(users.id, winnerUserId)).limit(1)
      if (!winner) {
        throw new Errors.Client('WINNER_NOT_FOUND', 'Winner not found')
      }

      // Рассчитываем налог: 13% от суммы всех TON ставок (без ставок победителя)
      const { taxAmount, winnerAmount } = await calculateTax(betsForRound, tonBank, winnerUserId)

      // Создаём транзакцию награды рефереру (если победитель был приглашён)
      // и уменьшаем итоговую транзакцию налога на сумму награды
      const taxAmountFixed = new Decimal(taxAmount.toFixed(8))
      let referralRewardAmount = new Decimal(0)
      let referralRewardPercent = 0
      const referrerId = winner.invitee

      if (referrerId) {
        const [referrer] = await tx.select().from(users).where(eq(users.id, referrerId)).limit(1)
        if (referrer) {
          const refCount = await getReferralCount(referrerId)
          const reward = calculateReferralReward(taxAmountFixed, refCount)
          referralRewardAmount = reward.amount
          referralRewardPercent = reward.percent
          if (referralRewardAmount.gt(0)) {
            const referrerBalance = new Decimal(referrer.balance || '0')
            const referrerNewBalance = referrerBalance.plus(referralRewardAmount).toFixed(8)

            await tx.update(users).set({ balance: referrerNewBalance }).where(eq(users.id, referrerId))

            const referralTx: NewTransaction = {
              userId: referrerId,
              type: 'rewardReferral',
              amount: referralRewardAmount.toFixed(8),
              status: 'completed',
              payload: {
                roundId: roundId,
                game: round.game as GameMode,
                referralId: referrerId,
                referralRewardPercent: `${referralRewardPercent}%`,
                referralCount: reward.referralCount,
                winnerUserId,
              },
            }
            await tx.insert(transactions).values(referralTx)
          }
        }
      }

      const taxAmountAfterReferral = taxAmountFixed.minus(referralRewardAmount)

      // Создаём транзакцию налога (уже уменьшенную на награду рефереру)
      const taxTx: NewTransaction = {
        userId: null,
        type: 'tax',
        amount: taxAmountAfterReferral.toFixed(8),
        status: 'completed',
        payload: {
          roundId: roundId,
          tax: `${TAX_PERCENTAGE}%`,
          game: round.game as GameMode,
          ...(referrerId && referralRewardAmount.gt(0)
            ? { referralId: referrerId, referralRewardPercent: `${referralRewardPercent}%` }
            : {}),
        },
      }
      await tx.insert(transactions).values(taxTx)

      // Передаём все NFT-ставки победителю (если были залочены userId=NULL)
      const nftBets = betsForRound.filter(b => b.type === 'nft' && b.nftAddress)
      const nftAddresses = Array.from(
        new Set(nftBets.map(b => (b.nftAddress ? String(b.nftAddress) : '').trim()).filter(Boolean))
      )

      const winTx: NewTransaction = {
        userId: winnerUserId,
        type: 'win',
        amount: winnerAmount.toFixed(8),
        status: 'pending',
        payload: {
          roundId: roundId,
          nfts: nftAddresses,
          game: round.game as GameMode,
        },
      }
      const [createdTx] = await tx.insert(transactions).values(winTx).returning()

      const winnerBalance = new Decimal(winner.balance || '0')
      const newBalance = winnerBalance.plus(winnerAmount).toFixed(8)

      await tx.update(users).set({ balance: newBalance }).where(eq(users.id, winnerUserId))
      await tx.update(transactions).set({ status: 'completed' }).where(eq(transactions.id, createdTx.id))
      if (nftAddresses.length) {
        // Обновляем владельца всех NFT на победителя
        await tx
          .update(nfts)
          .set({ userId: winnerUserId, status: 'active', updatedAt: now })
          .where(inArray(nfts.address, nftAddresses))
      }

      // Завершаем раунд (с проверкой режима игры)
      await tx
        .update(rounds)
        .set({
          status: 'finished',
          winnerUserId,
          bankAmount,
          updatedAt: now,
        })
        .where(and(eq(rounds.id, roundId), eq(rounds.game, game)))

      // Возвращаем данные о завершенном раунде
      return {
        roundId: round.id,
        winnerUserId,
        bankAmount,
        game: round.game as GameMode,
        referrerId,
      }
    })
  }

  // Проверить наличие активного раунда (waiting | running) для конкретного режима игры
  async function hasActiveRound(game: GameMode) {
    const [currentRound] = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.game, game), inArray(rounds.status, ['waiting' as any, 'running' as any])))
      .orderBy(desc(rounds.id))
      .limit(1)

    return !!currentRound
  }

  // Создать новый раунд в статусе 'waiting' для конкретного режима игры
  async function createNewRound(game: GameMode, now: Date = new Date()) {
    const [round] = await db
      .insert(rounds)
      .values({
        status: 'waiting' as any,
        game,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return round
  }

  async function getPreviousFinishedRound(game: GameMode) {
    const [previousRound] = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.status, 'finished'), eq(rounds.game, game)))
      .orderBy(desc(rounds.id))
      .limit(1)

    if (!previousRound) {
      return null
    }

    // Для режима '32' используем winnerColor вместо winnerUserId
    if (game === '32') {
      if (!previousRound.winnerColor) {
        return null
      }

      // Получаем все ставки с выигрышным цветом
      const winningBets = await db
        .select({
          userId: bets.userId,
          amount: bets.amount,
          firstName: users.firstName,
          avatar: users.avatar,
        })
        .from(bets)
        .leftJoin(users, eq(bets.userId, users.id))
        .where(
          and(
            eq(bets.roundId, previousRound.id),
            eq(bets.game, game),
            eq(bets.color, previousRound.winnerColor),
            eq(bets.type, 'ton')
          )
        )

      if (winningBets.length === 0) {
        return null
      }

      // Агрегируем по пользователю
      const aggregated = new Map<
        string,
        {
          userId: string
          firstName?: string | null
          avatar?: string | null
          amount: Decimal
        }
      >()

      for (const b of winningBets) {
        const existing = aggregated.get(b.userId)
        const amountDec = new Decimal(b.amount)

        if (!existing) {
          aggregated.set(b.userId, {
            userId: b.userId,
            firstName: b.firstName,
            avatar: b.avatar,
            amount: amountDec,
          })
        } else {
          existing.amount = existing.amount.plus(amountDec)
        }
      }

      // Выбираем случайного победителя из тех, кто поставил на выигрышный цвет
      const winners = Array.from(aggregated.values())
      const randomWinner = winners[Math.floor(Math.random() * winners.length)]

      // Вычисляем общий банк всех ставок в раунде
      const allBets = await db
        .select({ amount: bets.amount })
        .from(bets)
        .where(and(eq(bets.roundId, previousRound.id), eq(bets.game, game), eq(bets.type, 'ton')))

      let totalBank = new Decimal(0)
      for (const b of allBets) {
        totalBank = totalBank.plus(new Decimal(b.amount))
      }

      return {
        roundId: previousRound.id,
        winnerUserId: randomWinner.userId,
        winnerUsername: undefined,
        winnerFirstName: randomWinner.firstName ?? undefined,
        winnerAvatar: randomWinner.avatar ?? undefined,
        winnerBetAmount: randomWinner.amount,
        totalBank,
        winnerColor: previousRound.winnerColor ?? undefined,
      }
    }

    // Для остальных режимов используем winnerUserId
    if (!previousRound.winnerUserId) {
      return null
    }

    // Получаем ставки для предыдущего раунда
    const roundBets = await db
      .select({
        id: bets.id,
        userId: bets.userId,
        amount: bets.amount,
        createdAt: bets.createdAt,
        username: users.username,
        firstName: users.firstName,
        avatar: users.avatar,
      })
      .from(bets)
      .leftJoin(users, eq(bets.userId, users.id))
      .where(eq(bets.roundId, previousRound.id))

    // Агрегируем ставки по пользователю
    const aggregated = new Map<
      string,
      {
        userId: string
        username?: string | null
        firstName?: string | null
        avatar?: string | null
        amount: Decimal
      }
    >()

    for (const b of roundBets) {
      const existing = aggregated.get(b.userId)
      const amountDec = new Decimal(b.amount)

      if (!existing) {
        aggregated.set(b.userId, {
          userId: b.userId,
          username: b.username,
          firstName: b.firstName,
          avatar: b.avatar,
          amount: amountDec,
        })
      } else {
        existing.amount = existing.amount.plus(amountDec)
      }
    }

    // Находим ставку победителя
    const winnerBet = aggregated.get(previousRound.winnerUserId)
    if (!winnerBet) {
      return null
    }

    // Вычисляем общий банк
    let totalBank = new Decimal(0)
    for (const m of aggregated.values()) {
      totalBank = totalBank.plus(m.amount)
    }

    return {
      roundId: previousRound.id,
      winnerUserId: previousRound.winnerUserId,
      winnerUsername: winnerBet.username ?? undefined,
      winnerFirstName: winnerBet.firstName ?? undefined,
      winnerAvatar: winnerBet.avatar ?? undefined,
      winnerBetAmount: winnerBet.amount,
      totalBank,
    }
  }

  async function getFinishedRoundWithMaxBank(game: GameMode) {
    // Для режима '32' победитель = транзакция type='win' с game='32' в payload и максимальным amount
    if (game === '32') {
      // 1) Транзакции type='win', в payload game='32'
      const winTransactions = await db
        .select({
          id: transactions.id,
          userId: transactions.userId,
          amount: transactions.amount,
          payload: transactions.payload,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(and(eq(transactions.type, 'win'), sql`"transactions"."payload"->>'game' = '32'`))

      if (winTransactions.length === 0) {
        return null
      }

      // 2) Среди них — максимальный amount; при равенстве — последний по id
      const sorted = [...winTransactions].sort((a, b) => {
        const cmp = new Decimal(b.amount).cmp(new Decimal(a.amount))
        if (cmp !== 0) return cmp
        return (b.id ?? 0) - (a.id ?? 0)
      })
      const winnerTx = sorted[0]
      const roundIdFromPayload =
        winnerTx.payload && typeof winnerTx.payload === 'object' && 'roundId' in winnerTx.payload
          ? Number((winnerTx.payload as { roundId?: number }).roundId)
          : null
      if (roundIdFromPayload == null || !winnerTx.userId) {
        return null
      }

      // Раунд и данные победителя
      const [roundRow] = await db.select().from(rounds).where(eq(rounds.id, roundIdFromPayload))
      if (!roundRow) {
        return null
      }
      const [winnerUser] = await db
        .select({ firstName: users.firstName, avatar: users.avatar })
        .from(users)
        .where(eq(users.id, winnerTx.userId))
      const winnerAmount = new Decimal(winnerTx.amount)

      // 3) Ставки раунда; totalBank берём из amount транзакции награды (уже посчитано)
      const allRoundBets = await db
        .select({
          id: bets.id,
          userId: bets.userId,
          amount: bets.amount,
          createdAt: bets.createdAt,
          username: users.username,
          firstName: users.firstName,
          avatar: users.avatar,
        })
        .from(bets)
        .leftJoin(users, eq(bets.userId, users.id))
        .where(eq(bets.roundId, roundIdFromPayload))

      return {
        round: roundRow,
        bets: allRoundBets,
        winnerBet: {
          userId: winnerTx.userId,
          firstName: winnerUser?.firstName ?? null,
          avatar: winnerUser?.avatar ?? null,
          amount: winnerAmount,
        },
        totalBank: winnerAmount,
      }
    }

    // Находим завершенный раунд с максимальным банком для конкретного режима игры
    const [maxBankRound] = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.status, 'finished'), eq(rounds.game, game)))
      .orderBy(desc(rounds.bankAmount))
      .limit(1)

    if (!maxBankRound) {
      return null
    }

    // Для остальных режимов используем winnerUserId
    if (!maxBankRound.winnerUserId) {
      return null
    }

    // Получаем ставки для этого раунда
    const roundBets = await db
      .select({
        id: bets.id,
        userId: bets.userId,
        amount: bets.amount,
        createdAt: bets.createdAt,
        username: users.username,
        firstName: users.firstName,
        avatar: users.avatar,
      })
      .from(bets)
      .leftJoin(users, eq(bets.userId, users.id))
      .where(eq(bets.roundId, maxBankRound.id))

    // Агрегируем ставки по пользователю
    const aggregated = new Map<
      string,
      {
        userId: string
        username?: string | null
        firstName?: string | null
        avatar?: string | null
        amount: Decimal
      }
    >()

    for (const b of roundBets) {
      const existing = aggregated.get(b.userId)
      const amountDec = new Decimal(b.amount)

      if (!existing) {
        aggregated.set(b.userId, {
          userId: b.userId,
          username: b.username,
          firstName: b.firstName,
          avatar: b.avatar,
          amount: amountDec,
        })
      } else {
        existing.amount = existing.amount.plus(amountDec)
      }
    }

    // Находим ставку победителя
    const winnerBet = aggregated.get(maxBankRound.winnerUserId)
    if (!winnerBet) {
      return null
    }

    // Вычисляем общий банк
    let totalBank = new Decimal(0)
    for (const m of aggregated.values()) {
      totalBank = totalBank.plus(m.amount)
    }

    return {
      round: maxBankRound,
      bets: roundBets,
      winnerBet,
      totalBank,
    }
  }

  // Получить все запущенные раунды (status = 'running') с endTime
  async function getRunningRounds() {
    return await db
      .select({
        id: rounds.id,
        game: rounds.game,
        endTime: rounds.endTime,
      })
      .from(rounds)
      .where(eq(rounds.status, 'running'))
  }

  // Проверить, есть ли активный раунд (не finished) для каждого режима игры
  async function getActiveRoundsPerGame(): Promise<Record<GameMode, boolean>> {
    const activeRounds = await db
      .select({
        game: rounds.game,
      })
      .from(rounds)
      .where(inArray(rounds.status, ['waiting' as any, 'running' as any]))

    const result: Record<GameMode, boolean> = {
      pvp: false,
      duel: false,
      limit: false,
      '32': false,
    }

    for (const round of activeRounds) {
      result[round.game as GameMode] = true
    }

    return result
  }

  async function getReferralCount(userId: string): Promise<number> {
    const [row] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(eq(users.invitee, userId))
    return Number(row?.count ?? 0)
  }

  async function getReferralStats(referrerId: string): Promise<Referral_Resp> {
    const [invitedRow, rewardRow] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.invitee, referrerId))
        .then(rows => rows[0]),
      db
        .select({ amount: sql<string>`COALESCE(SUM("transactions"."amount"), 0)::text` })
        .from(transactions)
        .where(and(eq(transactions.type, 'rewardReferral'), eq(transactions.userId, referrerId)))
        .then(rows => rows[0]),
    ])

    const invitedCount = Number(invitedRow?.count ?? 0)

    return {
      invitedCount,
      rewardTon: String(rewardRow?.amount ?? '0'),
      rewardPercent: getReferralRewardPercent(invitedCount),
    }
  }

  async function getGamesHistory(offset: number, limit: number) {
    // Получаем завершённые раунды с пагинацией
    const finishedRounds = await db
      .select()
      .from(rounds)
      .where(eq(rounds.status, 'finished'))
      .orderBy(desc(rounds.updatedAt), desc(rounds.id))
      .offset(offset)
      .limit(limit)

    if (finishedRounds.length === 0) return []

    const roundIds = finishedRounds.map(r => r.id)

    // Получаем все ставки для этих раундов с данными пользователей
    const allBets = await db
      .select({
        id: bets.id,
        userId: bets.userId,
        roundId: bets.roundId,
        amount: bets.amount,
        type: bets.type,
        game: bets.game,
        color: bets.color,
        nftAddress: bets.nftAddress,
        createdAt: bets.createdAt,
        firstName: users.firstName,
        avatar: users.avatar,
      })
      .from(bets)
      .leftJoin(users, eq(bets.userId, users.id))
      .where(inArray(bets.roundId, roundIds))
      .orderBy(asc(bets.createdAt))

    // Получаем NFT данные для ставок с nftAddress
    const nftAddresses = allBets
      .filter(b => b.type === 'nft' && b.nftAddress)
      .map(b => b.nftAddress!)
      .filter(Boolean)

    const nftData =
      nftAddresses.length > 0
        ? await db
            .select({
              address: nfts.address,
              name: nfts.name,
              image: nfts.image,
              preview100x100: nfts.preview100x100,
              preview500x500: nfts.preview500x500,
              price: nfts.price,
            })
            .from(nfts)
            .where(inArray(nfts.address, nftAddresses))
        : []

    const nftMap = new Map(nftData.map(n => [n.address, n]))

    // Группируем ставки по раунду
    const betsByRound = new Map<number, typeof allBets>()
    for (const bet of allBets) {
      const arr = betsByRound.get(bet.roundId) || []
      arr.push(bet)
      betsByRound.set(bet.roundId, arr)
    }

    // Формируем результат
    return finishedRounds.map(round => {
      const roundBets = betsByRound.get(round.id) || []

      // Считаем общий банк (только TON ставки)
      let totalBank = new Decimal(0)
      for (const b of roundBets) {
        if (b.type === 'ton') totalBank = totalBank.plus(new Decimal(b.amount))
      }

      // Определяем победителей (внутренний тип с Decimal для вычислений)
      type WinnerInfo = Omit<HistoryRoundWinner, 'bankAmount'> & { bankAmount: Decimal }

      const winners: WinnerInfo[] = []

      if (round.game === '32' && round.winnerColor) {
        // Для режима 32: победители — те, кто поставил на выигрышный цвет
        const winningBets = roundBets.filter(b => b.color === round.winnerColor && b.type === 'ton')
        const aggregated = new Map<string, WinnerInfo>()

        for (const b of winningBets) {
          const existing = aggregated.get(b.userId)
          const amountDec = new Decimal(b.amount)

          if (!existing) {
            aggregated.set(b.userId, {
              userId: b.userId,
              firstName: b.firstName ?? undefined,
              avatar: b.avatar ?? undefined,
              bankAmount: amountDec,
              winChance: 0,
            })
          } else {
            existing.bankAmount = existing.bankAmount.plus(amountDec)
          }
        }

        // Шансы для режима 32
        const colorChances: Record<string, number> = { light: 49, dark: 49, red: 2 }
        for (const w of aggregated.values()) {
          w.winChance = colorChances[round.winnerColor] || 0
          winners.push(w)
        }
      } else if (round.winnerUserId) {
        // Для остальных режимов: один победитель
        const aggregated = new Map<
          string,
          { userId: string; firstName?: string; avatar?: string; bankAmount: Decimal }
        >()

        for (const b of roundBets) {
          const existing = aggregated.get(b.userId)
          const amountDec = new Decimal(b.amount)

          if (!existing) {
            aggregated.set(b.userId, {
              userId: b.userId,
              firstName: b.firstName ?? undefined,
              avatar: b.avatar ?? undefined,
              bankAmount: amountDec,
            })
          } else {
            existing.bankAmount = existing.bankAmount.plus(amountDec)
          }
        }

        const winnerData = aggregated.get(round.winnerUserId)
        if (winnerData) {
          const totalWeight = Array.from(aggregated.values()).reduce((sum, m) => sum.plus(m.bankAmount), new Decimal(0))
          const winChance = totalWeight.gt(0) ? winnerData.bankAmount.div(totalWeight).mul(100).toNumber() : 0

          winners.push({
            ...winnerData,
            winChance: Math.round(winChance),
          })
        }
      }

      // Собираем NFT из ставок раунда
      const roundNfts = roundBets
        .filter(b => b.type === 'nft' && b.nftAddress)
        .map(b => nftMap.get(b.nftAddress!))
        .filter(Boolean)

      return {
        roundId: round.id,
        game: round.game as GameMode,
        bankAmount: totalBank.toFixed(8),
        winnerColor: round.winnerColor || undefined,
        finishedAt: round.updatedAt?.toISOString() || round.createdAt.toISOString(),
        winners: winners.map(w => ({
          userId: w.userId,
          firstName: w.firstName ?? undefined,
          avatar: w.avatar ?? undefined,
          bankAmount: w.bankAmount.toFixed(8),
          winChance: w.winChance,
        })),
        nfts: roundNfts,
      }
    })
  }

  async function getUserStats(userId: string): Promise<UserStats> {
    // Count finished rounds where user placed a bet
    const gamesPlayedResult = await db
      .select({ count: sql<number>`count(distinct ${bets.roundId})` })
      .from(bets)
      .innerJoin(rounds, eq(bets.roundId, rounds.id))
      .where(and(eq(bets.userId, userId), eq(rounds.status, 'finished')))

    const gamesPlayed = Number(gamesPlayedResult[0]?.count ?? 0)

    // Get all finished rounds won by this user with their bank amounts
    const wonRounds = await db
      .select({ bankAmount: rounds.bankAmount })
      .from(rounds)
      .where(and(eq(rounds.winnerUserId, userId), eq(rounds.status, 'finished')))

    let totalWon = new Decimal(0)
    let biggestWin = new Decimal(0)

    for (const r of wonRounds) {
      const amount = new Decimal(r.bankAmount)
      totalWon = totalWon.plus(amount)
      if (amount.greaterThan(biggestWin)) {
        biggestWin = amount
      }
    }

    return {
      gamesPlayed,
      totalWon: totalWon.toFixed(8),
      biggestWin: biggestWin.toFixed(8),
    }
  }

  /** Проверка: есть ли у пользователя freeRoll за сегодня (UTC 00:00) */
  async function hasFreeRollToday(userId: string, now: Date): Promise<boolean> {
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const [row] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.type, 'freeRoll'), gte(transactions.createdAt, todayStart))
      )
      .limit(1)
    return !!row
  }

  /** Выполнить free roll: RNG, создать freeRoll tx, при выигрыше — win tx и обновить баланс */
  async function playFreeRoll(userId: string, _now: Date): Promise<{ balance: string; prizeTon: string | null }> {
    return db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) {
        throw new Errors.Client('USER_NOT_FOUND', 'User not found')
      }

      // FreeRoll использует тот же reward-пул, что и режим 32.
      const rewardPoolStats = await getModesRewardPoolAvailable(tx)
      const availablePool = rewardPoolStats.allowedWinAmount
      // Недоступные по reward-пулу призы не участвуют в RNG вообще.
      const availablePrizes = FREE_ROLL_PRIZES.filter(p => new Decimal(p.prizeTon).lte(availablePool))

      // RNG остаётся прежним, но считается только по доступным призам.
      const r = Math.random() * 100
      let acc = 0
      let approvedPrizeTon: string | null = null
      let approvedProbabilityPercent: number | null = null

      for (const p of availablePrizes) {
        acc += p.probabilityPercent
        if (r < acc) {
          approvedPrizeTon = p.prizeTon
          approvedProbabilityPercent = p.probabilityPercent
          break
        }
      }

      if (!approvedPrizeTon) {
        // Если ни один сектор доступных призов не сработал — это "проигрыш" (0 TON).
        approvedProbabilityPercent = 100 - availablePrizes.reduce((s, p) => s + p.probabilityPercent, 0)
      }

      // Фиксируем сам факт freeRoll и выбранный (доступный) результат.
      const freeRollTx: NewTransaction = {
        userId,
        type: 'freeRoll',
        amount: approvedPrizeTon ? new Decimal(approvedPrizeTon).toFixed(8) : '0',
        status: 'completed',
        payload: {
          approvedPrizeTon,
          availablePoolBeforeRoll: availablePool.toFixed(8),
          random: r,
        },
      }
      await tx.insert(transactions).values(freeRollTx).returning()

      let newBalance = user.balance || '0'
      if (approvedPrizeTon) {
        // При выигрыше создаём отдельный win и начисляем баланс.
        const winTx: NewTransaction = {
          userId,
          type: 'win',
          amount: new Decimal(approvedPrizeTon).toFixed(8),
          status: 'completed',
          payload: {
            prizeTon: approvedPrizeTon,
            probabilityPercent: approvedProbabilityPercent,
            availablePoolBeforeRoll: availablePool.toFixed(8),
            random: r,
          },
        }
        await tx.insert(transactions).values(winTx).returning()
        const currentBalance = new Decimal(user.balance || '0')
        newBalance = currentBalance.plus(approvedPrizeTon).toFixed(8)
        await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId))
      }

      return { balance: newBalance, prizeTon: approvedPrizeTon }
    })
  }

  return {
    findUser,
    searchUsersForAdmin,
    toggleUserBanRole,
    addUser,
    addSession,
    getSession,
    getUserSession,
    getSessionOrUndefined,
    softDeleteUserSessions,
    setReferral,
    getMyProfile,
    // game / balance
    findUserIdByWalletAddress,
    upsertNfts,
    insertNftsIfNotExists,
    getActiveNftsWithoutUser,
    getActiveNftsByUserId,
    getNftsByAddresses,
    deposit,
    findDepositTransactionByClientRequestId,
    createInitialDepositTransaction,
    updateInitialDepositTransactionHints,
    getInitialDepositTransactions,
    getInitialDepositTransactionById,
    confirmInitialDepositTransaction,
    logDepositCheck,
    failInitialDepositTransaction,
    withdraw,
    buyNft,
    updateNftStatusToSend,
    getPendingDepositTransactions,
    confirmDepositTransaction,
    failDepositTransaction,
    createWithdrawRequest,
    getMyWithdrawRequests,
    getWithdrawRequestsForAdmin,
    getWithdrawRequestById,
    setWithdrawRequestRejected,
    setWithdrawRequestPayed,
    placeBet,
    placeNftBet,
    getCurrentRoundWithMembers,
    hasActiveRound,
    createNewRound,
    finishRound,
    getPreviousFinishedRound,
    getFinishedRoundWithMaxBank,
    startRound,
    getRunningRounds,
    getActiveRoundsPerGame,
    getReferralCount,
    getReferralStats,
    getGamesHistory,
    getUserStats,
    hasFreeRollToday,
    playFreeRoll,
    applyPromocode,
    getPromocodes,
    getPromocodeUsage,
    createPromocode,
    updatePromocode,
    deletePromocode,
  }
}

export default { create }
