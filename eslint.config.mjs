import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'build/**',
      'resources/**/*',
      '!resources/media/',
      '!resources/media/*.cjs',
      '!resources/media-worker.cjs',
      '!resources/recorder-effects.js',
      '!resources/recorder-effects-preload.cjs',
      '!resources/recorder-countdown.js',
      '!resources/recorder-region.js',
      '!resources/recorder-preload.cjs',
      '.local/**',
      '.artifacts/**',
      'internal-plugins/system/public/vendor/**',
      'internal-plugins/system/presentation/**',
      'internal-plugins/system/public/presentation-backend.cjs',
      'internal-plugins/system/public/presentation-preload.cjs',
      '_*',
      '_*/**'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ],
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ]
    }
  },
  {
    files: ['internal-plugins/system/**/*.{js,cjs,vue}'],
    rules: {
      // The integrated upstream clipboard UI uses JavaScript with JSDoc signatures.
      '@typescript-eslint/explicit-function-return-type': 'off',
      'vue/block-lang': ['error', { script: { lang: 'js' } }]
    }
  },
  {
    files: ['internal-plugins/system/src/components/rename/*.vue'],
    rules: {
      // batch-rename 复用组件保留上游 TypeScript 属性与事件类型。
      'vue/block-lang': ['error', { script: { lang: 'ts' } }]
    }
  },
  {
    files: ['internal-plugins/system/public/*.{js,cjs}'],
    rules: {
      // Electron 预加载与生命周期模块直接使用 CommonJS，类型签名由 JSDoc 描述。
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    files: [
      'scripts/*.cjs',
      'resources/backup-worker.cjs',
      'resources/media/*.cjs',
      'resources/media-worker.cjs',
      'resources/recorder-*.{js,cjs}'
    ],
    rules: {
      // These files execute directly in Node/Electron CommonJS; their signatures use JSDoc.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)
