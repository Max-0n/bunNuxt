// import { AUTH_TOKEN_KEY } from '~/constants'

const ABORT_TIMEOUT_MS = 15000

export const $api = {
  get: request('GET'),
  post: request('POST'),
  patch: request('PATCH'),
  put: request('PUT'),
  delete: request('DELETE'),
}

function request(method: string) {
  return async (url: string, opts: any = {}, callbacks_: any = {}): Promise<any> => {
    const controller = new AbortController()
    // const token = localStorage.getItem(AUTH_TOKEN_KEY)

    const config = useRuntimeConfig()
    const callbacks = {
      onError: () => {},
      onRequest: () => {},
      onRequestError: () => {},
      onResponse: () => {},
      onResponseError: () => {},
      ...callbacks_,
    }

    const options: any = {
      ...opts,
      method,
      signal: controller.signal,
      baseURL: opts?.baseURL ? opts.baseURL : config.public.apiUrl,
      headers: opts?.baseURL
        ? {
            ...opts?.headers,
            Accept: 'application/json',
          }
        : {
            ...opts?.headers,
            // Authorization: token ? `Bearer ${token}` : ``,
            ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
            Accept: 'application/json',
          },
      // @ts-expect-error
      async onRequest({ request }) {
        // Log request
        if (!import.meta.env.PROD) {
          console.info(`%c Request => `, 'background: #16161a; color: #f2f2f2; line-height: 20px;', request)
        }
        callbacks.onRequest({ request })
      },
      // @ts-expect-error
      async onRequestError({ request }) {
        // push.error({
        //   message: $t('error.request'),
        //   duration: 5000,
        // })
        // Log error
        if (!import.meta.env.PROD) {
          console.info(`%c Request error => `, 'background: #16161a; color: #ff0000; line-height: 20px;', request)
        }
        callbacks.onRequestError({ request })
        callbacks.onError()
      },
      // @ts-expect-error
      async onResponse({ request, response }) {
        // Save config-version header if present
        // const configVersion = response.headers?.get?.('config-version')
        // if (configVersion) {
        //   const appStore = useAppStore()
        //   appStore.setConfigVersion(configVersion)
        // }

        // Log response
        if (!import.meta.env.PROD) {
          console.info(
            `%c Response ${response.status} => `,
            'background: #16161a; color: #4CD964; line-height: 20px;',
            request
          )
        }

        callbacks.onResponse({ request, response })
      },
      // @ts-expect-error
      async onResponseError(context) {
        // const error_code = context.response?._data?.error_code
        // if (
        //   localStorage.getItem(AUTH_TOKEN_KEY) &&
        //   error_code &&
        //   ['NotFound_Session', '📛Invalid_TelegramWebAppInitData', 'User not found'].includes(error_code)
        // ) {
        //   sessionStorage.clear()
        //   localStorage.removeItem(AUTH_TOKEN_KEY)
        //
        //   navigateTo(URLS.INDEX)
        //   setTimeout(location.reload, 2000)
        // }

        const errorData = {
          request: context.request,
          status: context.response?.status,
          data: context.response?._data,
        }
        // Log error with more details
        if (!import.meta.env.PROD) {
          console.error(
            `%c Response error ${context.response?.status} => `,
            'background: #16161a; color: #ff0000; line-height: 20px;',
            errorData
          )
        }
        callbacks.onResponseError(context)
        callbacks.onError(context)

        // Throw the error so it can be caught by try-catch blocks
        throw errorData
      },
    }

    setTimeout(() => controller.abort(), opts.timeout || ABORT_TIMEOUT_MS)

    return await $fetch(url, options)
  }
}
