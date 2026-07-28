import { defineConfig, globalIgnores } from 'eslint/config';
import keshet from '@keshet/eslint-config';

const eslintConfig = defineConfig([
  ...keshet,
  globalIgnores(['.next/**', 'node_modules/**', 'coverage/**']),
]);

export default eslintConfig;
