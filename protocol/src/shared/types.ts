import type { IntegerOptions, Static, StringOptions, TObject } from '@sinclair/typebox/type'
import * as t from '@sinclair/typebox/type'

export const PosInteger = (options: IntegerOptions = {}) => t.Integer({ ...options, minimum: 1 })

export const URI = (options: StringOptions = {}) => t.String(options && { format: 'uri' })

// Представление даты как ISO строки на проводе
export const Date2Str = (options = {}) =>
  t
    .Transform(t.Date(options))
    .Decode(value => value.toISOString())
    .Encode(value => new Date(value))

// Объявить объект, у которого поля заполнены значениями по умолчанию
export const DObject = <T extends TObject>(schema: T, options = {}): T =>
  t.Object(schema.properties, { default: {}, ...options }) as T

export type Publicity = 'public' | 'private' | 'full'
export const ObjectWithSecrets = <P extends Publicity, TPublic extends t.TObject, TPrivate extends t.TObject>(
  p: P,
  pub: TPublic,
  priv: TPrivate
): P extends 'public' ? TPublic : P extends 'private' ? TPrivate : t.Intersect<[TPublic, TPrivate]> =>
  (p === 'public' ? pub : p === 'private' ? priv : t.Intersect([pub, priv])) as never

export type IpInfo = Static<typeof IpInfo>
export const IpInfo = t.Object({
  ip: t.String(),
  country_code: t.Optional(t.String()),
  city_name: t.Optional(t.String()),
  latitude: t.Optional(t.String()),
  longitude: t.Optional(t.String()),
  asn: t.Optional(t.String()),
  asn_org: t.Optional(t.String()),
})

const Fingerprint = t.Object({
  visitorId: t.Optional(t.String()),
  version: t.Optional(t.String()),
  components: t.Optional(t.Object({})),
})

export type AuthHeaders = Static<typeof AuthHeaders>
export const AuthHeaders = t.Object({
  authorization: t.String(),
  'user-agent': t.Optional(t.String()),
})

export type AuthTelegramWebApp_Req = Static<typeof AuthTelegramWebApp_Req>
export const AuthTelegramWebApp_Req = t.Object({
  initDataRaw: t.String(),
  fingerprint: t.Optional(Fingerprint),
  trafficId: t.Optional(t.String()),
  referralId: t.Optional(t.String()),
})

/** Telegram WebApp `user` JSON (decoded from initData). */
export type WebAppUser = Static<typeof WebAppUser>
export const WebAppUser = t.Object({
  id: t.Number(),
  first_name: t.String(),
  last_name: t.Optional(t.String()),
  username: t.Optional(t.String()),
  usernames: t.Optional(t.Array(t.String())),
  is_bot: t.Optional(t.Boolean()),
  is_premium: t.Optional(t.Boolean()),
  added_to_attachment_menu: t.Optional(t.Boolean()),
  allows_write_to_pm: t.Optional(t.Boolean()),
  language_code: t.Optional(t.String()),
  photo_url: t.Optional(t.String()),
})

export type UserShortDTO = Static<typeof UserShortDTO>
export const UserShortDTO = t.Object({
  id: t.String(),
  avatar: t.String(),
  username: t.String(),
  // Баланс пользователя в строковом формате (Decimal)
  balance: t.String(),
})

export type AuthWithMerge_Resp = Static<typeof AuthWithMerge_Resp>
export const AuthWithMerge_Resp = t.Object({
  authUserId: t.String(),
  authToken: t.String(),
  status: t.String(),
})

export type UserRanking = Static<typeof UserRanking>
export const UserRanking = t.Object({
  id: t.String(),
  username: t.String(),
  avatar: t.String(),
  rating: t.Number(),
  rank: t.Number(),
})

export type LeaderboardUsersResult = Static<typeof LeaderboardUsersResult>
export const LeaderboardUsersResult = t.Object({
  top: t.Array(UserRanking),
  position: t.Number(),
})

// Types from tonNft.ts
export const NftMetadataAttribute = t.Object({
  trait_type: t.String(),
  value: t.String(),
})
export type NftMetadataAttribute = Static<typeof NftMetadataAttribute>

export const NftMetadata = t.Intersect([
  t.Object({
    name: t.String(),
    image: t.String(),
    description: t.String(),
    attributes: t.Optional(t.Array(NftMetadataAttribute)),
    animation_url: t.Optional(t.String()),
  }),
  t.Record(t.String(), t.Any()),
])
export type NftMetadata = Static<typeof NftMetadata>

export const TonApiNftItem = t.Object(
  {
    address: t.Optional(t.String()),
    owner: t.Optional(
      t.Object({
        address: t.Optional(t.String()),
      })
    ),
    collection: t.Optional(
      t.Object({
        address: t.Optional(t.String()),
        name: t.Optional(t.String()),
      })
    ),
    metadata: t.Optional(NftMetadata),
    previews: t.Optional(
      t.Array(
        t.Object({
          url: t.Optional(t.String()),
          resolution: t.Optional(t.String()),
        })
      )
    ),
  },
  {
    additionalProperties: true,
  }
)
export type TonApiNftItem = Static<typeof TonApiNftItem>

