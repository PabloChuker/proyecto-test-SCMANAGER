import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cookie max-age: 30 days (matching Supabase refresh token TTL)
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Ensure cookies persist across browser sessions
              maxAge: options?.maxAge ?? COOKIE_MAX_AGE,
              path: options?.path ?? "/",
              sameSite: options?.sameSite ?? "lax",
              httpOnly: options?.httpOnly ?? true,
              secure: process.env.NODE_ENV === "production",
            })
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT run any Supabase logic between createServerClient
  // and supabase.auth.getUser(). A simple mistake could make it very
  // hard to debug issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no user and trying to access protected routes, redirect to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.nextUrl.pathname !== "/"
  ) {
    // Don't force redirect — just let the client handle it
    // This avoids breaking public pages
  }

  return supabaseResponse;
}
