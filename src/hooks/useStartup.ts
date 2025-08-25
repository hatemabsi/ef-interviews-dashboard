"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { StartupContext } from "@/lib/types";

/**
 * Resolves the logged-in user's userId/email and their startupId from `profiles`.
 * Falls back to a small localStorage cache to reduce UI flicker.
 */
export default function useStartup() {
  const [info, setInfo] = useState<StartupContext>({
    userId: null,
    email: null,
    startupId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try cached value for instant paint (optional)
    try {
      const cached = localStorage.getItem("startup_ctx_v1");
      if (cached) {
        const parsed = JSON.parse(cached) as StartupContext;
        if (parsed && typeof parsed === "object") setInfo(parsed);
      }
    } catch {}

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = user?.id ?? null;
      const email = user?.email ?? null;

      let startupId: string | null = null;

      if (userId) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("startup_id,email")
          .eq("user_id", userId)
          .maybeSingle();

        if (profileErr) throw profileErr;
        startupId = (profile?.startup_id as string | null) ?? null;
      }

      const next: StartupContext = { userId, email, startupId };
      setInfo(next);
      try {
        localStorage.setItem("startup_ctx_v1", JSON.stringify(next));
      } catch {}
    } catch (e: unknown) {
      setError(
        (e as { message?: string })?.message || "Failed to load startup info"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...info, loading, error, refresh: load };
}
