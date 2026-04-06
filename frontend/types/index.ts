import type { UserRanking } from '@shared-protocol/types'

export type RouletteChartItem = { value: number; user: UserRanking }

export * from './button'
export * from './round'
export * from './statTile'
export * from './text'

export interface ConnectorResponse {
  user: any
  stateVersion: string
  stateVersionBefore: string
  featureFlags?: any
}

export enum URLS {
  INDEX = '/',
  SOLO = '/solo',
  SOLO_LIMIT = '/solo-limit',
  SOLO_DUEL = '/solo-duel',
  SOLO_32 = '/solo-32',
  SOLO_ROLL = '/solo-roll',
  SHOP = '/shop',
  ACCOUNT = '/account',
  HISTORY = '/history',
}

export interface StartApp {
  trafficId?: string
  ref?: string
  [key: string]: unknown
}
