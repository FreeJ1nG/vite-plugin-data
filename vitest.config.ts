import path from 'node:path';
import url from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    reporters: ['verbose'],
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    coverage: {
      enabled: true,
      all: true,
      reporter: ['html', 'text-summary'],
      reportsDirectory: path.resolve(__dirname, 'out/coverage'),
      include: ['**/packages/plugin/src/**'],
      exclude: ['**/__tests__', '**/packages/plugin/src/index.ts'],
    },
  },
});
