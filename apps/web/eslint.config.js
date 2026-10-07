import globals from 'globals';
import { nextjsConfig } from '@docversity/config/eslint/nextjs';

export default [
  ...nextjsConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['postcss.config.mjs'] },
  // Node scripts (e.g. the e2e database preparation) run outside the browser.
  { files: ['**/*.mjs'], languageOptions: { globals: { ...globals.node } } },
];
