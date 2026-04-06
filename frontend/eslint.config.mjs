// eslint.config.mjs

import vuePugPlugin from 'eslint-plugin-vue-pug'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  plugins: {
    'vue-pug': vuePugPlugin,
  },
  rules: {
    ...vuePugPlugin.configs['vue3-recommended'].rules,
    '@typescript-eslint/no-explicit-any': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    '@typescript-eslint/ban-ts-comment': 'off',
    'vue/script-setup-uses-vars': 'error', // Это правило сообщает линтеру о переменных в script setup
    '@typescript-eslint/no-unused-vars': 'off',
    'vue/require-default-prop': 'off',
  },
})
