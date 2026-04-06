import type { Static } from '@sinclair/typebox/type'
import * as t from '@sinclair/typebox/type'

export * from './utils'

export type EnvName = Static<typeof EnvName>
export const EnvName = t.Union([t.Literal('prod'), t.Literal('stage'), t.Literal('test'), t.Literal('local')])
