import crypto from 'node:crypto'
import { IpInfo, type WebAppUser } from '@shared-protocol/types'
import { PgDb } from '@src/db/pgDb'
import { Error400 } from '@src/Errors'
import { canAuthenticate, extractAuthToken_fromHeader } from '@src/utils'
import { salt } from './constants'

export namespace LogicAuthorization {
  export async function signupUser({
    now,
    pgDb,
    headers,
    telegramData,
    // cacheClient,
    trafficId,
    referralId,
  }: {
    now: Date
    pgDb: PgDb
    headers: Record<string, string | undefined>
    telegramData: WebAppUser
    // cacheClient: CacheClient
    trafficId?: string
    referralId?: string
  }) {
    const authUserId = telegramData.id.toString()
    const existing = await pgDb.findUser(authUserId)
    if (existing?.role === 'banned') {
      throw new Error400('USER_BANNED', 'This user is banned')
    }
    if (!existing) {
      if (canAuthenticate(telegramData.id)) {
        await pgDb.addUser({
          id: authUserId,
          username: telegramData.username || '',
          avatar: telegramData.photo_url,
          firstName: telegramData.first_name,
          lastName: telegramData.last_name,
          isBot: telegramData.is_bot,
          isPremium: telegramData.is_premium,
          languageCode: telegramData.language_code || '',
          trafficId,
          invitee: referralId,
        })

        // void cacheClient.enqueueServerEvents([
        //   {
        //     eventType: 'BrInstallEvent',
        //     userId: authUserId,
        //     createdAt: now,
        //     trafficId: !trafficId && referralId ? 'viral' : trafficId,
        //     referral: referralId,
        //   },
        // ])
      } else {
        throw new Error400('📛Invalid_TelegramWebAppInitData | Not allowed')
      }
    }

    let session = headers.authorization && (await pgDb.getSessionOrUndefined(headers.authorization))
    if (!session) session = await pgDb.getUserSession(authUserId)

    const existAuthToken = headers.authorization && extractAuthToken_fromHeader(headers.authorization)
    if (headers.authorization)
      console.log('extractAuthToken_fromHeader', extractAuthToken_fromHeader(headers.authorization), existAuthToken)
    const authToken =
      existAuthToken && session
        ? existAuthToken
        : await generateAuthToken_andSave({
            now,
            pgDb,
            ipInfo: undefined,
            accountId: authUserId,
            saltString: salt,
          })
    return {
      authUserId,
      authToken,
      status: 'Ok',
    }
  }

  export function randomAlphaNumeric(length: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const randomByte = crypto.randomBytes(length)
    let result = ''
    for (let i = 0; i < length; i++) {
      const randomIndex = randomByte[i] % alphabet.length
      result += alphabet.charAt(randomIndex)
    }
    return result
  }

  export function sha256HashWithSalts(string: string, salt: string): string {
    const saltedString = salt + string
    const hashedString = crypto.createHash('sha256').update(saltedString, 'utf8').digest('hex')
    return hashedString
  }

  export const generateAuthToken_andSave = async (arg: {
    now: Date
    pgDb: PgDb
    ipInfo: IpInfo | undefined
    accountId: string
    saltString: string
  }): Promise<string> => {
    const { now, pgDb, accountId } = arg
    // ✅ Generate Session:
    const authToken = now.getTime() + randomAlphaNumeric(64) + accountId
    const authTokenHash = sha256HashWithSalts(authToken, salt)
    console.log('authTokenHash:', accountId, authTokenHash)
    // await pgDb.softDeleteUserSessions(accountId)
    await pgDb.addSession({
      id: authTokenHash,
      userId: accountId,
      lastActivityAt: now,
    })
    console.log(`✅ Generated new token! For authUser ${accountId}`)
    return authToken
  }
}
