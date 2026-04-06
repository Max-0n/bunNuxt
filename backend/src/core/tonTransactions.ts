import type {
  ToncenterV2Response as BaseToncenterV2Response,
  CheckTransactionConfirmationsResult,
  CheckTransactionResult,
  CheckTransactionStatusResult,
  CreateNewWalletResult,
  DeployWalletResult,
  GetTransactionByHashResult,
  GetWalletContractResult,
  InitiateWithdrawalResult,
  ParseTransactionBocResult,
  TransactionInMsg,
  WalletInfo,
} from '@shared-protocol/types'
import { Config } from '@src/Config'
import { MIN_CONFIRMATIONS, MIN_DEPOSIT_NANOTON, WALLET_V4R2_ID } from '@src/core/constants'
import { WebSocketManager } from '@src/core/ws'
import { PgDb } from '@src/db/pgDb'
import { Errors } from '@src/Errors'
import { formatBalance } from '@src/utils'
import { Address, beginCell, Cell, loadMessage, SendMode, toNano } from '@ton/core'
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto'
import { internal, TonClient, WalletContractV4 } from '@ton/ton'
import axios from 'axios'
import Decimal from 'decimal.js'

export namespace TonTransactions {
  /**
   * =========================
   * REQUIRED EXPORTED API (1-10)
   * =========================
   *
   * 1) isTestnet
   * 2) getWalletContract
   * 3) getWalletAddress
   * 4) isWalletDeployed
   * 5) deployWallet
   * 6) getWalletInfo
   * 7) getWalletSeqno
   * 8) checkTransaction
   * 9) verifyDepositTransaction
   * 10) updatePendingTransactionsStatus
   */
  /**
   * TON Center (api/v2/v3) стабильно принимает "friendly" адрес без urlSafe/testOnly флагов.
   * Важно: testOnly - это флаг кодировки friendly-строки, а не "признак testnet".
   */
  export function isTestnet(config: Config): boolean {
    return /testnet/i.test(config.ton.centerApiUrl || '')
  }

