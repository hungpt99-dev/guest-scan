import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    globals: true,
  },
});
