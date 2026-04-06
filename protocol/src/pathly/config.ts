import type { Publicity } from '@shared-protocol/types'
import { ObjectWithSecrets } from '@shared-protocol/types'
import type { Static } from '@sinclair/typebox/type'
import * as t from '@sinclair/typebox/type'
import { EnvName } from '../shared/config'

export const Lang = t.Union([
  t.Literal('ru'),
  t.Literal('en'),
  t.Literal('latam'),
  t.Literal('uz'),
  t.Literal('vn'),
  t.Literal('br'),
])

export type PathlyConfig = Static<ReturnType<typeof PathlyConfig<'full'>>>
export const PathlyConfig = <P extends Publicity>(p: P) =>
  ObjectWithSecrets(
    p,

    // public part
    t.Object({
      guideLink: t.Partial(t.Record(Lang, t.String())),
      cdn: t.Object({
        baseUrl: t.String(),
        welcomeImage: t.String(),
      }),
      subscribeChannelUrl: t.String(),
    }),
    // private part
    t.Object({
      webAppUrl: t.String(),
      // NOTE тестовые поля
      testSecret: t.Optional(t.String()),
      env: EnvName,
    })
  )

export type PublicBarcodeConfig = Static<typeof PublicBarcodeConfig>
export const PublicBarcodeConfig = PathlyConfig('public')
