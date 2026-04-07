import type { CircleDrawLeaderboardResponse, CircleDrawSubmitScoreResponse } from '@shared-protocol/types'
import { $api } from '~/composables/useApi'

export type CircleDrawGameContext = {
  apiBaseUrl: string
}

export const CIRCLE_DRAW_REGISTRY_KEY = 'circleDrawContext'

export async function fetchCircleDrawLeaderboard(): Promise<CircleDrawLeaderboardResponse> {
  return await $api.get('/circle-draw/leaderboard')
}

export async function submitCircleDrawScore(scorePercent: number): Promise<CircleDrawSubmitScoreResponse | null> {
  try {
    return await $api.post('/circle-draw/leaderboard/submit', {
      body: { scorePercent },
    })
  } catch {
    return null
  }
}
