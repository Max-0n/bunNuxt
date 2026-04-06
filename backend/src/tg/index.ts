import crypto from 'node:crypto'
import { safeJsonParse } from '@src/utils'
export interface WebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  usernames?: string[]
  is_bot?: boolean
  is_premium?: boolean
  added_to_attachment_menu?: boolean
  allows_write_to_pm?: boolean
  language_code?: string
  photo_url?: string
}

export const verifyInitData = (arg: { botToken: string; initData: string }): WebAppUser | undefined => {
  const urlParams = new URLSearchParams(arg.initData)

  const hash = urlParams.get('hash')
  urlParams.delete('hash')
  urlParams.sort()

  let dataCheckString = ''
  for (const [key, value] of urlParams.entries()) {
    dataCheckString += `${key}=${value}\n`
  }
  dataCheckString = dataCheckString.slice(0, -1)

  const secret = Uint8Array.from(crypto.createHmac('sha256', 'WebAppData').update(arg.botToken).digest())
  const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (calculatedHash === hash) {
    const userJson = urlParams.get('user')
    const telegramUser = userJson && safeJsonParse<WebAppUser>(userJson)
    if (!telegramUser) throw Error('Telegram WebApp InitData: query param `user` is not json')
    const id = telegramUser.id
    if (!id || !+id) throw Error('Telegram WebApp InitData: user id not found in initData')
    const first_name = telegramUser.first_name
    if (!first_name) throw Error('Telegram WebApp InitData: first_name not found in initData')
    return telegramUser
  } else return undefined
}