export const GetNftsResult = t.Object({
  owner: t.String(),
  items: t.Array(TonApiNftItem),
  raw: t.Any(),
})
export type GetNftsResult = Static<typeof GetNftsResult>

export const SendNftParams = t.Object({
  nftAddress: t.String(),
  toAddress: t.String(),
  forwardAmountTon: t.Optional(
    t.String({
      description:
        'Сколько TON переслать новому владельцу как forward_amount (обычно 0). Это сумма, которую NFT-контракт отправит дальше в forward message.',
    })
  ),
  sendAmountTon: t.Optional(
    t.String({
      description:
        'Сколько TON отправить на сам NFT-контракт (газ + forward_amount). Если не задано — посчитаем автоматически.',
    })
  ),
  comment: t.Optional(
    t.String({
      description: 'Комментарий (будет передан как forward_payload).',
    })
  ),
  responseAddress: t.Optional(
    t.String({
      description: 'Куда слать response_destination (по умолчанию — адрес кошелька проекта).',
    })
  ),
  queryId: t.Optional(
    t.Any({
      description: 'query_id (по умолчанию 0).',
    })
  ),
})
export type SendNftParams = Omit<Static<typeof SendNftParams>, 'queryId'> & {
  /**
   * query_id (по умолчанию 0).
   */
  queryId?: bigint
}

export const SendNftResult = t.Object({
  txHash: t.String(),
  status: t.Literal('pending'),
})
export type SendNftResult = Static<typeof SendNftResult>

// Types from tonTransactions.ts
export const ToncenterV2Response = t.Object({
  ok: t.Boolean(),
  result: t.Optional(t.Any()),
  error: t.Optional(t.Any()),
  code: t.Optional(t.Number()),
})
export type ToncenterV2Response = Static<typeof ToncenterV2Response>

export const CreateNewWalletResult = t.Object({
  mainnet: t.String(),
  testnet: t.String(),
  mnemonic: t.String(),
})
export type CreateNewWalletResult = Static<typeof CreateNewWalletResult>

export const TransactionStatus = t.Union([t.Literal('pending'), t.Literal('completed'), t.Literal('failed')])
export type TransactionStatus = Static<typeof TransactionStatus>

export const CheckTransactionResult = t.Object({
  status: TransactionStatus,
  blockTime: t.Optional(Date2Str()),
  confirmations: t.Optional(t.Number()),
})
export type CheckTransactionResult = Static<typeof CheckTransactionResult>

export const WalletInfo = t.Object({
  state: t.Optional(t.String()),
  balanceNanoton: t.Optional(t.Union([t.String(), t.Number()])),
  raw: t.Optional(t.Any()),
})
export type WalletInfo = Omit<Static<typeof WalletInfo>, 'balanceNanoton'> & {
  balanceNanoton?: bigint
}

export const DeployWalletResult = t.Object({
  address: t.String(),
  deployed: t.Boolean(),
})
export type DeployWalletResult = Static<typeof DeployWalletResult>

export const TransactionInMsg = t.Object({
  source: t.Optional(t.String()),
  destination: t.Optional(t.String()),
  value: t.Optional(t.String()),
})
export type TransactionInMsg = Static<typeof TransactionInMsg>

export const GetTransactionByHashResult = t.Object({
  confirmations: t.Number(),
  in_msg: t.Optional(TransactionInMsg),
})
export type GetTransactionByHashResult = Static<typeof GetTransactionByHashResult>

export const CheckTransactionStatusResult = t.Object({
  confirmed: t.Boolean(),
  amount: t.String(),
  from: t.String(),
  to: t.String(),
})
export type CheckTransactionStatusResult = Static<typeof CheckTransactionStatusResult>

export const CheckTransactionConfirmationsResult = t.Object({
  confirmations: t.Number(),
  hasEnoughConfirmations: t.Boolean(),
})
export type CheckTransactionConfirmationsResult = Static<typeof CheckTransactionConfirmationsResult>

export const ParseTransactionBocResult = t.Object({
  from: t.String(),
  to: t.String(),
  amount: t.String(),
  txHash: t.Optional(t.String()),
})
export type ParseTransactionBocResult = Static<typeof ParseTransactionBocResult>

export const InitiateWithdrawalResult = t.Object({
  txHash: t.String(),
  status: t.Literal('pending'),
})
export type InitiateWithdrawalResult = Static<typeof InitiateWithdrawalResult>

// Runtime values come from @ton/* in the backend; protocol keeps them untyped (t.Any / unknown).
export const GetWalletContractResult = t.Object({
  wallet: t.Any(),
  keyPair: t.Any(),
})
export type GetWalletContractResult = {
  wallet: unknown
  keyPair: unknown
}

