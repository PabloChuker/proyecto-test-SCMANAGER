import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie max-age: 30 days
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge: options?.maxAge ?? COOKIE_MAX_AGE,
                path: options?.path ?? "/",
                sameSite: options?.sameSite ?? "lax",
                httpOnly: options?.httpOnly ?? true,
                secure: process.env.NODE_ENV === "production",
              })
            );
          } catch {
            // setAll can fail in Server Components — this is fine
            // because the middleware will handle refreshing
          }
        },
      },
    }
  );
}
