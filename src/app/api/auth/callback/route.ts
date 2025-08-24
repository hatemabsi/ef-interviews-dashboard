// src/app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(request: Request) {
  const cookieStore = await cookies(); // await the dynamic API
  const supabase = createRouteHandlerClient({
    cookies: async () => cookieStore,
  });

  const { session } = await request.json().catch(() => ({}));
  if (session) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }
  return NextResponse.json({ ok: true });
}
