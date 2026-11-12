import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/cli/staff-role.unit.test.ts'],
    globalSetup: [],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
