import { nextjsConfig } from '@docversity/config/eslint/nextjs';

export default [
  ...nextjsConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['postcss.config.mjs'] },
];
