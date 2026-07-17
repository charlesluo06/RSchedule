import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend calls same-origin paths like /terms and /courses. In dev, Vite
// forwards ("proxies") those to the backend on port 3001 — so the browser
// never makes a cross-origin request, and we don't need CORS on the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/terms": "http://localhost:3001",
      "/courses": "http://localhost:3001",
      "/generate": "http://localhost:3001",
    },
  },
});
