import {
  AuthHeaders,
  AuthTelegramWebApp_Req,
  type AuthTelegramWebApp_Req as AuthTelegramWebApp_ReqType,
  AuthWithMerge_Resp,
  DObject,
  GameMode,
  HistoryRound,
  NftGift,
  Referral_Resp,
  UserMeResponse,
  UserStats,
} from '@shared-protocol/types'
import * as t from '@sinclair/typebox/type'
import { BaseApp } from '@src/BaseApp'
import { Config } from '@src/Config'
import { Error400 } from '@src/Errors'
import { createLogger } from '@src/lib/Logger'
import * as tg from '@src/tg'
import { formatBalance } from '@src/utils'
import murmurhash from 'murmurhash'
import { LogicAuthorization } from './authorization'
import { Context } from './context'
import { LogicGame } from './logicGame'
import { LogicUsers } from './logicUsers'
import { TonNft } from './tonNft'

const Logger = createLogger('http')

const create = <App extends BaseApp>(app: App, services: { config: Config } & Context.Services) => {
  const checkAdmin = async (authUserId: string) => {
    const user = await services.pgDb.findUser(authUserId)
    if (!user || user.role !== 'admin') {
      throw new Error400('ACCESS_DENIED', 'Only Admin users can perform this action')
    }
  }

  const logRequest = (requestName: string, authUserId: string, headers: AuthHeaders, data?: any) => {
    const session = murmurhash(headers.authorization)
    const userAgent = headers['user-agent']
    const message =
      `[HttpApi] ${requestName} User=${authUserId} Session=${session} UserAgent=${userAgent}` +
      (data !== undefined ? ` Data=${JSON.stringify(data)}` : ``)
    Logger.debug(message)
  }

  return app
    .post(
      '/auth',
      async ({ body, headers, now }) => {
        const authBody = body as AuthTelegramWebApp_ReqType
        const { trafficId, referralId } = authBody
        const authHeaders = headers as AuthHeaders
        logRequest(`auth`, '', authHeaders, authBody)
        const checkedInitData = tg.verifyInitData({
          botToken: services.config.telegram.botToken,
          initData: authBody.initDataRaw,
        })
        if (!checkedInitData) throw new Error400('📛Invalid_TelegramWebAppInitData')
        Logger.info(`✅ Checked WebApp InitData!`, checkedInitData, { trafficId, referralId })
        return await LogicAuthorization.signupUser({
          now,
          pgDb: services.pgDb,
          headers: authHeaders,
          telegramData: checkedInitData,
          trafficId,
          referralId,
        })
      },
      {
        headers: AuthHeaders as any,
        body: DObject(AuthTelegramWebApp_Req) as any,
        response: AuthWithMerge_Resp as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .get(
      '/shop/gifts',
      async () => {
        const gifts = await services.pgDb.getActiveNftsWithoutUser()
        return gifts
      },
      {
        response: t.Array(NftGift as any) as any,
        detail: { tags: ['Shop'] },
      }
    )
    .get(
      '/buy/nft/:nftId',
      async ({ headers, params }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        const { nftId } = params as { nftId: string }

        const { balance } = await services.pgDb.buyNft(session.userId, nftId)
        return { balance: formatBalance(balance) }
      },
      {
        headers: AuthHeaders as any,
        response: t.Object({
          balance: t.String(),
        }) as any,
        detail: { tags: ['Shop'] },
      }
    )
    .get(
      '/user/me',
      async ({ headers }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }
        const session = await services.pgDb.getSession(authHeaders.authorization)
        logRequest(`user/me`, session.userId.toString(), authHeaders)
        const profile = await LogicUsers.getProfileInfo(services.pgDb, session.userId)
        const gifts = await services.pgDb.getActiveNftsByUserId(session.userId)
        const user = await services.pgDb.findUser(session.userId)
        const freeRollUsedToday = await services.pgDb.hasFreeRollToday(session.userId, new Date())

        // Возвращаем только необходимые поля, без trafficId / referralId
        return {
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
          balance: formatBalance(profile.balance),
          gifts,
          freeRollUsedToday,
          isAdmin: user?.role === 'admin' ? true : undefined,
        }
      },
      {
        headers: AuthHeaders as any,
        response: UserMeResponse as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .get(
      '/user/stats',
      async ({ headers }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        logRequest(`user/stats`, session.userId.toString(), authHeaders)

        const stats = await services.pgDb.getUserStats(session.userId)

        return {
          gamesPlayed: stats.gamesPlayed,
          totalWon: formatBalance(stats.totalWon),
          biggestWin: formatBalance(stats.biggestWin),
        }
      },
      {
        headers: AuthHeaders as any,
        response: UserStats as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .get(
      '/referral',
      async ({ headers }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        logRequest(`referral`, session.userId.toString(), authHeaders)

        const stats = await services.pgDb.getReferralStats(session.userId)

        return {
          invitedCount: stats.invitedCount,
          rewardTon: formatBalance(stats.rewardTon),
          rewardPercent: stats.rewardPercent,
        }
      },
      {
        headers: AuthHeaders as any,
        response: Referral_Resp as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .get(
      '/games/history',
      async ({ query }) => {
        const { offset, limit } = query as { offset?: string; limit?: string }
        const offsetNum = Math.max(0, parseInt(offset || '0', 10) || 0)
        const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10) || 10))

        return await services.pgDb.getGamesHistory(offsetNum, limitNum)
      },
      {
        query: t.Object({
          offset: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }) as any,
        response: t.Array(HistoryRound as any) as any,
        detail: { tags: ['Game'] },
      }
    )
    .get(
      '/free-roll',
      async ({ headers, now }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }
        const session = await services.pgDb.getSession(authHeaders.authorization)
        logRequest('free-roll', session.userId.toString(), authHeaders)
        return await LogicGame.freeRoll(services.pgDb, authHeaders, now)
      },
      {
        headers: AuthHeaders as any,
        response: t.Object({
          balance: t.String(),
          prizeTon: t.Union([t.String(), t.Null()]),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/bet',
      async ({ headers, body, now }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const { amount, game, color } = body as { amount: string; game: GameMode; color?: 'light' | 'dark' | 'red' }

        return await LogicGame.bet(services.pgDb, authHeaders, amount, game, now, color)
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          amount: t.String(),
          game: t.Union([t.Literal('pvp'), t.Literal('duel'), t.Literal('limit'), t.Literal('32')]),
          color: t.Optional(t.Union([t.Literal('light'), t.Literal('dark'), t.Literal('red')])),
        }) as any,
        response: t.Object({
          balance: t.String(),
          roundId: t.Number(),
          roundStatus: t.String(),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/bet/nft',
      async ({ headers, body, now }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const { nftAddress, game } = body as { nftAddress: string; game: GameMode }

        return await LogicGame.betNft(services.pgDb, authHeaders, nftAddress, game, now)
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          nftAddress: t.String(),
          game: t.Union([t.Literal('pvp'), t.Literal('duel'), t.Literal('limit')]), // NFT в режиме 32 недоступен
        }) as any,
        response: t.Object({
          balance: t.String(),
          roundId: t.Number(),
          roundStatus: t.String(),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/deposit/initial',
      async ({ body }) => {
        const { amount, authToken, walletAddress, clientRequestId } = body as {
          amount: string
          authToken: string
          walletAddress?: string
          clientRequestId?: string
        }

        const result = await LogicGame.depositInitial(
          services.pgDb,
          amount,
          authToken,
          walletAddress,
          clientRequestId,
          services.config
        )

        return {
          balance: result.balance,
          transactionId: result.transactionId,
          status: result.status,
        }
      },
      {
        body: t.Object({
          amount: t.String(),
          authToken: t.String(),
          walletAddress: t.Optional(t.String()),
          clientRequestId: t.Optional(t.String()),
        }) as any,
        response: t.Object({
          balance: t.String(),
          transactionId: t.Number(),
          status: t.Union([t.Literal('initial'), t.Literal('pending'), t.Literal('completed'), t.Literal('failed')]),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/deposit',
      async ({ headers, body }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const { amount, walletAddress, txBoc, txHash, clientRequestId, transactionId } = body as {
          amount?: string
          walletAddress?: string
          txBoc?: string
          txHash?: string
          clientRequestId?: string
          transactionId?: number
        }

        const result = await LogicGame.deposit(
          services.pgDb,
          authHeaders,
          {
            amount,
            walletAddress,
            txBoc,
            txHash,
            clientRequestId,
            transactionId,
          },
          services.config
        )

        // Return a stable shape for frontend: always include transactionId
        return {
          balance: result.balance,
          transactionId: result.transactionId,
          status: result.status,
        }
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          amount: t.Optional(t.String()),
          walletAddress: t.Optional(t.String()),
          txBoc: t.Optional(t.String()),
          txHash: t.Optional(t.String()),
          clientRequestId: t.Optional(t.String()),
          transactionId: t.Optional(t.Number()),
        }) as any,
        response: t.Object({
          balance: t.String(),
          transactionId: t.Number(),
          status: t.Optional(
            t.Union([t.Literal('initial'), t.Literal('pending'), t.Literal('completed'), t.Literal('failed')])
          ),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/withdraw',
      async ({ headers, body }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const { amount, toAddress } = body as { amount: string; toAddress: string }
        if (!toAddress) {
          throw new Error400('MISSING_ADDRESS', 'Recipient address is required')
        }

        return await LogicGame.withdrawRequest(services.pgDb, authHeaders, amount, toAddress)
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          amount: t.String(),
          toAddress: t.String(),
        }) as any,
        response: t.Object({
          requestId: t.Number(),
          status: t.Union([t.Literal('pending'), t.Literal('payed'), t.Literal('rejected')]),
          createdAt: t.Date(),
        }) as any,
        detail: { tags: ['Game'] },
      }
    )
    .get(
      '/withdraw-requests',
      async ({ headers, query }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        const limit = Number((query as { limit?: string })?.limit || '50')
        const requests = await services.pgDb.getMyWithdrawRequests(session.userId, limit)
        return requests.map(item => ({
          id: item.id,
          amount: formatBalance(item.amount),
          toAddress: item.toAddress,
          status: item.status,
          createdAt: item.createdAt,
          confirmedAt: item.confirmedAt,
          txHash: item.txHash || undefined,
        }))
      },
      {
        headers: AuthHeaders as any,
        query: t.Object({
          limit: t.Optional(t.String()),
        }) as any,
        response: t.Array(
          t.Object({
            id: t.Number(),
            amount: t.String(),
            toAddress: t.String(),
            status: t.Union([t.Literal('pending'), t.Literal('payed'), t.Literal('rejected')]),
            createdAt: t.Date(),
            confirmedAt: t.Optional(t.Union([t.Date(), t.Null()])),
            txHash: t.Optional(t.String()),
          })
        ) as any,
        detail: { tags: ['Game'] },
      }
    )
    .post(
      '/promocode',
      async ({ headers, body }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        const { code } = body as { code: string }

        if (!code || typeof code !== 'string') {
          throw new Error400('PROMOCODE_INVALID', 'Код промокода не указан')
        }

        const result = await services.pgDb.applyPromocode(session.userId, code)

        return {
          success: true,
          balance: formatBalance(result.balance),
          reward: formatBalance(result.reward),
        }
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          code: t.String(),
        }) as any,
        response: t.Object({
          success: t.Literal(true),
          balance: t.String(),
          reward: t.String(),
        }) as any,
        detail: { tags: ['Promocode'] },
      }
    )
    .post(
      '/withdraw/nft',
      async ({ headers, body }) => {
        const authHeaders = headers as AuthHeaders
        if (!authHeaders.authorization) {
          throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
        }

        const session = await services.pgDb.getSession(authHeaders.authorization)
        logRequest('withdraw nft', session.userId.toString(), authHeaders, body)

        const { nftAddress, toAddress } = body as { nftAddress: string; toAddress: string }

        if (!nftAddress) {
          throw new Error400('MISSING_NFT_ADDRESS', 'NFT address is required')
        }
        if (!toAddress) {
          throw new Error400('MISSING_ADDRESS', 'Recipient address is required')
        }

        // Обновляем статус NFT на 'send'
        await services.pgDb.updateNftStatusToSend(session.userId.toString(), nftAddress)

        // Отправляем NFT используя логику аналогичную adminHttp
        const result = await TonNft.sendNft(services.config, {
          nftAddress,
          toAddress,
        })

        return result
      },
      {
        headers: AuthHeaders as any,
        body: t.Object({
          nftAddress: t.String(),
          toAddress: t.String(),
        }) as any,
        response: t.Object({
          txHash: t.String(),
          status: t.String(),
        }) as any,
        detail: { tags: ['Shop'] },
      }
    )
}

export default { create }
