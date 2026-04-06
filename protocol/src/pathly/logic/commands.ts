import type { Static } from '@sinclair/typebox/type'
import * as t from '@sinclair/typebox/type'

export namespace Commands {
  export type OpenSlot = Static<typeof OpenSlot>
  export const OpenSlot = t.Object({
    type: t.Literal('OpenSlot'),
  })

  // TODO: Разделить на публичные и приватные команды
  export type Command = Static<typeof Command>
  export const Command = t.Union([OpenSlot])
}
