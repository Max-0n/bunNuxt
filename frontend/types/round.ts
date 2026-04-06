import type { GameMode } from '@shared-protocol/types'

export type { GameMode }

export interface RoundMember {
  userId: string
  firstName?: string
  avatar?: string
  amount: string
  betId: number
  createdAt: string
  nftAddress?: string
  nfts?: {
    address: string
    name: string
    image?: string
    preview100x100?: string
    preview500x500?: string
    price: string
  }[]
}

export interface CurrentRound {
  id: number
  status: string
  startTime?: string
  endTime?: string
  game?: GameMode
  bankAmount?: string
  winnerUserId?: string
  winnerColor?: 'light' | 'dark' | 'red'
  colorBets?: {
    light: string[]
    dark: string[]
    red: string[]
  }
  members: RoundMember[]
}

export type RoundsState = {
  [key in GameMode]?: CurrentRound | null
}
