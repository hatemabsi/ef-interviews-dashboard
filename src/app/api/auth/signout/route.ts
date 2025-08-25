import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// POST /api/auth/signout
// Important: return JSON (200) and DO NOT redirect here,
// because `fetch()` would follow a 3xx with a POST to /login.
// The client will handle navigation after this call resolves.
export async function POST(req: NextRequest) {
  // Prepare a JSON response we can mutate cookies on
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // must match your callback + middleware
      cookieEncoding: "base64url",
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  // Invalidate the session (this will clear the sb-* auth cookies via the cookie helpers above)
  await supabase.auth.signOut();

  // EXTRA: belt & suspenders — explicitly clear possible cookie variants
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const projectRef = url.hostname.split(".")[0];
    const base = `sb-${projectRef}-auth-token`;
    // Clear the base cookie and the split-cookie variants some browsers use
    res.cookies.set(base, "", { path: "/", maxAge: 0 });
    res.cookies.set(`${base}.0`, "", { path: "/", maxAge: 0 });
    res.cookies.set(`${base}.1`, "", { path: "/", maxAge: 0 });
  } catch {
    // ignore
  }

  return res;
}
