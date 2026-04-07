import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./proof",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "proof/test-results",
  use: {
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
