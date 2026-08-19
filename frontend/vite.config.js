import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on the LAN, not just localhost, so a phone on the same network can reach it
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
