import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function POST(request: Request) {
  // Read incoming cookies (request)
  const reqCookies = await cookies();

  // Mutate cookies on the response (not the request)
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // IMPORTANT: your cookies are base64-url encoded
      cookieEncoding: "base64url",
      cookies: {
        // READ from the request cookies
        get(name: string) {
          return reqCookies.get(name)?.value;
        },
        // WRITE to the response cookies
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const { session } = await request.json().catch(() => ({}));

  if (session) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return res;
}
