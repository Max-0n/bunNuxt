import {
  AuthHeaders,
  CircleDrawLeaderboardResponse,
  CircleDrawSubmitScoreBody,
  CircleDrawSubmitScoreResponse,
  UserMeResponse,
} from '@shared-protocol/types'
import { BaseApp } from '@src/BaseApp'
import { Config } from '@src/Config'
import { Error400 } from '@src/Errors'
import { createLogger } from '@src/lib/Logger'
import murmurhash from 'murmurhash'
import { Context } from './context'
import { LogicUsers } from './logicUsers'

const Logger = createLogger('http')

const create = <App extends BaseApp>(app: App, services: { config: Config } & Context.Services) => {
  const logRequest = (requestName: string, authUserId: string, headers: AuthHeaders, data?: any) => {
    const session = murmurhash(headers.authorization ?? '')
    const userAgent = headers['user-agent']
    const message =
      `[HttpApi] ${requestName} User=${authUserId} Session=${session} UserAgent=${userAgent}` +
      (data !== undefined ? ` Data=${JSON.stringify(data)}` : ``)
    Logger.debug(message)
  }

  return app
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

        return {
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
        }
      },
      {
        headers: AuthHeaders as any,
        response: UserMeResponse as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .get(
      '/circle-draw/leaderboard',
      async () => {
        const limit = 15
        const rows = await services.pgDb.getCircleDrawLeaderboardBestPerUser(limit)
        return {
          entries: rows.map((row, index) => ({
            rank: index + 1,
            username: row.username,
            scorePercent: row.scorePercent,
            createdAt: row.createdAt.toISOString(),
          })),
        }
      },
      {
        response: CircleDrawLeaderboardResponse as any,
        detail: { tags: ['Pathly'] },
      }
    )
    .post(
      '/circle-draw/leaderboard/submit',
      async ({ body, headers }) => {
        const authHeaders = headers as AuthHeaders
        let userId: string | null = null
        if (authHeaders.authorization) {
          const session = await services.pgDb.getSessionOrUndefined(authHeaders.authorization)
          if (session) userId = session.userId
        }
        const payload = body as { scorePercent: number }
        logRequest(`circle-draw/leaderboard/submit`, userId ?? 'anonymous', authHeaders, payload)
        const row = await services.pgDb.insertCircleDrawScore(userId, payload.scorePercent)
        return {
          scorePercent: row.scorePercent,
          createdAt: row.createdAt.toISOString(),
        }
      },
      {
        body: CircleDrawSubmitScoreBody as any,
        response: CircleDrawSubmitScoreResponse as any,
        detail: { tags: ['Pathly'] },
      }
    )
}

export default { create }
