import type { UserShortDTO } from '@shared-protocol/types'
import { Db } from '@src/Db'
import { Errors } from '@src/Errors'
import { getAuthTokenHash } from '@src/utils'
import { and, eq, isNull } from 'drizzle-orm'
import { type Session, sessions } from './schema/session'
import { type NewUser, users } from './schema/users'

export type PgDb = Awaited<ReturnType<typeof create>>

function create({ db }: Db) {
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

    return session
  }

  async function getMyProfile(userId: string): Promise<UserShortDTO> {
    const result = await db
      .select({
        id: users.id,
        avatar: users.avatar,
        username: users.username,
        balance: users.balance,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!result[0]) {
      throw new Errors.Unauthorized('User not found')
    }

    return {
      ...result[0],
      balance: result[0].balance || '0',
    }
  }

  return {
    findUser,
    addUser,
    addSession,
    getSession,
    getUserSession,
    getSessionOrUndefined,
    softDeleteUserSessions,
    getMyProfile,
  }
}

export default { create }
