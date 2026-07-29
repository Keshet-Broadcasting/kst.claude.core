import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores(['.next/**', 'node_modules/**', 'coverage/**', '.claude/**']),
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/embeds/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='script']",
          message:
            '<script> tags outside @/shared/lib/embeds are forbidden — use loadEmbedScript from @/shared/lib/embeds.',
        },
        {
          selector: 'JSXOpeningElement[name.name=/-/]',
          message:
            'Hyphenated (custom-element) JSX tags are only allowed under src/shared/embeds/*.',
        },
      ],
    },
  },
  {
    files: [
      'src/entities/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
      'src/widgets/**/*.{ts,tsx}',
      'src/views/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/entities/*/*', '@/features/*/*', '@/widgets/*/*', '@/views/*/*'],
              message: "Import from the slice's index.ts, not a path deeper than the slice root.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
