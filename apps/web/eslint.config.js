import globals from 'globals';
import { nextjsConfig } from '@docversity/config/eslint/nextjs';

export default [
  ...nextjsConfig({ tsconfigRootDir: import.meta.dirname }),
  // Preserve Claude's local screenshot recovery script without treating it as shipped source.
  { ignores: ['postcss.config.mjs', '.ui02-shots.mjs'] },
  // Node scripts (e.g. the e2e database preparation) run outside the browser.
  { files: ['**/*.mjs'], languageOptions: { globals: { ...globals.node } } },
];
