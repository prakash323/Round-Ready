import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * The dev proxy is load-bearing, not a convenience.
 *
 * It makes the browser see one origin in development, so the session cookie is
 * attached without `SameSite=None`, without `Secure`, and therefore without
 * HTTPS. The cross-origin cookie configuration still has to be right for
 * production — it just does not have to be right before anything works
 * locally.
 *
 * `loadEnv` rather than `process.env`: Vite exposes `.env` files to client code
 * through `import.meta.env`, and does *not* put them on `process.env` for the
 * config file. Reading `process.env.VITE_API_PROXY` here silently fell through
 * to the default port — which on a machine where something else owns that port
 * meant the dev server proxied the whole API to another application, and the
 * symptom was a 401 on login rather than anything pointing at the proxy.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY || "http://localhost:5001";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true },
      },
    },
  };
});
