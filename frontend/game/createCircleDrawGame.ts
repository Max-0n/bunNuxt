import Phaser from 'phaser'
import { CircleDrawScene } from '~/game/circleDrawScene'
import { LeaderboardScene } from '~/game/leaderboardScene'
import { LoadingScene } from '~/game/loadingScene'
import { MenuScene } from '~/game/menuScene'

export function createCircleDrawGame(parent: HTMLElement): { destroy: () => void; resize: () => void } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: 0x0f0114,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.max(parent.clientWidth, 320),
      height: Math.max(parent.clientHeight, 420),
    },
    scene: [LoadingScene, MenuScene, CircleDrawScene, LeaderboardScene],
    input: {
      touch: { capture: true },
    },
  })

  return {
    destroy: () => {
      game.destroy(true)
    },
    resize: () => {
      game.scale.resize(Math.max(parent.clientWidth, 320), Math.max(parent.clientHeight, 420))
    },
  }
}
