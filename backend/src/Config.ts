import { PosInteger, URI } from '@shared-protocol/types'
import { SchemaOptions, TSchema as TypeBoxTSchema } from '@sinclair/typebox/type'
import { Value } from '@sinclair/typebox/value'
import { Static, t } from 'elysia'

// ❗️TODO если нужны не строковые значения в конфге, то нужно использовать getEnvJSON вместо getEnv
export type Config = ReturnType<typeof Config>
export const Config = () => ({
  appName: getEnv(
    'APP_NAME',
    t.Union([t.Literal('Local'), t.Literal('Test'), t.Literal('Stage'), t.Literal('Prod')], { default: 'Local' })
  ),
  httpPort: getEnvJSON('HTTP_PORT', PosInteger({ default: 7078 }) as unknown as TypeBoxTSchema),
  jwt_secret_key: getEnv('JWT_SECRET_KEY', t.String({ default: 'Secret_key' })),
  corsCacheMaxAge: getEnvJSON('CORS_CACHE_MAX_AGE', PosInteger({ default: 5 }) as unknown as TypeBoxTSchema),
  telegram: {
    botUrl: getEnv('BOT_URL', t.String()),
    enbaledLangBotButtons: getEnvJSON('TG_BOT_LANG_BUTTONS_ENABLED', t.Boolean({ default: false })),
    botToken: getEnv('TG_BOT_TOKEN', t.String()),
    webhookEnabled: getEnvJSON('TG_BOT_WEBHOOK_ENABLED', t.Boolean()),
    webhookSecret: getEnv('TG_BOT_WEBHOOK_SECRET', t.String()),
    webhookUrl: getEnv('TG_BOT_WEBHOOK_URL', URI() as unknown as TypeBoxTSchema),
    setWebhookAfterLaunch: getEnvJSON('TG_BOT_SET_WEBHOOK_AFTER_LAUNCH', t.Boolean()),
  },
  postgres: {
    host: getEnv('POSTGRES_HOST', t.String()),
    port: getEnv('POSTGRES_PORT', t.String({ default: 5432 })),
    user: getEnv('POSTGRES_USER', t.String()),
    password: getEnv('POSTGRES_PASSWORD', t.String()),
    database: getEnv('POSTGRES_DATABASE', t.String()),
  },
  webAppUrl: getEnv('WEB_APP_URL', t.String()),
  welcomeImage: getEnv('WELCOME_IMAGE', t.String()),
  ton: {
    address: getEnv('TON_ADDRESS', t.String()),
    mnemonic: getEnv('TON_MNEMONIC', t.String()),
    mnemonicNft: getEnv('TON_MNEMONIC_NFT', t.String()),
    centerApiUrl: getEnv('TON_CENTER_API_URL', t.String({ default: 'https://testnet.toncenter.com/api/v2' })),
    centerApiKey: getEnv('TON_CENTER_API_KEY', t.String()),
    tonApiUrl: getEnv('TON_API_URL', t.String({ default: 'https://testnet.tonapi.io' })),
    tonApiKey: getEnv('TON_API_KEY', t.String()),
  },
})

// базовое представление уровней логирования, такие уровни должны быть везде
// если будет необходимость можно расширить
export const LogLevel = (opts?: SchemaOptions) =>
  t.Union([t.Literal('ERROR'), t.Literal('WARN'), t.Literal('INFO'), t.Literal('DEBUG')], opts)
export type LogLevel = Static<ReturnType<typeof LogLevel>>

const getEnvRaw = (key: string): string | undefined => process.env[key]

export const getEnv = <T extends TypeBoxTSchema>(key: string, type: T) => {
  const value = getEnvRaw(key)
  try {
    return Value.Encode(type, Value.Default(type, value))
  } catch (_e) {
    throw `Config env ${key} must be ${JSON.stringify(type)}, but got '${value}'`
  }
}

const getEnvJSON = <T extends TypeBoxTSchema>(key: string, type: T) => {
  const stringValue = getEnvRaw(key)
  try {
    const value = stringValue ? JSON.parse(stringValue) : undefined
    return Value.Decode(type, Value.Default(type, value))
  } catch (_e) {
    throw `Config env ${key} must be ${JSON.stringify(type)}, but got '${stringValue}'`
  }
}
