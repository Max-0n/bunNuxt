import type { Update } from '@grammyjs/types/update'
import { Config } from '@src/Config'
import { LogicAuthorization } from '@src/core/authorization'
import { PgDb } from '@src/db/pgDb'
import { PaymentPayload } from '@src/types'
import { Clock, canAuthenticate } from '@src/utils'
import { Bot, Context, GrammyError, InlineKeyboard, SessionFlavor, session } from 'grammy'
import { InlineKeyboardButton } from 'grammy/types'
import { Logger } from 'tslog'
import { getLang, getLangLabel, Lang } from './Lang'
import locale from './locale'

export type TelegramBot = Awaited<ReturnType<typeof create>>

/**
 * Основная функция создания и настройки Telegram бота
 *
 * Инициализирует бота, настраивает сессии, вебхуки, обработчики команд и событий.
 * Поддерживает два режима работы: webhook и long polling.
 *
 * @param arg - Параметры инициализации:
 *   - tgConfig: конфигурация Telegram (токен, URL вебхука, секретный токен)
 *   - config: общая конфигурация приложения
 *   - pgDb: подключение к PostgreSQL базе данных
 *   - clock: утилита для работы со временем
 * @returns Объект с экземпляром бота и информацией о боте (me)
 */
const create = async (arg: { tgConfig: Config['telegram']; config: Config; pgDb: PgDb; clock: Clock }) => {
  const { tgConfig, config, pgDb, clock } = arg
  const bot = new Bot<MyContext>(tgConfig.botToken)

  /**
   * Функция инициализации данных сессии пользователя
   * Вызывается при создании новой сессии для пользователя
   *
   * @returns Начальные данные сессии:
   *   - lang: язык пользователя (определяется автоматически или undefined)
   *   - showLangBts: флаг отображения кнопок выбора языка (из конфига)
   */
  const initial = (): SessionData => {
    return {
      lang: undefined,
      showLangBts: tgConfig.enbaledLangBotButtons,
    }
  }

  bot.use(session({ initial }))
  log.debug('Wait question from TG...')

  // Настройка вебхука (если включено в конфиге)
  if (tgConfig.setWebhookAfterLaunch) {
    const webhookInfo = await bot.api.getWebhookInfo()
    const allowed_updates: Exclude<keyof Update, 'update_id'>[] = [
      'message',
      'chat_member',
      'my_chat_member',
      'callback_query',
      'shipping_query',
      'inline_query',
      'business_message',
      'chat_join_request',
      'chosen_inline_result',
      'pre_checkout_query',
    ]
    const isAlreadySet_webHookUrl = webhookInfo.url === tgConfig.webhookUrl
    const isAlreadySet_allowedUpdaes = allowed_updates.every(update => webhookInfo.allowed_updates?.includes(update))
    if (isAlreadySet_webHookUrl && isAlreadySet_allowedUpdaes) {
      log.warn(`Config setWebhookAfterLaunch === true but already set`, {
        isAlreadySet_webHookUrl,
        isAlreadySet_allowedUpdaes,
        webhookInfo,
      })
    } else {
      log.info('Telegram setWebhook...')
      const setResult = await bot.api.setWebhook(tgConfig.webhookUrl as string, {
        secret_token: tgConfig.webhookSecret,
        allowed_updates: allowed_updates,
      })
      log.info(`Telegram setWebhook result: ${setResult}`)
    }
  }

  // Проверка подключения к Telegram API
  const me = await bot.api.getMe().catch(e => {
    if (e instanceof GrammyError) {
      throw `TelegramBot did not start bot.api.getMe(). Check your env.TG_BOT_TOKEN. Error: ${e.message}`
    } else {
      throw e
    }
  })
  log.debug(`Bot is connected! Username = @${me.username}`)

  // Установка кнопки меню бота (Web App)
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '🚀 Play',
      web_app: { url: `${config.telegram.botUrl}/app` },
    },
  })

  /**
   * Команда /lang - отображает текущий язык клиента и сессии
   * Полезно для отладки и проверки локализации
   */
  bot.command('lang', async ctx => {
    ctx.from?.language_code &&
      (await ctx.reply(`Client language: ${ctx.from.language_code}. \nSession language: ${ctx.session.lang || '-'}`))
  })

  /**
   * Команда /enable_lang_buttons - включает отображение кнопок выбора языка
   * Сохраняет настройку в сессии пользователя
   */
  bot.command('enable_lang_buttons', async ctx => {
    ctx.reply(`Enabled lang buttons ✅`).then(() => {
      ctx.session.showLangBts = true
    })
  })

  /**
   * Команда /get_webapp_links - показывает ссылки на веб-приложение для разработки
   * Создает кнопки для перехода на localhost версии приложения через прокси
   * Также показывает кнопку авторизации (если пользователь имеет права)
   */
  bot.command('get_webapp_links', async ctx => {
    const redirectProxy = 'https://wow.thememebox.io/redirect-localhost'
    ctx.reply(`👇 WebApp localhost links`, {
      reply_markup: InlineKeyboard.from([
        [
          InlineKeyboard.webApp(
            `Redirect to http://localhost:${config.httpPort}/public/playground2.html`,
            `${redirectProxy}/${config.httpPort}/public/playground2.html`
          ),
        ],
        [InlineKeyboard.webApp(`Redirect to http://localhost:3000`, `${redirectProxy}/3000`)],
        canAuthenticate(ctx.from?.id) ? [InlineKeyboard.text('Authenticate', 'Auth')] : [],
      ]),
    })
  })

  /**
   * Команда /disable_lang_buttons - отключает отображение кнопок выбора языка
   * Сохраняет настройку в сессии пользователя
   */
  bot.command('disable_lang_buttons', async ctx => {
    ctx.reply(`Disabled lang buttons`).then(() => {
      ctx.session.showLangBts = false
    })
  })

  /**
   * Команда /start - главная команда бота, приветствие пользователя
   *
   * Отправляет приветственное сообщение с фото и кнопками:
   * - Определяет язык пользователя (из сессии или по language_code)
   * - Загружает изображение с CDN и отправляет его как фото
   * - При ошибке отправки фото отправляет текстовое сообщение
   * - Сохраняет текущую страницу в сессии
   */
  bot.command('start', async ctx => {
    if (!ctx.from) return

    const from = ctx.from
    const lang: Lang = ctx.session.lang || getLang(ctx.from.language_code)
    const fromLog = `[${ctx.from.id} ${ctx.from.first_name} ${ctx.from?.username}]`
    const __replyStart = replyStart(lang, ctx.from.first_name, !!ctx.session.showLangBts, config.telegram.botUrl, {
      baseUrl: config.webAppUrl,
      welcomeImage: config.welcomeImage,
    })
    const _replyStart = async () => {
      const pageId = 'Start'
      const params = () => ({ firstName: from.first_name })
      try {
        await ctx.api.sendPhoto(ctx.chat.id, __replyStart.body.photo, {
          caption: __replyStart.answer,
          parse_mode: __replyStart.body.parse_mode,
          reply_markup: __replyStart.body.reply_markup,
        })
        ctx.session.currentPage = { id: pageId, params: params }
        console.debug(`${fromLog} -> send msg: {{${pageId}}}`)
      } catch (error) {
        console.error('Error sending photo:', error)
        await ctx.reply(__replyStart.answer, __replyStart.body)
      }
    }

    _replyStart()
  })

  /**
   * Обработчик события chat_member - изменение статуса участника чата
   * В данный момент только логирует событие, функционал не реализован
   */
  bot.on('chat_member', async ctx => {
    console.info(`chat_member! ${JSON.stringify(ctx)}`)
    if (!ctx.chatMember.new_chat_member) return
  })

  /**
   * Обработчик pre_checkout_query - предварительная проверка платежа
   * Автоматически подтверждает все платежи (возвращает true)
   * Используется для платежей через Telegram Payments
   */
  bot.on('pre_checkout_query', async ctx => {
    try {
      return await ctx.answerPreCheckoutQuery(true)
    } catch {
      console.error('answerPreCheckoutQuery failed')
    }
  })

  /**
   * Обработчик successful_payment - успешный платеж
   *
   * Обрабатывает успешные платежи через Telegram Payments:
   * - Парсит данные заказа из invoice_payload
   * - В данный момент только логирует платеж
   * - Заглушка для выдачи наград (закомментирована)
   */
  bot.on('message:successful_payment', async ctx => {
    if (!ctx.message || !ctx.message.successful_payment || !ctx.from) {
      return
    }
    const payment = ctx.message.successful_payment

    const _orderData: PaymentPayload = JSON.parse(payment.invoice_payload)
    // await LogicShop.givePurchaseRewards(pgDb, cacheClient, sseController, conf, ctx.from.id.toString(), orderData)
    console.info(ctx.message.successful_payment)
    return
  })

  /**
   * Команда /auth - авторизация пользователя и получение токена доступа
   *
   * Процесс авторизации:
   * 1. Проверяет права пользователя на авторизацию (canAuthenticate)
   * 2. Создает или обновляет пользователя в базе данных через LogicAuthorization.signupUser
   * 3. Возвращает Bearer токен для использования в API
   *
   * Используется для получения токена доступа к API приложения
   */
  bot.command('auth', async ctx => {
    if (!ctx.from) return
    if (!canAuthenticate(ctx.from.id)) {
      await ctx.reply('ERROR: Not implemented')
      await ctx.answerCallbackQuery()
      return
    }

    try {
      const tgUser = {
        id: ctx.from.id,
        isBot: false,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        languageCode: ctx.from.language_code,
        isPremium: ctx.from.is_premium,
      }
      const result = await LogicAuthorization.signupUser({
        now: clock.getNow(),
        pgDb,
        headers: {},
        telegramData: tgUser,
      })

      await ctx.reply('👇 Grab a new authorization token```\nBearer ' + result.authToken + '\n```', {
        parse_mode: 'Markdown',
      })
    } catch (e) {
      console.error(`Telegram auth error`, e)
      if (e && typeof e === 'object' && 'message' in e) {
        await ctx.reply(`ERROR: ${e.message}`)
      } else if (typeof e === 'string') {
        await ctx.reply(`ERROR: "${e}"`)
      }
    }
    return
  })

  /**
   * Обработчик текстовых сообщений (message:text)
   *
   * Обрабатывает все текстовые сообщения в приватных чатах:
   * - Определяет язык пользователя
   * - Отправляет приветственное сообщение с фото (аналогично /start)
   * - Сохраняет текущую страницу в сессии
   *
   * По сути, любой текст в приватном чате приводит к показу стартового экрана
   */
  bot.on('message:text', async ctx => {
    if (!ctx.from || ctx.chat.type !== 'private') return
    const lang: Lang = ctx.session.lang || getLang(ctx.from.language_code)
    const fromLog = `[${ctx.from.id} ${ctx.from.first_name} ${ctx.from?.username}]`
    log.debug(`${fromLog} <- new msg: ${ctx.message.text}`)
    const pageId = 'Start'
    const pageParams = () => ({ firstName: ctx.from.first_name })

    const _replyStart = replyStart(lang, ctx.from.first_name, !!ctx.session.showLangBts, config.telegram.botUrl, {
      baseUrl: config.webAppUrl,
      welcomeImage: config.welcomeImage,
    })

    try {
      await ctx.api.sendPhoto(ctx.chat.id, _replyStart.body.photo, {
        caption: _replyStart.answer,
        parse_mode: _replyStart.body.parse_mode,
        reply_markup: _replyStart.body.reply_markup,
      })
      ctx.session.currentPage = { id: pageId, params: pageParams }
      log.debug(`${fromLog} -> send msg: {{${pageId}}}`)
    } catch (error) {
      log.error('Error sending photo:', error)
      await ctx.reply(_replyStart.answer, _replyStart.body)
    }
  })

  // Обработчик всех ошибок бота
  bot.catch(console.error.bind(console))

  // Инициализация бота в зависимости от режима работы
  if (tgConfig.webhookEnabled) {
    await bot.init()
    log.info('Webhook inited!')
  } else {
    // KS: Если не сделать вызов bot.init, то при вызове App.Stop() бот падает с ошибкой
    await bot.init()
    bot.start()
    log.info('Long pulling started!')
  }

  return { bot, me }
}

