import { Config } from '@src/Config'
import { createLogger } from '@src/lib/Logger'

const config = Config()
const Logger = createLogger('api')
const BOT_TOKEN = config.telegram.botToken

export async function sendTelegramInvoice(title: string, description: string, itemId: string, price: number) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        payload: itemId,
        provider_token: '', // Empty for Telegram Stars payments
        currency: 'XTR', // Telegram Stars currency code
        prices: [{ label: title, amount: price }],
        start_parameter: 'start_parameter', // Required for some clients
      }),
    })

    const data = await response.json()

    if (!data.ok) {
      Logger.error('Telegram API error:', { title, description, itemId, price })
      throw new Error('Failed to create invoice')
    }
    const invoiceLink = data.result
    return invoiceLink
  } catch (err) {
    Logger.error(err)
    throw new Error('Failed to create invoice')
  }
}
