import type { GetNftsResult, SendNftParams, SendNftResult, TonApiNftItem } from '@shared-protocol/types'
import { Config } from '@src/Config'
import { TonTransactions } from '@src/core/tonTransactions'
import { Errors } from '@src/Errors'

export type { TonApiNftItem } from '@shared-protocol/types'

import { Address, beginCell, Cell, toNano } from '@ton/core'
import { internal, TonClient } from '@ton/ton'
import axios from 'axios'
import Decimal from 'decimal.js'

export namespace TonNft {
  /**
   * Получение всех NFT, принадлежащих кошельку проекта (derived from TON_MNEMONIC).
   *
   * Реализация использует TonAPI (т.к. Toncenter v2 не дает удобного "list NFTs by owner").
   */
  export async function getNfts(config: Config): Promise<GetNftsResult> {
    const { wallet } = await TonTransactions.getWalletContract(config, config.ton.mnemonicNft)
    const owner = TonTransactions.getWalletAddress(wallet, config)
    const url = `${config.ton.tonApiUrl}/v2/accounts/${encodeURIComponent(owner)}/nfts`

    const resp = await axios.get(url, {
      params: {
        // best-effort: TonAPI поддерживает разные параметры в разных версиях,
        // поэтому не полагаемся строго на них.
        limit: 1000,
        indirect_ownership: true,
      },
      headers: tonApiHeaders(config),
      validateStatus: () => true,
    })

    if (resp.status < 200 || resp.status >= 300) {
      throw new Errors.Client(
        'TON_NFT_LIST_FAILED',
        `TonAPI returned ${resp.status}: ${stringifyTonApiError(resp.data)}`
      )
    }

    // TonAPI обычно возвращает { nft_items: [...] }
    const data: any = resp.data
    const items: TonApiNftItem[] = Array.isArray(data?.nft_items)
      ? data.nft_items
      : Array.isArray(data?.items)
        ? data.items
        : []

    return { owner, items, raw: resp.data }
  }

  /**
   * Отправка NFT (NFT Item contract) на любой TON адрес.
   *
   * Используем Toncenter JSON-RPC через TonClient (endpoint = `${TON_CENTER_API_URL}/jsonRPC`).
   * Вызов делается как internal message на адрес NFT-item с opcode transfer (0x5fcc3d14).
   */
  export async function sendNft(config: Config, params: SendNftParams): Promise<SendNftResult> {
    const { nftAddress, toAddress } = params
    if (!nftAddress?.trim()) throw new Errors.Client('BAD_NFT_ADDRESS', 'nftAddress is required')
    if (!toAddress?.trim()) throw new Errors.Client('BAD_TO_ADDRESS', 'toAddress is required')

    const forwardAmountTon = (params.forwardAmountTon ?? '0').toString()
    const queryId = params.queryId ?? 0n

    const { wallet, keyPair } = await TonTransactions.getWalletContract(config, config.ton.mnemonicNft)
    const walletAddress = TonTransactions.getWalletAddress(wallet, config)

    // seqno бросит понятную ошибку, если кошелек не задеплоен
    const seqno = await TonTransactions.getWalletSeqno(wallet, config)

    const nftAddr = Address.parse(nftAddress)
    const newOwner = Address.parse(toAddress)
    const responseDest = Address.parse(params.responseAddress?.trim() || walletAddress)

    const forwardPayload = params.comment?.trim() ? makeTextCommentCell(params.comment.trim()) : null

    // Standard NFT transfer body (TEP-62 / common wallet implementations):
    // op (32) = 0x5fcc3d14
    // query_id (64)
    // new_owner: MsgAddress
    // response_destination: MsgAddress
    // custom_payload: Maybe ^Cell
    // forward_amount: Coins
    // forward_payload: Either Cell ^Cell
    const body = beginCell()
      .storeUint(0x5fcc3d14, 32)
      .storeUint(queryId, 64)
      .storeAddress(newOwner)
      .storeAddress(responseDest)
      .storeBit(false) // no custom_payload
      .storeCoins(toNano(forwardAmountTon))

    if (forwardPayload) {
      body.storeBit(true).storeRef(forwardPayload)
    } else {
      body.storeBit(false)
    }

    const transferBody = body.endCell()

    const sendAmountTon = pickSendAmountTon(params.sendAmountTon, forwardAmountTon)
    const valueToNft = toNano(sendAmountTon)

    const transfer = wallet.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: nftAddr,
          value: valueToNft,
          bounce: true,
          body: transferBody,
        }),
      ],
    })

    const apiUrl = (config.ton.centerApiUrl || '').replace(/\/+$/, '')
    const tonClient = new TonClient({
      endpoint: `${apiUrl}/jsonRPC`,
      apiKey: config.ton.centerApiKey,
    })

    try {
      await tonClient.sendExternalMessage(wallet, transfer)
    } catch (e: any) {
      throw new Errors.Client('TON_NFT_SEND_FAILED', `Failed to send NFT: ${safeErrorMessage(e)}`)
    }

    // best-effort txHash (как в initiateWithdrawal)
    let txHash = 'pending'
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      const resp = await axios.get(`${apiUrl}/getTransactions`, {
        params: { address: walletAddress, limit: 1 },
        headers: config.ton.centerApiKey ? { 'X-API-Key': config.ton.centerApiKey } : {},
        validateStatus: () => true,
      })
      const data: any = resp.data
      const last = Array.isArray(data?.result) ? data.result[0] : null
      const hash = (last?.hash || last?.transaction_id?.hash || '').toString()
      if (hash) txHash = hash
    } catch {
      // ignore
    }

    return { txHash, status: 'pending' }
  }

  function tonApiHeaders(config: Config): Record<string, string> {
    const key = config.ton.tonApiKey
    if (!key) return {}
    // TonAPI чаще всего принимает Authorization: Bearer, но на некоторых проксях прокидывают X-API-Key.
    return {
      Authorization: `Bearer ${key}`,
      'X-API-Key': key,
    }
  }

  function stringifyTonApiError(data: unknown): string {
    try {
      if (typeof data === 'string') return data
      return JSON.stringify(data)
    } catch {
      return String(data)
    }
  }

  function safeErrorMessage(err: unknown): string {
    if (err instanceof Errors.Client) return err.error_message || err.message
    if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string')
      return (err as any).message
    return String(err)
  }

  function makeTextCommentCell(comment: string): Cell {
    // Standard "text comment" payload: op = 0, then UTF-8 string tail.
    return beginCell().storeUint(0, 32).storeStringTail(comment).endCell()
  }

  function pickSendAmountTon(explicit: string | undefined, forwardAmountTon: string): string {
    if (explicit?.trim()) return explicit.trim()

    // Default budget: 0.07 TON, but ensure it's >= forward_amount + small overhead
    // (wallet -> nft gas + nft -> newOwner forward message).
    const overhead = new Decimal('0.02')
    const fwd = new Decimal(forwardAmountTon || '0')
    const min = fwd.plus(overhead)
    const base = new Decimal('0.07')
    const picked = Decimal.max(base, min)
    return picked.toFixed(8)
  }
}