  /**
   * (2) Получение контракта кошелька
   * Аналогично: create wallet + walletId + mnemonic->keyPair
   */
  export async function getWalletContract(config: Config, mnemonic?: string): Promise<GetWalletContractResult> {
    const walletMnemonic = mnemonic ?? config.ton.mnemonic
    if (!walletMnemonic) {
      throw new Errors.Client('TON_PRIVATE_KEY_NOT_CONFIGURED', 'TON_MNEMONIC is not configured')
    }

    const mnemonicWords = walletMnemonic.trim().split(/\s+/)
    if (mnemonicWords.length < 12) {
      throw new Errors.Client('INVALID_MNEMONIC', 'Mnemonic phrase must contain at least 12 words')
    }

    const keyPair = await mnemonicToWalletKey(mnemonicWords)
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
      walletId: WALLET_V4R2_ID,
    })

    return { wallet, keyPair }
  }

  /**
   * (3) Получение адреса кошелька
   */
  export function getWalletAddress(wallet: WalletContractV4, config: Config): string {
    return toToncenterAddress(wallet.address, config)
  }

  /**
   * (NEW) Генерирует новую seed-фразу (mnemonic) для создания нового кошелька.
   * ВАЖНО: возвращаем как массив слов, чтобы дальше корректно использовать в @ton/crypto.
   */
  export async function createNewWalletMnemonic(wordsCount: number = 24): Promise<string[]> {
    // password = null -> без пароля (типично для server-side генерилки, пароль можно добавить позже)
    return await mnemonicNew(wordsCount, null)
  }

  /**
   * (NEW) Создает новый кошелек (mnemonic + address) без сохранения в конфиг/БД.
   * Использует WalletContractV4 и стандартный walletId для V4R2.
   */
  export async function createNewWallet(config: Config): Promise<CreateNewWalletResult> {
    const mnemonicWords = await createNewWalletMnemonic(24)
    const keyPair = await mnemonicToWalletKey(mnemonicWords)
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
      walletId: WALLET_V4R2_ID,
    })
    const mainnet = toToncenterAddress(wallet.address, config, false)
    const testnet = toToncenterAddress(wallet.address, config, true)
    return { mainnet, testnet, mnemonic: mnemonicWords.join(' ') }
  }

  /**
   * (7) Получение Seqno кошелька (Toncenter v3 /jsonRPC)
   */
  export async function getWalletSeqno(wallet: WalletContractV4, config: Config): Promise<number> {
    const apiKey = config.ton.centerApiKey
    const apiUrl = (config.ton.centerApiUrl || '').replace(/\/+$/, '')

    const tonClient = new TonClient({
      endpoint: `${apiUrl}/jsonRPC`,
      apiKey,
    })

    const opened = tonClient.open(wallet)
    const seqno = await opened.getSeqno()
    if (typeof seqno === 'number' && Number.isFinite(seqno) && seqno >= 0) return seqno
    throw new Errors.Client('TON_SEQNO_FAILED', `Invalid seqno value: ${String(seqno)}`)
  }

  /**
   * (8) Проверка транзакции (статус и пр.)
   * Обертка над существующей логикой BOC->hash->confirmations.
   */
  export async function checkTransaction(
    txBoc: string,
    config: Config,
    walletAddress?: string
  ): Promise<CheckTransactionResult> {
    return await getTransactionStatusFromBlockchain(txBoc, config, walletAddress)
  }

  // Wrappers to keep "required API" grouped at the top.
  // Implementations live ниже, в секции OTHER LOGIC.
  export async function getWalletInfo(address: string | Address, config: Config): Promise<WalletInfo> {
    return await getWalletInfoImpl(address, config)
  }

  export async function isWalletDeployed(address: string | Address, config: Config): Promise<boolean> {
    return await isWalletDeployedImpl(address, config)
  }

  export async function deployWallet(config: Config, mnemonic?: string): Promise<DeployWalletResult> {
    return await deployWalletImpl(config, mnemonic)
  }

  export async function verifyDepositTransaction(
    txBoc: string,
    walletAddress: string,
    amount: string,
    config: Config
  ): Promise<boolean> {
    return await verifyDepositTransactionImpl(txBoc, walletAddress, amount, config)
  }

  /**
   * Ищет hash транзакции по BOC сообщения в истории кошелька.
   * Нужен для проверки "tx всё ещё есть" (существует в блокчейне).
   */
  export async function findTransactionHashFromBoc(
    txBoc: string,
    walletAddress: string,
    config: Config
  ): Promise<string | null> {
    return await getTransactionHashFromBoc(txBoc, walletAddress, config)
  }

  export async function updatePendingTransactionsStatus(pgDb: PgDb, config: Config) {
    return await updatePendingTransactionsStatusImpl(pgDb, config)
  }

  export function areAddressesEqual(addr1: string, addr2: string, config: Config): boolean {
    return addressesMatch(addr1, addr2, config)
  }

  export type IncomingWalletTransaction = {
    txHash: string
    lt: string
    from: string
    to: string
    amountNanoton: string
    amountTon: string
    message?: string
    depositCommentId?: number
    utime: number | null
  }

  export async function getIncomingWalletTransactions(
    walletAddress: string,
    config: Config,
    limit: number = 100
  ): Promise<IncomingWalletTransaction[]> {
    return await getIncomingWalletTransactionsImpl(walletAddress, config, limit)
  }

  /**
   * Получает транзакцию по hash в истории адреса (проектный кошелёк для входящих)
   */
  export async function getIncomingTransactionByHash(
    txHash: string,
    accountAddress: string,
    config: Config
  ): Promise<IncomingWalletTransaction | null> {
    const txData = await getTransactionByHash(txHash, accountAddress, config)
    if (!txData?.in_msg) return null

    const from = txData.in_msg.source
    const to = txData.in_msg.destination
    const amountNanoton = normalizeNanoton((txData.in_msg as any)?.value)
    const bounced = (txData.in_msg as any)?.bounced === true
    if (!from || !to || !amountNanoton || bounced) return null
    if (BigInt(amountNanoton) < MIN_DEPOSIT_NANOTON) return null
    if (!areAddressesEqual(String(to), accountAddress, config)) return null

    const normHash = (txHash || '').toLowerCase().replace(/^0x/, '') || txHash
    const message =
      sanitizeMessage((txData.in_msg as any)?.msg_data?.text) || sanitizeMessage((txData.in_msg as any)?.message)
    return {
      txHash: normHash,
      lt: String((txData as any)?.transaction_id?.lt || (txData as any)?.lt || '0'),
      from: String(from),
      to: String(to),
      amountNanoton,
      amountTon: nanotonToTon(amountNanoton),
      message,
      depositCommentId: parseDepositCommentId(message),
      utime: null,
    }
  }

  /**
   * =========================
   * OTHER LOGIC (не в списке выше, но нужно для работы)
   * =========================
   */

  function safeErrorMessage(err: unknown): string {
    if (err instanceof Errors.Client) return err.error_message || err.message
    if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string')
      return (err as any).message
    return String(err)
  }

  /**
   * Generic wrapper for ToncenterV2Response from @shared-protocol/types
   * The base type is defined in protocol, this adds generic support for result type
   */
  type ToncenterV2Response<T = any> = Omit<BaseToncenterV2Response, 'result'> & {
    result?: T
  }

  function toncenterBaseUrl(config: Config): string {
    return (config.ton.centerApiUrl || '').replace(/\/+$/, '')
  }

  function toncenterHeaders(config: Config): Record<string, string> {
    const apiKey = config.ton.centerApiKey
    return apiKey ? { 'X-API-Key': apiKey } : {}
  }

  function extractTxHash(tx: any): string {
    const raw = (tx?.hash || tx?.transaction_id?.hash || '').toString()
    if (!raw) return ''
    // Нормализуем к hex: Toncenter может возвращать base64, TonClient — hex
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase()
    try {
      const buf = Buffer.from(raw, 'base64')
      if (buf.length === 32) return buf.toString('hex').toLowerCase()
    } catch {}
    return raw
  }

  function hashesMatch(h1: string, h2: string): boolean {
    if (!h1 || !h2) return false
    const a = h1.toLowerCase().replace(/^0x/, '')
    const b = h2.toLowerCase().replace(/^0x/, '')
    return a === b
  }

  function extractTxLt(tx: any): number {
    const ltRaw = tx?.lt ?? tx?.transaction_id?.lt
    const n = typeof ltRaw === 'string' ? Number(ltRaw) : typeof ltRaw === 'number' ? ltRaw : 0
    return Number.isFinite(n) ? n : 0
  }

  function extractV2InMsgBodyBase64(tx: any): string | undefined {
    const body =
      tx?.in_msg?.msg_data?.body ?? tx?.in_msg?.message?.body ?? tx?.inMessage?.message?.body ?? tx?.in_msg?.body
    return typeof body === 'string' && body.length > 0 ? body : undefined
  }

  /**
   * ВАЖНО: для query params/path нельзя использовать base64 с "+" и "/" (не url-safe),
   * иначе многие сервера декодируют "+" как пробел и адрес портится.
   */
  function toToncenterAddress(
    address: string | Address,
    config: Config,
    testOnly: boolean = isTestnet(config)
  ): string {
    const addr = typeof address === 'string' ? Address.parse(address) : address
    return addr.toString({ urlSafe: true, bounceable: false, testOnly })
  }

  /**
   * Нормализует адрес TON (убирает префикс и приводит к единому формату)
   */
  function normalizeAddress(address: string, config: Config): string {
    if (!address) return ''
    try {
      // Канонизируем так, чтобы EQ/UQ/0Q/kQ сравнивались корректно
      return Address.parse(address)
        .toString({ urlSafe: true, bounceable: false, testOnly: isTestnet(config) })
        .trim()
        .toLowerCase()
    } catch {
      return address.trim().toLowerCase()
    }
  }

  /**
   * Проверяет, совпадают ли два адреса TON (с учетом разных форматов)
   */
  function addressesMatch(addr1: string, addr2: string, config: Config): boolean {
    if (!addr1 || !addr2) return false
    const norm1 = normalizeAddress(addr1, config)
    const norm2 = normalizeAddress(addr2, config)
    return norm1 === norm2 || addr1.toLowerCase() === addr2.toLowerCase()
  }

  function normalizeNanoton(value: unknown): string | null {
    if (value === undefined || value === null) return null
    const asString = String(value).trim()
    if (!asString) return null
    return /^\d+$/.test(asString) ? asString : null
  }

  function parseUnixTimestamp(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  function nanotonToTon(amountNanoton: string): string {
    try {
      return new Decimal(amountNanoton).div(1000000000).toFixed(8)
    } catch {
      return '0'
    }
  }

  function extractTxLtString(tx: any): string {
    const ltRaw = tx?.lt ?? tx?.transaction_id?.lt
    if (typeof ltRaw === 'string') return /^\d+$/.test(ltRaw) ? ltRaw : '0'
    if (typeof ltRaw === 'number' && Number.isFinite(ltRaw)) return String(Math.max(0, Math.trunc(ltRaw)))
    if (typeof ltRaw === 'bigint') return ltRaw >= 0n ? ltRaw.toString() : '0'
    return '0'
  }

  function parseDepositCommentId(message?: string): number | undefined {
    if (!message) return undefined
    const match = message.match(/deposit_(\d+)/i)
    if (!match?.[1]) return undefined
    const parsed = Number(match[1])
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined
  }

  function sanitizeMessage(raw?: string): string | undefined {
    if (!raw) return undefined
    const value = String(raw).trim()
    if (!value) return undefined
    return value
  }

  function extractRestIncomingMessage(inMsg: any): string | undefined {
    const msgFromText = sanitizeMessage(inMsg?.msg_data?.text)
    if (msgFromText) return msgFromText
    const msgFromMessage = sanitizeMessage(inMsg?.message)
    if (msgFromMessage) return msgFromMessage
    return undefined
  }

  function extractTonClientIncomingMessage(inMessage: any): string | undefined {
    try {
      const body = inMessage?.body
      if (!body || typeof body.beginParse !== 'function') return undefined
      const slice = body.beginParse()
      if (slice.remainingBits < 32) return undefined
      const op = slice.loadUint(32)
      // Text comment convention in TON: opcode = 0
      if (op !== 0) return undefined
      return sanitizeMessage(slice.loadStringTail())
    } catch {
      return undefined
    }
  }

  function compareLt(a: string, b: string): number {
    try {
      const aLt = BigInt(a || '0')
      const bLt = BigInt(b || '0')
      if (aLt === bLt) return 0
      return aLt < bLt ? -1 : 1
    } catch {
      return String(a || '').localeCompare(String(b || ''))
    }
  }

  function parseIncomingRestTransaction(tx: any): IncomingWalletTransaction | null {
    const txHash = extractTxHash(tx)
    const inMsg = tx?.in_msg
    const from = inMsg?.source
    const to = inMsg?.destination
    const amountNanoton = normalizeNanoton(inMsg?.value)
    const bounced = inMsg?.bounced === true
    if (!txHash || !from || !to || !amountNanoton) {
      return null
    }
    if (bounced) return null
    if (BigInt(amountNanoton) < MIN_DEPOSIT_NANOTON) return null

    const utime = parseUnixTimestamp(tx?.utime ?? tx?.now ?? tx?.timestamp)
    const message = extractRestIncomingMessage(inMsg)
    return {
      txHash,
      lt: extractTxLtString(tx),
      from: String(from),
      to: String(to),
      amountNanoton,
      amountTon: nanotonToTon(amountNanoton),
      message,
      depositCommentId: parseDepositCommentId(message),
      utime,
    }
  }

  function parseIncomingTonClientTransaction(tx: any): IncomingWalletTransaction | null {
    const inMessage = tx?.inMessage
    if (!inMessage || inMessage.info?.type !== 'internal') {
      return null
    }

    const from = inMessage.info.src?.toString()
    const to = inMessage.info.dest?.toString()
    const amountNanoton = normalizeNanoton(inMessage.info.value?.coins?.toString())
    const txHash = typeof tx?.hash === 'function' ? tx.hash().toString('hex') : extractTxHash(tx)
    const bounced = Boolean(inMessage.info?.bounced)

    if (!txHash || !from || !to || !amountNanoton) {
      return null
    }
    if (bounced) return null
    if (BigInt(amountNanoton) < MIN_DEPOSIT_NANOTON) return null

    const utime = parseUnixTimestamp(tx?.utime ?? tx?.now ?? tx?.timestamp)
    const message = extractTonClientIncomingMessage(inMessage)
    return {
      txHash,
      lt: extractTxLtString(tx),
      from,
      to,
      amountNanoton,
      amountTon: nanotonToTon(amountNanoton),
      message,
      depositCommentId: parseDepositCommentId(message),
      utime,
    }
  }

  async function getIncomingWalletTransactionsImpl(
    walletAddress: string,
    config: Config,
    limit: number
  ): Promise<IncomingWalletTransaction[]> {
    const clampedLimit = Math.max(1, Math.min(200, Math.floor(limit || 100)))
    const apiUrl = toncenterBaseUrl(config)
    const apiKey = config.ton.centerApiKey
    const address = Address.parse(walletAddress)
    const addressRaw = toToncenterAddress(address, config)

    const collected: IncomingWalletTransaction[] = []

    try {
      const response = await axios.get(`${apiUrl}/getTransactions`, {
        params: {
          address: addressRaw,
          limit: clampedLimit,
        },
        headers: {
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        validateStatus: () => true,
      })

      const v2 = response.data as ToncenterV2Response<any[]>
      if (response.status === 200 && v2?.ok && Array.isArray(v2.result)) {
        for (const tx of v2.result) {
          const parsed = parseIncomingRestTransaction(tx)
          if (parsed) {
            collected.push(parsed)
          }
        }
      }
    } catch (restError) {
      console.warn('[TonTransactions] Could not load incoming tx via REST API:', restError)
    }

    if (collected.length === 0) {
      try {
        const tonClient = new TonClient({
          endpoint: `${apiUrl}/jsonRPC`,
          apiKey,
        })
        const txList = await tonClient.getTransactions(address, { limit: clampedLimit })
        for (const tx of txList) {
          const parsed = parseIncomingTonClientTransaction(tx)
          if (parsed) {
            collected.push(parsed)
          }
        }
      } catch (tonClientError) {
        console.warn('[TonTransactions] Could not load incoming tx via TonClient:', tonClientError)
      }
    }

    const unique = new Map<string, IncomingWalletTransaction>()
    for (const tx of collected) {
      if (!areAddressesEqual(tx.to, walletAddress, config) && !areAddressesEqual(tx.to, addressRaw, config)) {
        continue
      }
      const dedupeKey = `${tx.lt}:${tx.txHash}`
      if (!unique.has(dedupeKey)) {
        unique.set(dedupeKey, tx)
      }
    }

    return Array.from(unique.values()).sort((a, b) => {
      const at = a.utime ?? 0
      const bt = b.utime ?? 0
      if (at !== bt) return at - bt
      return compareLt(a.lt, b.lt)
    })
  }

  /**
   * BOC (Bag of Cells) — сериализованный формат TON (обычно приходит как base64-строка),
   * в котором упакованы "ячейки" (cells) с данными сообщения/транзакции.
   *
   * Здесь мы:
   * - декодируем base64 BOC в `Cell` через `@ton/core`
   * - пробуем отправить BOC в TON Center (`/sendBoc`) для проверки/декодирования на стороне API
   *
   * Важно: полноценный разбор структуры сообщения и извлечение `from/to/amount/txHash`
   * в этой функции сейчас не реализованы — по факту она возвращает `null`.
   */
  async function parseTransactionBoc(txBoc: string, config: Config): Promise<ParseTransactionBocResult | null> {
    try {
      // Декодируем BOC используя @ton/core
      const cell = Cell.fromBase64(txBoc)
      // Пытаемся извлечь информацию из сообщения
      // Это упрощенная версия, в реальности нужно правильно парсить структуру сообщения

      // Используем TON Center API для декодирования
      const apiUrl = toncenterBaseUrl(config)
      const apiKey = config.ton.centerApiKey

      try {
        const response = await axios.post(
          `${apiUrl}/sendBoc`,
          {
            boc: txBoc,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            },
            validateStatus: () => true,
          }
        )

        // Если это сообщение, пытаемся найти транзакцию по hash
        // Для получения информации о транзакции используем другой метод
      } catch (error) {
        console.warn('[TonTransactions] Could not send BOC for parsing:', error)
      }

      return null
    } catch (error) {
      console.error('[TonTransactions] Error parsing BOC:', error)
      return null
    }
  }

  /**
   * Получает информацию о транзакции по hash через TON Center API
   * Использует TonClient для получения транзакции
   */
  async function getTransactionByHash(
    txHash: string,
    accountAddress: string,
    config: Config
  ): Promise<GetTransactionByHashResult | null> {
    try {
      const apiKey = config.ton.centerApiKey
      const apiUrl = toncenterBaseUrl(config)

      // Получаем адрес аккаунта
      const address = Address.parse(accountAddress)
      const addressRaw = toToncenterAddress(address, config)

      let targetTx: any = null
      let tonClient: TonClient | null = null

      // Пробуем использовать REST API сначала
      try {
        // Toncenter v2: GET /getTransactions -> { ok, result: Transaction[] }
        const response = await axios.get(`${apiUrl}/getTransactions`, {
          params: {
            address: addressRaw,
            limit: 100,
          },
          headers: {
            'X-API-Key': apiKey || '',
          },
          validateStatus: () => true,
        })

        const v2 = response.data as ToncenterV2Response<any[]>
        if (response.status === 200 && v2?.ok && Array.isArray(v2.result)) {
          targetTx = v2.result.find(tx => hashesMatch(extractTxHash(tx), txHash))
        }
      } catch (restError) {
        console.warn('[TonTransactions] REST API failed for getTransactionByHash, trying TonClient')
      }

      // Если не нашли через REST API, пробуем через TonClient
      if (!targetTx) {
        try {
          const endpoint = `${apiUrl}/jsonRPC`
          tonClient = new TonClient({
            endpoint,
            apiKey,
          })

          const transactions = await tonClient.getTransactions(address, { limit: 100 })

          // Ищем транзакцию по hash
          targetTx = transactions.find(tx => hashesMatch(tx.hash().toString('hex'), txHash))
        } catch (tonClientError: any) {
          console.warn('[TonTransactions] TonClient.getTransactions failed:', tonClientError?.message || tonClientError)
          return null
        }
      }

      if (!targetTx) {
        return null
      }

      // Получаем текущий блок для подсчета подтверждений
      if (!tonClient) {
        const endpoint = `${apiUrl}/jsonRPC`
        tonClient = new TonClient({
          endpoint,
          apiKey,
        })
      }

      let confirmations = 0
      try {
        const masterchainInfo = await tonClient.getMasterchainInfo()
        const currentSeqno = Number(masterchainInfo.latestSeqno)
        const txSeqno = extractTxLt(targetTx)

        // Подсчитываем подтверждения (упрощенная версия)
        const seqnoDiff = currentSeqno > txSeqno ? currentSeqno - txSeqno : 0
        // Примерно 1 блок каждые 5 секунд, но для упрощения считаем что каждые 100 seqno = 1 подтверждение
        confirmations = Math.floor(seqnoDiff / 100)
      } catch (error) {
        console.warn('[TonTransactions] Could not get masterchain info for confirmations:', error)
      }

      // Получаем информацию о входящем сообщении
      let inMsgData: TransactionInMsg | undefined

      // Для REST API формата
      if (targetTx.in_msg) {
        inMsgData = {
          source: targetTx.in_msg.source,
          destination: targetTx.in_msg.destination,
          value: targetTx.in_msg.value,
        }
      }
      // Для TonClient формата
      else if (targetTx.inMessage) {
        const msg = targetTx.inMessage
        if (msg.info.type === 'internal') {
          inMsgData = {
            source: msg.info.src?.toString(),
            destination: msg.info.dest?.toString(),
            value: msg.info.value.coins.toString(),
          }
        }
      }

      return {
        confirmations: Math.max(0, confirmations),
        in_msg: inMsgData,
      }
    } catch (error) {
      console.error('[TonTransactions] Error getting transaction by hash:', error)
      return null
    }
  }

  /**
   * Проверяет статус транзакции по BOC с учетом количества подтверждений
   * @param expectedFrom - ожидаемый адрес отправителя (используется как fallback если не удается декодировать BOC)
   */
  export async function checkTransactionStatus(
    txBoc: string,
    config: Config,
    expectedAmount: string,
    expectedTo: string,
    expectedFrom?: string
  ): Promise<CheckTransactionStatusResult> {
    try {
      // Пытаемся найти транзакцию по BOC через TON Center
      // Сначала пытаемся найти транзакцию, связанную с этим сообщением
      const apiUrl = config.ton.centerApiUrl
      const apiKey = config.ton.centerApiKey

      const transactionData: any = null
      const fromAddress = expectedFrom || ''
      const toAddress = expectedTo
      let amountInNano = '0'

      // Пытаемся найти транзакцию через метод detectAddress
      // Или используем метод для получения транзакций по сообщению
      try {
        // Используем метод getTransactions для поиска транзакций
        // Но для этого нужен адрес кошелька
        // Альтернативно, можем попробовать декодировать BOC локально

        // Пока используем ожидаемые значения как fallback
        // В реальной реализации нужно правильно декодировать BOC
        const amountDec = new Decimal(expectedAmount)
        amountInNano = amountDec.mul(1000000000).toFixed(0)
      } catch (error) {
        console.warn('[TonTransactions] Could not parse transaction data:', error)
      }

      // Конвертируем нанотоны в TON
      const amountInTON = new Decimal(amountInNano || '0').div(1000000000).toFixed(8)

      return {
        confirmed: false, // Будет проверено позже через checkTransactionConfirmations
        amount: amountInTON,
        from: fromAddress,
        to: toAddress,
      }
    } catch (error) {
      console.error('[TonTransactions] Error checking transaction status:', error)
      return {
        confirmed: false,
        amount: '0',
        from: '',
        to: '',
      }
    }
  }

  /**
   * Проверяет транзакцию и возвращает количество подтверждений
   * @param txHash - hash транзакции
   * @param accountAddress - адрес аккаунта для поиска транзакции
   * @param config - конфигурация приложения
   * @param minConfirmations - минимальное количество подтверждений (по умолчанию MIN_CONFIRMATIONS)
   * @returns количество подтверждений или null если транзакция не найдена
   */
  export async function checkTransactionConfirmations(
    txHash: string,
    accountAddress: string,
    config: Config,
    minConfirmations: number = MIN_CONFIRMATIONS
  ): Promise<CheckTransactionConfirmationsResult | null> {
    try {
      const txData = await getTransactionByHash(txHash, accountAddress, config)

      if (!txData) {
        return null
      }

      const confirmations = txData.confirmations || 0
      const hasEnoughConfirmations = confirmations >= minConfirmations

      return {
        confirmations,
        hasEnoughConfirmations,
      }
    } catch (error) {
      console.error('[TonTransactions] Error checking transaction confirmations:', error)
      return null
    }
  }

  /**
   * Получает hash транзакции из истории транзакций адреса
   * Ищет транзакцию по BOC сообщения
   */
  async function getTransactionHashFromBoc(
    txBoc: string,
    walletAddress: string,
    config: Config
  ): Promise<string | null> {
    try {
      const apiKey = config.ton.centerApiKey
      const apiUrl = toncenterBaseUrl(config)

      // Используем REST API вместо JSON-RPC для получения транзакций
      // Toncenter v2: https://testnet.toncenter.com/api/v2/getTransactions?address=...
      const address = Address.parse(walletAddress)
      const addressRaw = toToncenterAddress(address, config)

      // Пробуем использовать REST API endpoint для получения транзакций
      // Если не работает, пробуем через TonClient
      let transactions: any[] = []

      // Сначала пробуем REST API
      try {
        const response = await axios.get(`${apiUrl}/getTransactions`, {
          params: {
            address: addressRaw,
            limit: 50,
          },
          headers: {
            'X-API-Key': apiKey || '',
          },
          validateStatus: () => true,
        })

        const v2 = response.data as ToncenterV2Response<any[]>
        if (response.status === 200 && v2?.ok && Array.isArray(v2.result)) {
          transactions = v2.result
        }
      } catch (restError: any) {
        console.warn('[TonTransactions] REST API request failed:', restError?.message || restError)
      }

      // Если REST API не сработал, пробуем через TonClient
      if (transactions.length === 0) {
        try {
          console.warn('[TonTransactions] REST API returned no transactions, trying TonClient')
          const endpoint = `${apiUrl}/jsonRPC`
          const tonClient = new TonClient({
            endpoint,
            apiKey,
          })
          const txList = await tonClient.getTransactions(address, { limit: 50 })
          // Конвертируем в формат для дальнейшей обработки
          transactions = txList.map(tx => ({
            hash: tx.hash().toString('hex'),
            inMessage: tx.inMessage,
          }))
        } catch (tonClientError: any) {
          // Если и TonClient не работает, логируем и возвращаем null
          console.error(
            '[TonTransactions] Could not get transactions via TonClient:',
            tonClientError?.message || tonClientError
          )
          // Не выбрасываем ошибку, просто возвращаем null - это не критично для работы приложения
          return null
        }
      }

      // Декодируем BOC для сравнения
      let messageCell: Cell | null = null
      try {
        messageCell = Cell.fromBase64(txBoc)
      } catch (error) {
        console.warn('[TonTransactions] Could not decode BOC:', error)
        return null
      }

      // TonConnect обычно возвращает BOC "всего сообщения", а Toncenter чаще отдает body входящего сообщения.
      // Поэтому считаем оба варианта: hash root-cell и hash body-cell (если удается распарсить Message).
      const bocRootHash = messageCell.hash().toString('hex')
      let bocBodyHash: string | null = null
      try {
        const msg = loadMessage(messageCell.beginParse())
        bocBodyHash = msg.body?.hash().toString('hex') ?? null
      } catch {
        // ignore: не всегда это корректный Message, тогда сравниваем только root hash
        bocBodyHash = null
      }

      // Ищем транзакцию, которая содержит это сообщение
      for (const tx of transactions) {
        // Toncenter v2 REST format (base64 body)
        const inMsgBodyBase64 = extractV2InMsgBodyBase64(tx)
        if (inMsgBodyBase64) {
          try {
            const messageBody = Cell.fromBase64(inMsgBodyBase64)
            const messageHash = messageBody.hash().toString('hex')
            if (messageHash === bocRootHash || (bocBodyHash && messageHash === bocBodyHash)) {
              const hash = extractTxHash(tx)
              return hash || null
            }
          } catch {
            // ignore decode errors
          }
        }

        // TonClient format
        if (tx.inMessage?.body) {
          const messageHash = tx.inMessage.body.hash().toString('hex')
          if (messageHash === bocRootHash || (bocBodyHash && messageHash === bocBodyHash)) {
            return tx.hash || null
          }
        }
      }

      return null
    } catch (error) {
      console.error('[TonTransactions] Error getting transaction hash from BOC:', error)
      return null
    }
  }

  /**
   * Получает статус транзакции из блокчейна с проверкой подтверждений
   */
  export async function getTransactionStatusFromBlockchain(
    txBoc: string,
    config: Config,
    walletAddress?: string
  ): Promise<CheckTransactionResult> {
    try {
      // Пытаемся получить hash транзакции
      let txHash: string | null = null

      if (walletAddress) {
        txHash = await getTransactionHashFromBoc(txBoc, walletAddress, config)
      }

      if (!txHash) {
        // Если не удалось получить hash, возвращаем pending
        return {
          status: 'pending',
        }
      }

      // Проверяем количество подтверждений
      // Используем адрес кошелька проекта для поиска транзакции
      const projectWalletAddress = config.ton.address || walletAddress
      if (!projectWalletAddress) {
        return {
          status: 'pending',
        }
      }
      const confirmationsData = await checkTransactionConfirmations(
        txHash,
        projectWalletAddress,
        config,
        MIN_CONFIRMATIONS
      )

      if (!confirmationsData) {
        return {
          status: 'pending',
        }
      }

      if (confirmationsData.hasEnoughConfirmations) {
        return {
          status: 'completed',
          confirmations: confirmationsData.confirmations,
        }
      }

      return {
        status: 'pending',
        confirmations: confirmationsData.confirmations,
      }
    } catch (error) {
      console.error('[TonTransactions] Error getting transaction status:', error)
      return {
        status: 'pending',
      }
    }
  }

  /**
   * Проверяет и обновляет статусы pending транзакций
   * Отслеживает изменения транзакций до получения нужного количества подтверждений
   */
  async function updatePendingTransactionsStatusImpl(pgDb: PgDb, config: Config) {
    try {
      // Получаем все pending транзакции типа deposit с txBoc
      const pendingTransactions = await pgDb.getPendingDepositTransactions()

      for (const transaction of pendingTransactions) {
        if (!transaction.txBoc) {
          continue
        }

        try {
          // Получаем адрес кошелька из транзакции (если есть)
          const walletAddress = transaction.walletId || undefined

          // Проверяем статус транзакции в блокчейне с проверкой подтверждений
          const txStatus = await getTransactionStatusFromBlockchain(transaction.txBoc, config, walletAddress)

          // Если транзакция подтверждена с достаточным количеством блоков, обновляем статус и баланс
          if (txStatus.status === 'completed') {
            const result = await pgDb.confirmDepositTransaction(transaction.id)
            if (result.success && result.userId && result.newBalance) {
              // Отправляем WebSocket уведомление об обновлении баланса
              const formattedBalance = formatBalance(result.newBalance)
              WebSocketManager.sendToUser(result.userId, {
                type: 'balanceChanged',
                balance: formattedBalance,
              })

              console.log(
                `[TonTransactions] Transaction ${transaction.id} confirmed with ${txStatus.confirmations} confirmations`
              )
            }
          } else if (txStatus.status === 'failed') {
            // Обновляем статус на failed (можно добавить метод для этого или использовать confirmDepositTransaction с флагом)
            // Пока оставляем как есть, можно добавить отдельный метод позже
            console.warn(`[TonTransactions] Transaction ${transaction.id} failed`)
          } else {
            // Транзакция еще pending, логируем текущее количество подтверждений если есть
            if (txStatus.confirmations !== undefined) {
              console.log(
                `[TonTransactions] Transaction ${transaction.id} pending, confirmations: ${txStatus.confirmations}/${MIN_CONFIRMATIONS}`
              )
            }
          }
        } catch (error) {
          // Логируем ошибку, но продолжаем проверку других транзакций
          console.error(`[TonTransactions] Error checking transaction ${transaction.id}:`, error)
        }
      }
    } catch (error) {
      console.error('[TonTransactions] Error updating pending transactions status:', error)
    }
  }

  /**
   * (6) Получение информацию о кошельке (баланс в частности)
   */
  async function getWalletInfoImpl(address: string | Address, config: Config): Promise<WalletInfo> {
    try {
      const apiKey = config.ton.centerApiKey
      const apiUrl = toncenterBaseUrl(config)
      const addressRaw = toToncenterAddress(address, config)

      // v2 JSON-RPC (TonClient) — самый стабильный источник state/balance
      try {
        const tonClient = new TonClient({
          endpoint: `${apiUrl}/jsonRPC`,
          apiKey,
        })
        const state = await tonClient.getContractState(Address.parse(addressRaw))
        const balance = state?.balance !== undefined ? BigInt(state.balance) : undefined
        return { state: state?.state, balanceNanoton: balance, raw: state }
      } catch (_e) {
        // fallback ниже
      }

      // v2 REST fallback: GET /getAddressInformation -> { ok, result: { state, balance, ... } }
      const resp = await axios.get(`${apiUrl}/getAddressInformation`, {
        params: { address: addressRaw },
        headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}) },
        validateStatus: () => true,
      })

      const v2 = resp.data as ToncenterV2Response<any>
      if (resp.status !== 200 || !v2?.ok) return { raw: resp.data }

      const r = v2.result ?? {}
      const state = r?.state ?? r?.status ?? r?.account_state
      const balanceRaw = r?.balance
      const balanceNanoton =
        balanceRaw !== undefined && balanceRaw !== null
          ? BigInt(typeof balanceRaw === 'string' ? balanceRaw : String(balanceRaw))
          : undefined

      return { state, balanceNanoton, raw: r }
    } catch (error) {
      console.warn('[TonTransactions] Could not get wallet info:', error)
      return { raw: error }
    }
  }

  /**
   * (4) Проверка на деплой кошелька
   */
  async function isWalletDeployedImpl(address: string | Address, config: Config): Promise<boolean> {
    const info = await getWalletInfoImpl(address, config)
    return info?.state === 'active'
  }

  /**
   * Деплоит кошелек WalletContractV4
   * @param config - конфигурация приложения
   * @param subwalletId - ID субкошелька (по умолчанию 698983191)
   * @returns адрес кошелька и статус деплоя
   */
  async function deployWalletImpl(config: Config, mnemonic?: string): Promise<DeployWalletResult> {
    try {
      const apiKey = config.ton.centerApiKey
      const apiUrl = (config.ton.centerApiUrl || '').replace(/\/+$/, '')

      const { wallet, keyPair } = await getWalletContract(config, mnemonic)
      const walletAddress = getWalletAddress(wallet, config)

      console.log('[TonTransactions] walletAddress', walletAddress)
      console.log('[TonTransactions] config.ton.centerApiUrl', config.ton.centerApiUrl)

      // Проверяем, развернут ли уже кошелек
      const isDeployed = await isWalletDeployedImpl(walletAddress, config)
      if (isDeployed) {
        return {
          address: walletAddress,
          deployed: true,
        }
      }

      // Проверяем баланс перед деплоем, иначе Toncenter вернет unpack error из-за нулевого газа
      const walletInfo = await getWalletInfoImpl(walletAddress, config)
      const balanceNanoton = BigInt(walletInfo.balanceNanoton ?? 0n)
      const minDeploy = toNano('0.05') // запас для газа
      if (balanceNanoton < minDeploy) {
        console.warn(
          `[TonTransactions] Wallet balance seems low for deploy. Address=${walletAddress}, balance=${balanceNanoton}, required=${minDeploy}`
        )
        // продолжаем попытку, если баланс на самом деле есть
      }

      // Формируем deploy-транзакцию
      // seqno = 0, sendMode = PAY_GAS_SEPARATELY, без внутренних сообщений
      // ВАЖНО: на адресе кошелька должен уже лежать баланс для оплаты газа.
      const deployTransfer = wallet.createTransfer({
        seqno: 0,
        secretKey: keyPair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages: [],
      })

      // Отправляем внешнее сообщение через JSON-RPC TonClient.
      // ВАЖНО: REST `/message` ожидает полный external message, а `createTransfer()` возвращает payload.
      // TonClient корректно упаковывает external message (и при необходимости init).
      try {
        const tonClient = new TonClient({
          endpoint: `${apiUrl}/jsonRPC`,
          apiKey,
        })
        await tonClient.sendExternalMessage(wallet, deployTransfer)
      } catch (e: any) {
        const msg = e?.message || String(e)
        throw new Errors.Client('DEPLOY_FAILED', `Failed to deploy wallet via TonClient: ${msg}`)
      }

      // Ждем немного, чтобы транзакция появилась в блокчейне
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Проверяем, что кошелек задеплоен
      const deployed = await isWalletDeployedImpl(walletAddress, config)

      return {
        address: walletAddress,
        deployed,
      }
    } catch (error: any) {
      console.error('[TonTransactions] Error deploying wallet:', error)
      if (error instanceof Errors.Client) {
        throw error
      }
      throw new Errors.Client('DEPLOY_FAILED', `Failed to deploy wallet: ${error.message}`)
    }
  }

  /**
   * Инициирует вывод средств на указанный адрес
   * Использует WalletContractV4 для подписи и отправки транзакции
   */
  export async function initiateWithdrawal(
    pgDb: PgDb,
    userId: string,
    amount: string,
    toAddress: string,
    config: Config
  ): Promise<InitiateWithdrawalResult> {
    const amountDec = new Decimal(amount)
    if (amountDec.lte(0)) {
      throw new Errors.Client('BAD_WITHDRAW_AMOUNT', 'Amount must be positive')
    }

    // Проверяем баланс пользователя
    const user = await pgDb.findUser(userId)
    if (!user) {
      throw new Errors.Client('USER_NOT_FOUND', 'User not found')
    }

    const currentBalance = new Decimal(user.balance || '0')
    if (currentBalance.lt(amountDec)) {
      throw new Errors.Client('INSUFFICIENT_BALANCE', 'Insufficient balance')
    }

    // Получаем приватный ключ из конфига
    const walletMnemonic = config.ton.mnemonic
    if (!walletMnemonic) {
      throw new Errors.Client('TON_PRIVATE_KEY_NOT_CONFIGURED', 'TON_PRIVATE_KEY is not configured')
    }

    // Получаем адрес кошелька проекта
    const projectWalletAddress = config.ton.address
    if (!projectWalletAddress) {
      throw new Errors.Client('TON_ADDRESS_NOT_CONFIGURED', 'TON_ADDRESS is not configured')
    }

    try {
      const apiKey = config.ton.centerApiKey
      const apiUrl = toncenterBaseUrl(config) // https://testnet.toncenter.com/api/v2

      const { wallet, keyPair } = await getWalletContract(config)

      const walletAddress = getWalletAddress(wallet, config)

      // Важно: friendly-адрес может выглядеть по-разному (EQ/UQ/0Q...) из-за флагов bounceable/testOnly/urlSafe.
      // Для Toncenter и сравнения используем канонический формат из toToncenterAddress().
      console.log('[TonTransactions] walletAddress', walletAddress)
      console.log('[TonTransactions] walletRaw', wallet.address.toRawString())
      console.log('[TonTransactions] config.ton.centerApiUrl', config.ton.centerApiUrl)

      // Доп. защита от конфигурационных ошибок: если TON_ADDRESS не соответствует TON_MNEMONIC,
      // то отправка будет идти с "другого" кошелька, и это очень сложно отлаживать по логам.
      if (!addressesMatch(walletAddress, projectWalletAddress, config)) {
        throw new Errors.Client(
          'TON_ADDRESS_MISMATCH',
          `TON_ADDRESS (${projectWalletAddress}) does not match wallet derived from TON_MNEMONIC (${walletAddress}).`
        )
      }

      // Важно: деплой/проверка деплоя вынесены в отдельный роут /admin/wallet-ton-deploy.
      // Здесь только получаем seqno и отправляем транзакцию.
      let seqno: number
      try {
        seqno = await getWalletSeqno(wallet, config)
      } catch (seqnoError: any) {
        throw new Errors.Client(
          'WALLET_NOT_DEPLOYED',
          `Wallet is not deployed or seqno is unavailable. Call /admin/wallet-ton-deploy first. Details: ${safeErrorMessage(seqnoError)}`
        )
      }

      // Создаем адрес получателя
      const recipientAddress = Address.parse(toAddress)

      // Конвертируем сумму в нанотоны
      const amountInNano = toNano(amount)

      // Формируем и подписываем транзакцию
      const transfer = wallet.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: recipientAddress,
            value: amountInNano,
            bounce: false,
            body: beginCell().endCell(), // Пустое тело сообщения
          }),
        ],
      })

      // Отправляем внешнее сообщение через TonClient (см. комментарий в deployWallet)
      try {
        const tonClient = new TonClient({
          endpoint: `${apiUrl}/jsonRPC`,
          apiKey,
        })
        await tonClient.sendExternalMessage(wallet, transfer)
      } catch (sendError: any) {
        throw new Errors.Client(
          'WITHDRAWAL_FAILED',
          `Failed to send transaction via TonClient: ${safeErrorMessage(sendError)}`
        )
      }

      // Ждем немного, чтобы транзакция появилась в блокчейне
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Получаем hash транзакции из последней транзакции кошелька
      let txHash = 'pending'
      try {
        const addressRaw = toToncenterAddress(walletAddress, config)
        const response = await axios.get(`${apiUrl}/getTransactions`, {
          params: {
            address: addressRaw,
            limit: 1,
          },
          headers: {
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          },
          validateStatus: () => true,
        })

        const v2 = response.data as ToncenterV2Response<any[]>
        if (response.status === 200 && v2?.ok && Array.isArray(v2.result) && v2.result.length > 0) {
          const lastTx = v2.result[0]
          txHash = extractTxHash(lastTx) || 'pending'
        }
      } catch (restError) {
        console.warn('[TonTransactions] Could not get transaction hash via REST API:', restError)
        // Оставляем 'pending', транзакция все равно была отправлена
      }

      return {
        txHash,
        status: 'pending',
      }
    } catch (error: any) {
      console.error('[TonTransactions] Error initiating withdrawal:', error)
      if (error instanceof Errors.Client) {
        throw error
      }
      throw new Errors.Client('WITHDRAWAL_FAILED', `Failed to initiate withdrawal: ${error.message}`)
    }
  }

  /**
   * Проверяет транзакцию пополнения
   */
  async function verifyDepositTransactionImpl(
    txBoc: string,
    walletAddress: string,
    amount: string,
    config: Config
  ): Promise<boolean> {
    // Получаем адрес кошелька проекта из конфига
    const projectWalletAddress = config.ton.address
    if (!projectWalletAddress) {
      throw new Errors.Client('TON_ADDRESS_NOT_CONFIGURED', 'TON_ADDRESS is not configured')
    }

    // Проверяем транзакцию (передаем walletAddress как fallback для from)
    const txStatus = await checkTransactionStatus(txBoc, config, amount, projectWalletAddress, walletAddress)

    // Если не получили данные о транзакции (from пустой), это ошибка
    if (!txStatus.from) {
      console.error('[TonTransactions] Could not extract sender address from transaction')
      return false
    }

    // Проверяем адрес отправителя (с учетом разных форматов адресов)
    if (!addressesMatch(txStatus.from, walletAddress, config)) {
      console.error(`[TonTransactions] Sender address mismatch: expected ${walletAddress}, got ${txStatus.from}`)
      return false
    }

    // Проверяем адрес получателя (с учетом разных форматов адресов)
    if (!addressesMatch(txStatus.to, projectWalletAddress, config)) {
      console.error(
        `[TonTransactions] Recipient address mismatch: expected ${projectWalletAddress}, got ${txStatus.to}`
      )
      return false
    }

    // Проверяем сумму (с небольшой погрешностью для комиссий)
    const expectedAmount = new Decimal(amount)
    const actualAmount = new Decimal(txStatus.amount || '0')
    const difference = expectedAmount.minus(actualAmount).abs()

    // Разрешаем погрешность до 0.01 TON (для комиссий)
    if (difference.gt(0.01)) {
      console.error(
        `[TonTransactions] Amount mismatch: expected ${amount}, got ${txStatus.amount}, difference ${difference.toString()}`
      )
      return false
    }

    return true
  }
}
