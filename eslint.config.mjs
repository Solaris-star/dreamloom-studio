import eslintPluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['**/node_modules', '**/dist', '**/dist-web', '**/out'] },
  ...eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{js,jsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off'
    }
  }
]
