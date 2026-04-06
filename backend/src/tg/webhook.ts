import { Elysia } from 'elysia'
import { Bot, type Context } from 'grammy'

export type Interval = {
  start: Date
  end: Date
  contains: (date: Date) => boolean
  intersects: (other: Interval) => boolean
}
export const Interval = (start: Date, end: Date): Interval => {
  return {
    start,
    end,
    contains: (date: Date): boolean => start.getTime() <= date.getTime() && date.getTime() >= end.getTime(),
    intersects: (other: Interval): boolean =>
      (start.getTime() >= other.start.getTime() && start.getTime() < other.end.getTime()) ||
      (other.start.getTime() >= start.getTime() && other.start.getTime() < end.getTime()),
  }
}

const inte = Interval(new Date(), new Date())
inte.contains(new Date())
inte.intersects(Interval(new Date(), new Date()))

export const telegramBotWebhook = <Ctx extends Context>(
  tgBot: Bot<Ctx>,
  webhookSecret: string,
  mirror?: {
    tgBot: Bot<Ctx>
    webhookSecret: string
  }
) =>
  new Elysia().post('/telegram-webhook', ({ headers, body, set }) => {
    const secretToken = headers['x-telegram-bot-api-secret-token']
    if (!secretToken) {
      const error_message = 'x-telegram-bot-api-secret-token is empty'
      console.error('/telegram-webhook: ', error_message, 'body = ', body, 'headers = ', headers)
      set.status = 401
      return 'Error'
    }
    const tgBotOrMirror =
      secretToken === webhookSecret ? tgBot : secretToken === mirror?.webhookSecret ? mirror?.tgBot : undefined
    if (!tgBotOrMirror) {
      const error_code = 'WRONG_TOKEN_ERROR'
      console.error('/telegram-webhook: ', error_code, 'body = ', body, 'headers = ', headers)
      set.status = 401
      return 'Error'
    }
    return tgBotOrMirror
      .handleUpdate(body as any)
      .then(_ => 'Ok')
      .catch(e => console.error(e, 'body = ', body, 'headers = ', headers))
  })