const log = new Logger({
  name: 'TgBot',
  hideLogPositionForProduction: true,
  prettyLogTemplate: '{{name}} ',
})

type PageId = 'Start' | 'HowToEarn' | 'Referral' | 'RefLink'
type PageParams<LC extends PageId, L extends Lang> = Parameters<(typeof locale)[LC][L]>[0]
type Page<_PageId extends PageId> = {
  id: PageId
  params: (lang: Lang) => PageParams<_PageId, typeof lang>
}
interface SessionData {
  lang?: Lang
  showLangBts?: boolean
  currentPage?: Page<PageId>
}
export type MyContext = Context & SessionFlavor<SessionData>

/**
 * Создает клавиатуру с кнопками для стартового экрана
 *
 * @param lang - текущий язык пользователя
 * @param showLangBts - флаг отображения кнопок выбора языка
 * @param botUrl - URL веб-приложения бота
 * @returns InlineKeyboard с кнопкой "Начни играть!" и кнопками выбора языка (если включены)
 */
const btn = (lang: Lang, showLangBts: boolean, botUrl: string): InlineKeyboard => {
  const Barcode = {
    btn: InlineKeyboard.url('Начни играть! 🔥', `${botUrl}/app`),
  }
  return InlineKeyboard.from([[Barcode.btn], langBtns(showLangBts, lang)])
}

