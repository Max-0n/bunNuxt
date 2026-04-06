import { PgDb } from '@src/db/pgDb'

export namespace LogicUsers {
  export type UserProfile = Awaited<ReturnType<PgDb['getMyProfile']>>

  export async function getProfileInfo(pgDb: PgDb, userId: string): Promise<UserProfile> {
    return await pgDb.getMyProfile(userId)
  }
}
