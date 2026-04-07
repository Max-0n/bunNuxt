export const SceneKey = {
  Loading: 'Loading',
  Menu: 'Menu',
  CircleDraw: 'CircleDraw',
  Leaderboard: 'Leaderboard',
} as const

export type SceneKeyType = (typeof SceneKey)[keyof typeof SceneKey]