/**
 * Создает массив кнопок для выбора языка
 *
 * @param showLangBts - флаг отображения кнопок (если false, возвращает пустой массив)
 * @param currentLang - текущий язык пользователя (не показывается в списке)
 * @returns Массив кнопок для выбора языка (все языки кроме текущего)
 */
const langBtns = (showLangBts: boolean, currentLang: Lang) =>
  showLangBts
    ? (Object.keys(locale.Start)
        .map(lang => (currentLang !== lang ? InlineKeyboard.text(getLangLabel(lang as Lang), lang) : undefined))
        .filter(_ => _) as InlineKeyboardButton.CallbackButton[])
    : []

/**
 * Формирует ответ для команды /start
 *
 * Создает структуру данных для отправки приветственного сообщения:
 * - Текст приветствия
 * - Параметры форматирования (Markdown)
 * - Клавиатуру с кнопками
 * - URL изображения с CDN
 *
 * @param lang - язык пользователя
 * @param _firstName - имя пользователя (не используется в текущей реализации)
 * @param showLangBts - флаг отображения кнопок выбора языка
 * @param botUrl - URL веб-приложения бота
 * @param cdn - конфигурация CDN (baseUrl и welcomeImage)
 * @returns Объект с текстом ответа и параметрами отправки (body)
 */
const replyStart = (
  lang: Lang,
  _firstName: string,
  showLangBts: boolean,
  botUrl: string,
  cdn: { baseUrl: string; welcomeImage: string }
) => {
  return {
    answer: 'Play triple studio',
    body: {
      parse_mode: 'Markdown' as const,
      reply_markup: btn(lang, showLangBts, botUrl),
      photo: `${cdn.baseUrl}/${cdn.welcomeImage}`,
    },
  }
}

export default { create, btn }
