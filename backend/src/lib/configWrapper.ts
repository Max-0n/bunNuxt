import { createHash } from 'node:crypto'
import {
  PathlyConfig,
  PublicBarcodeConfig,
  type PublicBarcodeConfig as PublicBarcodeConfigType,
} from '@pathly-protocol/config'
import { applyToggles, nextDateAfterNow } from '@shared-protocol/toggle'
import { TSchema } from '@sinclair/typebox/type'
import { Value } from '@sinclair/typebox/value'

// Интерфейс выглядит так, будто бы этот враппер stateless,
// и стейт сделан как оптимизация, чтобы на каждый запрос не заниматься перефильтрованием конфига
// TODO переделать на обобщённый тип конфига
export type PathlyConfigWrapper = {
  nextUpdateDate: Date | undefined
  conf: PathlyConfig
  publicConf: {
    value: PublicBarcodeConfig
    str: string
    hash: string
  }
}

const make = (now: Date, conf: PathlyConfig): PathlyConfigWrapper => {
  const [currentConf, nextServerUpdateDate] = applyToggles(conf, now, 'server')
  const [currentClientConf, nextClientUpdateDate] = applyToggles(conf, now, 'client')

  const currentPublicConf = Value.Cast(
    PublicBarcodeConfig as unknown as TSchema,
    Value.Clean(PublicBarcodeConfig as unknown as TSchema, Value.Clone(currentClientConf))
  )
  const nextUpdateDate = nextDateAfterNow([nextServerUpdateDate, nextClientUpdateDate], now)

  const currentPublicStr = JSON.stringify(Value.Decode(PublicBarcodeConfig as unknown as TSchema, currentPublicConf))
  const currentPublicHash = createHash('sha256').update(currentPublicStr).digest('base64url')
  console.info(
    `config has been updated, current version is ${currentPublicHash}, next update at ${nextUpdateDate?.toISOString()}`
  )

  return {
    nextUpdateDate,
    conf: currentConf,
    publicConf: {
      value: currentPublicConf as PublicBarcodeConfigType,
      str: currentPublicStr,
      hash: currentPublicHash,
    },
  }
}

export const create = (conf: PathlyConfig, startDate: Date) => {
  let state = make(startDate, conf)

  const getCurrent = (now: Date) => {
    if (!!state.nextUpdateDate && now >= state.nextUpdateDate) state = make(now, conf)

    return state
  }

  return { getCurrent }
}

export default { create }
