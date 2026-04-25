// =============================================================================
// AL FILO — Next.js Middleware
//
// Adds security headers, rate-limits API routes, and refreshes Supabase sessions.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LOCALE_COOKIE, isLocale, pickLocaleFromAcceptLanguage } from "@/i18n/config";

// ─── Simple in-memory rate limiter (per-IP, resets every window) ────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120;          // max requests per window per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Periodic cleanup to prevent memory leak (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);

// ─── Middleware ──────────────────────────────────────────────────────────────

// ─── MANTENIMIENTO — quitar estas líneas para reactivar la web ───────────────
const MAINTENANCE_MODE = false;

export async function middleware(request: NextRequest) {
  if (MAINTENANCE_MODE) {
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>En mantenimiento</title>
<style>body{margin:0;background:#0F172A;color:#F1F5F9;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
h1{font-size:2rem;color:#3B82F6}p{color:#94A3B8}</style></head>
<body><div><h1>SC Manager</h1><p>Estamos realizando tareas de mantenimiento.<br>Volvemos pronto.</p></div></body></html>`;
    return new NextResponse(html, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3600",
      },
    });
  }

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Rate limiting for API routes only
  if (isApi) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  }

  // Refresh Supabase auth session (handles token refresh via cookies)
  const response = await updateSession(request);

  // Persist detected locale on first visit so next-intl keeps it stable.
  if (!isApi) {
    const current = request.cookies.get(LOCALE_COOKIE)?.value;
    if (!isLocale(current)) {
      const detected = pickLocaleFromAcceptLanguage(
        request.headers.get("accept-language"),
      );
      response.cookies.set(LOCALE_COOKIE, detected, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // Prevent MIME sniffing on API responses
  if (isApi) {
    response.headers.set("Content-Type", "application/json");
    if (request.method === "POST") {
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }

  return response;
}

// Only run on pages and API routes (skip static assets)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|ships/|media/|fonts/).*)",
  ],
};
