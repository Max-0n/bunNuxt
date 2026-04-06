import locale from './locale'

export type Lang = keyof typeof locale.Start

export const getLang = (languageCode?: string): Lang => {
  if (!languageCode) return 'en'
  else if (['ru', 'ua', 'kz'].includes(languageCode)) return 'ru'
  else if (['ar', 'cl', 'co', 'mx', 'pe'].includes(languageCode)) return 'latam'
  else if ('uz' === languageCode) return 'uz'
  else if ('vn' === languageCode) return 'vn'
  else if ('br' === languageCode) return 'br'
  else return 'en'
}

export const getLangLabel = (lang: Lang) => {
  switch (lang) {
    case 'ru':
      return '🇷🇺' // Россия
    case 'en':
      return '🇺🇸' // США, обычно используется для английского
    case 'latam':
      return '🇲🇽' // Мексика, в качестве представителя Латинской Америки
    case 'uz':
      return '🇺🇿' // Узбекистан
    case 'vn':
      return '🇻🇳' // Вьетнам
    case 'br':
      return '🇧🇷' // Бразилия
  }
}
