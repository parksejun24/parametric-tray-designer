import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ["**/test-results/**", "**/playwright-report/**", "**/.omx/**"],
    },
  },
  test: {
    environment: "node",
    setupFiles: [],
    include: ["tests/{unit,integration,properties,independent-dxf,browser,algorithm-viability,fixtures}/**/*.test.ts"],
  },
});
