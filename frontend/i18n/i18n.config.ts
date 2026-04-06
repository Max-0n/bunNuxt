import { russianPlurals } from '@/i18n/plurals'

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  pluralRules: {
    ru: russianPlurals,
  },
}))
