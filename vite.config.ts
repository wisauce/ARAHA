import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/v1": {
        target: "https://ai.sumopod.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
