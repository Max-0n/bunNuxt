import { PathlyConfig } from '@pathly-protocol/config'
import { PgDb } from '@src/db/pgDb'

export namespace Context {
  export type Services = {
    pgDb: PgDb
    // bull: Bull
    // sseController: SseController
    // cacheClient: CacheClient
    // vaultClient: VaultClient
  }

  export type RandomFunction = () => number
  export const random: RandomFunction = Math.random

  export type Type = {
    now: Date
    userLevel: number
    config: PathlyConfig
    random: RandomFunction
  }
}
