import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 43147,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 43147,
    strictPort: true,
  },
});
