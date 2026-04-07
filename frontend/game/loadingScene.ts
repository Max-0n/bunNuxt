import Phaser from 'phaser'
import { SceneKey } from '~/game/sceneKeys'
import { tweenSlideExitThenStart } from '~/game/sceneSlide'

export class LoadingScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container

  constructor() {
    super({ key: SceneKey.Loading })
  }

  create(): void {
    const w = this.scale.width
    const h = this.scale.height

    this.cameras.main.setBackgroundColor(0x0f0114)

    this.root = this.add.container(0, 0)

    const title = this.add
      .text(w / 2, h / 2 - 12, 'Загрузка игры...', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    const subtitle = this.add
      .text(w / 2, h / 2 + 28, 'Подготавливаем сцены', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '16px',
        color: '#ffffffaa',
      })
      .setOrigin(0.5)

    this.root.add([title, subtitle])

    this.time.delayedCall(450, () => {
      tweenSlideExitThenStart(this, this.root, w, 'forward', SceneKey.Menu)
    })
  }
}
