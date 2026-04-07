import Phaser from 'phaser'
import { formatRecordDateTime, getSortedCircleDrawRecords } from '~/game/recordsStorage'
import { SceneKey } from '~/game/sceneKeys'
import { tweenSlideEnter, tweenSlideExitThenStart } from '~/game/sceneSlide'

export class LeaderboardScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container
  private titleText!: Phaser.GameObjects.Text
  private listText!: Phaser.GameObjects.Text
  private backButtonBg!: Phaser.GameObjects.Rectangle
  private backButtonText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: SceneKey.Leaderboard })
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0f0114)

    const w = this.scale.width
    const h = this.scale.height

    this.root = this.add.container(0, 0)

    this.titleText = this.add
      .text(w / 2, 60, 'Лидерборд', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.listText = this.add
      .text(24, 110, this.buildLeaderboardText(), {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '16px',
        color: '#ffffffdd',
        lineSpacing: 6,
        wordWrap: { width: Math.max(220, w - 48) },
      })
      .setOrigin(0, 0)

    this.backButtonBg = this.add
      .rectangle(w / 2, h - 56, 240, 52, 0x229dda, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff, 0.22)
      .setInteractive({ useHandCursor: true })
    this.backButtonText = this.add
      .text(w / 2, h - 56, 'Назад в меню', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '19px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.backButtonBg.on('pointerover', () => this.backButtonBg.setFillStyle(0x229dda, 1))
    this.backButtonBg.on('pointerout', () => this.backButtonBg.setFillStyle(0x229dda, 0.95))
    this.backButtonBg.on('pointerdown', () => this.backButtonBg.setScale(0.985))
    this.backButtonBg.on('pointerup', () => {
      this.backButtonBg.setScale(1)
      tweenSlideExitThenStart(this, this.root, w, 'back', SceneKey.Menu)
    })

    this.root.add([this.titleText, this.listText, this.backButtonBg, this.backButtonText])

    tweenSlideEnter(this, this.root, w)

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
    })
  }

  private buildLeaderboardText(): string {
    const records = getSortedCircleDrawRecords().slice(0, 15)

    if (records.length === 0) {
      return 'Записей пока нет.\n\nНарисуйте круг на сцене игры, чтобы рекорды появились здесь.'
    }

    return records
      .map((record, index) => `${index + 1}. ${record.scorePercent}%  —  ${formatRecordDateTime(record.createdAtMs)}`)
      .join('\n')
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const w = gameSize.width
    const h = gameSize.height

    this.titleText.setPosition(w / 2, 60)
    this.listText.setPosition(24, 110)
    this.listText.setWordWrapWidth(Math.max(220, w - 48))
    this.listText.setText(this.buildLeaderboardText())

    this.backButtonBg.setPosition(w / 2, h - 56)
    this.backButtonText.setPosition(w / 2, h - 56)
  }
}
