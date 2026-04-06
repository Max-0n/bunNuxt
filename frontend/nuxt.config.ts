// https://nuxt.com/docs/api/configuration/nuxt-config

import path from 'node:path'
import svgLoader from 'vite-svg-loader'

export default defineNuxtConfig({
  alias: {
    '@cdn': path.resolve(__dirname, '../cdn/src/CDN'),
    '@shared-protocol': path.resolve(__dirname, '../protocol/src/shared'),
  },
  app: {
    head: {
      title: 'Example',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1.0, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0, shrink-to-fit=no',
        },
        { name: 'description', content: '' },
        { name: 'google', content: 'notranslate' },
        { name: 'theme-color', content: '#000000' },

        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/icon/favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon/android-chrome-192x192.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icon/apple-touch-180x180' },
        { rel: 'mask-icon', href: '/icon/triplestudio.svg', color: '#FFFFFF' },
      ],
      script: [{ src: 'https://telegram.org/js/telegram-web-app.js', defer: true }],
    },
  },
  compatibilityDate: '2025-10-30',
  components: true,
  css: ['~/assets/styles/app.scss', 'notivue/notification.css', 'notivue/animations.css'],
  devServer: {
    // https: true,
    port: process.env.APP_PORT ? Number.parseInt(process.env.APP_PORT, 10) : 3000,
  },
  devtools: { enabled: false },
  experimental: {
    defaults: {
      nuxtLink: {
        activeClass: 'is-active',
        exactActiveClass: 'is-exact-active',
      },
    },
  },
  i18n: {
    defaultLocale: 'en',
    compilation: {
      strictMessage: false,
    },
  },
  imports: {
    dirs: ['./composables/**', './components/**', './types/**', './constants/**'],
  },
  modules: [
    '@nuxt/eslint',
    '@pinia/nuxt',
    [
      '@nuxtjs/google-fonts',
      {
        prefetch: true,
        preconnect: true,
        display: 'swap',
        families: {
          Rubik: [300, 400, 500, 600, 700, 800, 900],
        },
      },
    ],
    [
      '@nuxtjs/i18n',
      {
        strategy: 'no_prefix',
        defaultLocale: 'en',
        lazy: true,
        langDir: 'locales',
        detectBrowserLanguage: {
          alwaysRedirect: true,
          fallbackLocale: 'en',
          redirectOn: 'root',
          useCookie: true,
          cookieCrossOrigin: false,
          cookieDomain: null,
          cookieKey: 'i18n_redirected',
          cookieSecure: false,
        },
        locales: [
          {
            code: 'en',
            file: 'en.json',
            name: 'English',
          },
          {
            code: 'ru',
            file: 'ru.json',
            name: 'Русский',
          },
        ],
      },
    ],
    'notivue/nuxt',
  ],
  notivue: {
    position: 'top-center',
    limit: 3,
    enqueue: true,
    notifications: {
      global: {
        duration: 5000,
      },
    },
  },
  pinia: {
    storesDirs: ['./stores/**'],
  },
  // plugins: ['~/plugins/event-bus.ts', '~/plugins/cdn.ts'],
  runtimeConfig: {
    public: {
      apiUrl: process.env.API_URL,
      cdnUrl: process.env.CDN_URL,
    },
  },
  ssr: false,
  typescript: {
    typeCheck: true,
    strict: true,
  },
  vite: {
    server: {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    resolve: {
      alias: {
        '@cdn': path.resolve(__dirname, '../cdn/src/CDN'),
        '@shared-protocol': path.resolve(__dirname, '../protocol/src/shared'),
      },
    },
    plugins: [svgLoader()],
  },
})
