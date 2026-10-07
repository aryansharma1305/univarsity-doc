// ESLint flat config for Node.js services (NestJS API, BullMQ worker) and server-side packages.
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.js';

/** @param {{ tsconfigRootDir: string, nestjs?: boolean }} options */
export function nodeConfig({ tsconfigRootDir, nestjs = false }) {
  return tseslint.config(...baseConfig({ tsconfigRootDir }), {
    languageOptions: { globals: { ...globals.node } },
    rules: nestjs
      ? {
          // NestJS relies on runtime class references for dependency injection and
          // decorator metadata, so injected classes must be imported as values.
          '@typescript-eslint/consistent-type-imports': 'off',
          // Nest modules are declared as empty decorated classes.
          '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
        }
      : {},
  });
}
