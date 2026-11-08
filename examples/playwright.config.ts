import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'checkout.spec.ts',
  reporter: 'line',
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000' },
});
