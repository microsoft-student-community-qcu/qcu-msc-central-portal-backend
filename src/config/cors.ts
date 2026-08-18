import type { CorsOptions } from "cors";
import { env } from "./env";

// CORS allowlist for browser origins. Same-origin deployments (backend and
// frontend on the same host under /api) never send a cross-origin Origin
// header, but the admin portal and Vercel preview deployments are separate
// origins and must be listed explicitly.
const allowedOrigins = [
  env.FRONTEND_URL,
  env.ADMIN_FRONTEND_URL,
  // Vercel preview for the migrated (frontend-next) portal.
  "https://qcu-msc-central-portal-frontend-nex.vercel.app",
];

// Origins ending in these suffixes are trusted without an explicit entry:
// Azure Static Web Apps hosts and any *.msc-qcu.tech subdomain.
const isAllowedSuffix = (origin: string): boolean =>
  /\.z23\.web\.core\.windows\.net$/.test(origin) ||
  /\.azurestaticapps\.net$/.test(origin) ||
  /^https:\/\/([a-z0-9-]+\.)?msc-qcu\.tech$/.test(origin);

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Non-browser requests (curl, server-to-server) carry no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isAllowedSuffix(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
};