// Types from PgDb (backend/src/db/pgDb.ts)
export const UpsertNftsResult = t.Object({
  insertedOrUpdated: t.Number(),
})
export type UpsertNftsResult = Static<typeof UpsertNftsResult>

export const InsertNftsIfNotExistsResult = t.Object({
  inserted: t.Number(),
})
export type InsertNftsIfNotExistsResult = Static<typeof InsertNftsIfNotExistsResult>

export const UserMeResponse = t.Object({
  id: t.String(),
  username: t.String(),
  avatar: t.String(),
})
export type UserMeResponse = Static<typeof UserMeResponse>

export const WithdrawRequestStatus = t.Union([t.Literal('pending'), t.Literal('payed'), t.Literal('rejected')])
export type WithdrawRequestStatus = Static<typeof WithdrawRequestStatus>

export const MyWithdrawRequest = t.Object({
  id: t.Number(),
  amount: t.String(),
  toAddress: t.String(),
  status: WithdrawRequestStatus,
  createdAt: t.String(),
  confirmedAt: t.Optional(t.String()),
  txHash: t.Optional(t.String()),
})
export type MyWithdrawRequest = Static<typeof MyWithdrawRequest>

export const AdminWithdrawRequestStatusResponse = t.Object({
  id: t.Number(),
  status: WithdrawRequestStatus,
  confirmedAt: t.Optional(t.String()),
  txHash: t.Optional(t.String()),
})
export type AdminWithdrawRequestStatusResponse = Static<typeof AdminWithdrawRequestStatusResponse>

// Уровни реферальных наград: { minReferrals: percent }
// Отсортированы по убыванию minReferrals для удобства поиска текущего уровня
export const REFERRAL_REWARD_TIERS = [
  { minReferrals: 100, percent: 15 },
  { minReferrals: 50, percent: 12.5 },
  { minReferrals: 0, percent: 10 },
] as const

export type ReferralRewardTier = (typeof REFERRAL_REWARD_TIERS)[number]

/** Возвращает процент награды по кол-ву рефералов */
export function getReferralRewardPercent(referralCount: number): number {
  for (const tier of REFERRAL_REWARD_TIERS) {
    if (referralCount >= tier.minReferrals) return tier.percent
  }
  return REFERRAL_REWARD_TIERS[REFERRAL_REWARD_TIERS.length - 1]?.percent ?? 10
}

export const Referral_Resp = t.Object({
  invitedCount: t.Number(),
  rewardTon: t.String(),
  rewardPercent: t.Number(),
})
export type Referral_Resp = Static<typeof Referral_Resp>

export type GameMode = 'pvp' | 'duel' | 'limit' | '32'
export const GameMode = t.Union([t.Literal('pvp'), t.Literal('duel'), t.Literal('limit'), t.Literal('32')])

/**
 * Унифицированный сценарий расчёта по цвету в режиме 32.
 * Используется на backend, но хранится в protocol как shared-тип.
 */
export type Solo32ColorScenario<TWinningBet = unknown, TAmount = unknown> = {
  // Цвет, для которого считается сценарий выплат.
  color: 'light' | 'dark' | 'red'
  // Список ставок, которые считаются победившими при этом цвете.
  winningBets: TWinningBet[]
  // Полная сумма, которую нужно выплатить победителям при этом цвете.
  requestedPayout: TAmount
  // Сумма проигравших ставок (вклад в экономику раунда) при этом цвете.
  losingAmount: TAmount
}

/** Free Roll prizes: probabilityPercent -> prizeAmountTon (shared server/client) */
export const FREE_ROLL_PRIZES = [
  { probabilityPercent: 10, prizeTon: '0.1' },
  { probabilityPercent: 5, prizeTon: '0.3' },
  { probabilityPercent: 3, prizeTon: '0.5' },
  { probabilityPercent: 1, prizeTon: '1' },
  { probabilityPercent: 2, prizeTon: '0.1' },
  { probabilityPercent: 3, prizeTon: '0.3' },
] as const

export type FreeRollPrize = (typeof FREE_ROLL_PRIZES)[number]

// User Stats types
export const UserStats = t.Object({
  gamesPlayed: t.Number(),
  totalWon: t.String(),
  biggestWin: t.String(),
})
export type UserStats = Static<typeof UserStats>

// Games History types
export const HistoryRoundWinner = t.Object({
  userId: t.String(),
  firstName: t.Optional(t.String()),
  avatar: t.Optional(t.String()),
  bankAmount: t.String(),
  winChance: t.Number(),
})
export type HistoryRoundWinner = Static<typeof HistoryRoundWinner>

export const HistoryRound = t.Object({
  roundId: t.Number(),
  game: GameMode,
  bankAmount: t.String(),
  winnerColor: t.Optional(t.String()),
  finishedAt: t.String(),
  winners: t.Array(HistoryRoundWinner),
  nfts: t.Array(t.Any()),
})
export type HistoryRound = Static<typeof HistoryRound>
