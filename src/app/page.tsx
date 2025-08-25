"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import useStartup from "@/hooks/useStartup";

// --- Minimal table types ---
interface Idea {
  id: number;
  name: string;
  slug: string;
  status: string;
  cofounder: string | null;
  notes: string | null;
}
interface Interview {
  id: number;
  person_id: number;
  idea_id: number;
  source: string | null;
  happened_at: string | null;
  duration_seconds: number | null;
}
interface Insight {
  interview_id: number;
  pain_score: number | null;
  themes: string[] | null;
  summary: { tl_dr?: string; quotes?: string[] } | null;
}
interface Person {
  id: number;
  full_name: string;
  role: string | null;
  company_id: number | null;
}
interface Company {
  id: number;
  name: string;
}
type IdeaJoined = {
  id: number;
  name: string;
  slug: string;
  status: string;
  cofounder: string | null;
  notes: string | null;
  // because of `idea_startups!inner(startup_id)` the join comes back as an array
  idea_startups: { startup_id: string }[];
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // multi-tenant: current user's startup
  const { startupId } = useStartup();
  // Effect A: load ideas for this startup & wire selectedSlug from header/localStorage
  useEffect(() => {
    let mounted = true;
    if (!startupId) {
      // Clear ideas until we know the tenant
      setIdeas([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("ideas")
        .select(
          "id,name,slug,status,cofounder,notes,idea_startups!inner(startup_id)"
        )
        .eq("idea_startups.startup_id", startupId)
        .order("started_at", { ascending: false });
      if (!mounted) return;
      if (!error && data) {
        // Strip join field
        const cleaned: Idea[] = (data as IdeaJoined[]).map((i) => ({
          id: i.id,
          name: i.name,
          slug: i.slug,
          status: i.status,
          cofounder: i.cofounder ?? null,
          notes: i.notes ?? null,
        }));
        setIdeas(cleaned);
      } else if (error) {
        setIdeas([]);
      }
      try {
        const stored = localStorage.getItem("idea_slug");
        if (stored !== null) setSelectedSlug(stored);
      } catch {}
    })();
    const onIdeaChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string }>).detail;
      if (detail && typeof detail.slug === "string")
        setSelectedSlug(detail.slug);
    };
    window.addEventListener("idea:change", onIdeaChange as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("idea:change", onIdeaChange as EventListener);
    };
  }, [startupId]);

  // Effect B: load recent data used by dashboard widgets (scoped to this startup's ideas)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!startupId) {
        setInterviews([]);
        setInsights([]);
        setPeople([]);
        setCompanies([]);
        return;
      }
      setLoading(true);
      setError(null);
      const since = new Date();
      since.setDate(since.getDate() - 90);
      // compute allowed idea ids for tenant
      const allowedIdeaIds = ideas.map((i) => i.id);
      if (allowedIdeaIds.length === 0) {
        if (!mounted) return;
        setInterviews([]);
        setInsights([]);
        setPeople([]);
        setCompanies([]);
        setLoading(false);
        return;
      }
      const [ivRes, insRes, pplRes, compRes] = await Promise.all([
        supabase
          .from("interviews")
          .select("id,person_id,idea_id,source,happened_at,duration_seconds")
          .gte("happened_at", since.toISOString())
          .in("idea_id", allowedIdeaIds)
          .order("happened_at", { ascending: false }),
        supabase
          .from("interview_insights")
          .select("interview_id,pain_score,themes,summary"),
        supabase.from("people").select("id,full_name,role,company_id"),
        supabase.from("companies").select("id,name"),
      ]);
      if (!mounted) return;
      const firstErr =
        ivRes.error || insRes.error || pplRes.error || compRes.error;
      if (firstErr) {
        setError(firstErr.message);
        setLoading(false);
        return;
      }
      setInterviews(ivRes.data || []);
      setInsights(insRes.data || []);
      setPeople(pplRes.data || []);
      setCompanies(compRes.data || []);
      setLoading(false);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [startupId, ideas]);

  // Index helpers
  const insightsByInterviewId = useMemo(
    () => indexBy(insights, (x) => x.interview_id),
    [insights]
  );
  const peopleById = useMemo(() => indexBy(people, (x) => x.id), [people]);
  const companyById = useMemo(
    () => indexBy(companies, (x) => x.id),
    [companies]
  );

  const selectedIdea = useMemo(() => {
    if (!selectedSlug) return null; // All ideas for this startup
    return ideas.find((i) => i.slug === selectedSlug) || null;
  }, [ideas, selectedSlug]);

  const interviewsForSelected = useMemo(() => {
    if (!selectedIdea) return interviews; // All ideas
    return interviews.filter((iv) => iv.idea_id === selectedIdea.id);
  }, [interviews, selectedIdea]);

  const recent5 = useMemo(
    () => interviewsForSelected.slice(0, 5),
    [interviewsForSelected]
  );

  // Metrics
  const totalAll = interviews.length;
  const totalSelected = interviewsForSelected.length;
  const avgDuration = safeAvg(
    interviewsForSelected.map((x) => x.duration_seconds || 0)
  );
  const last7Count = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    return interviewsForSelected.filter(
      (x) => x.happened_at && new Date(x.happened_at) >= since
    ).length;
  }, [interviewsForSelected]);
  const painAvg = useMemo(() => {
    const vals = interviewsForSelected
      .map((iv) => insightsByInterviewId.get(iv.id)?.pain_score)
      .filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [interviewsForSelected, insightsByInterviewId]);
  const topThemes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const iv of interviewsForSelected) {
      const t = insightsByInterviewId.get(iv.id)?.themes || [];
      for (const theme of t) counts.set(theme, (counts.get(theme) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [interviewsForSelected, insightsByInterviewId]);

  // Weekly series (last 12 weeks) for selected set
  const weeks = useMemo(() => buildWeeksRange(12), []);
  const weeklyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of weeks) map.set(isoDate(w), 0);
    for (const iv of interviewsForSelected) {
      if (!iv.happened_at) continue;
      const w = startOfWeek(new Date(iv.happened_at));
      const k = isoDate(w);
      if (map.has(k)) map.set(k, (map.get(k) || 0) + 1);
    }
    return weeks.map((w) => map.get(isoDate(w)) || 0);
  }, [weeks, interviewsForSelected]);

  // Theme trends per week for top 5 themes
  const themeTrend = useMemo(() => {
    const themes = topThemes.map(([t]) => t);
    const series: Record<string, number[]> = {};
    const weekKeys = weeks.map((w) => isoDate(w));
    for (const t of themes) series[t] = weekKeys.map(() => 0);
    const weekIndex = new Map<string, number>(weekKeys.map((k, i) => [k, i]));
    for (const iv of interviewsForSelected) {
      if (!iv.happened_at) continue;
      const key = isoDate(startOfWeek(new Date(iv.happened_at)));
      const idx = weekIndex.get(key);
      if (idx == null) continue;
      const th = insightsByInterviewId.get(iv.id)?.themes || [];
      for (const t of th) {
        if (series[t]) series[t][idx] += 1;
      }
    }
    return series; // { theme: [counts per week] }
  }, [weeks, interviewsForSelected, insightsByInterviewId, topThemes]);

  // Pain histogram (1..10)
  const painHistogram = useMemo(() => {
    const buckets = Array.from({ length: 10 }, () => 0);
    for (const iv of interviewsForSelected) {
      const p = insightsByInterviewId.get(iv.id)?.pain_score;
      if (typeof p === "number" && p >= 1 && p <= 10) buckets[p - 1]++;
    }
    return buckets;
  }, [interviewsForSelected, insightsByInterviewId]);

  // Recent outliers
  const outliers = useMemo(() => {
    const withPain: Array<{
      id: number;
      name: string;
      company: string;
      pain: number;
    }> = [];
    const withDur: Array<{
      id: number;
      name: string;
      company: string;
      dur: number;
    }> = [];
    const withQuotes: Array<{
      id: number;
      name: string;
      company: string;
      quotes: number;
    }> = [];
    for (const iv of interviewsForSelected) {
      const person = peopleById.get(iv.person_id);
      const comp = person?.company_id
        ? companyById.get(person.company_id)
        : undefined;
      const ins = insightsByInterviewId.get(iv.id);
      if (typeof ins?.pain_score === "number")
        withPain.push({
          id: iv.id,
          name: person?.full_name || "—",
          company: comp?.name || "—",
          pain: ins.pain_score,
        });
      if (typeof iv.duration_seconds === "number")
        withDur.push({
          id: iv.id,
          name: person?.full_name || "—",
          company: comp?.name || "—",
          dur: iv.duration_seconds,
        });
      const quotesArr = ins?.summary?.quotes ?? [];
      const qLen = Array.isArray(quotesArr) ? quotesArr.length : 0;
      withQuotes.push({
        id: iv.id,
        name: person?.full_name || "—",
        company: comp?.name || "—",
        quotes: qLen,
      });
    }
    const topPain = withPain.sort((a, b) => b.pain - a.pain).slice(0, 3);
    const topDur = withDur.sort((a, b) => b.dur - a.dur).slice(0, 3);
    const topQuotes = withQuotes
      .sort((a, b) => b.quotes - a.quotes)
      .slice(0, 3);
    return { topPain, topDur, topQuotes };
  }, [interviewsForSelected, peopleById, companyById, insightsByInterviewId]);

  // Data freshness
  const lastInterviewAt = useMemo(() => {
    const dts = interviewsForSelected
      .map((iv) => (iv.happened_at ? new Date(iv.happened_at) : null))
      .filter((x): x is Date => !!x);
    if (!dts.length) return null;
    return new Date(Math.max(...dts.map((x) => x.getTime())));
  }, [interviewsForSelected]);
  const daysSinceLast = useMemo(() => {
    if (!lastInterviewAt) return null;
    const ms = Date.now() - lastInterviewAt.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }, [lastInterviewAt]);

  // Quick export (selected set)
  function buildExportRecordsSel() {
    return interviewsForSelected.map((iv) => {
      const person = peopleById.get(iv.person_id);
      const comp = person?.company_id
        ? companyById.get(person.company_id)
        : undefined;
      const ins = insightsByInterviewId.get(iv.id);
      return {
        id: iv.id,
        date_iso: iv.happened_at || null,
        date: iv.happened_at ? new Date(iv.happened_at).toLocaleString() : "",
        person: person?.full_name || "",
        role: person?.role || "",
        company: comp?.name || "",
        source: iv.source || "",
        duration_seconds: iv.duration_seconds || 0,
        pain_score: ins?.pain_score ?? null,
        themes: ins?.themes || [],
        tl_dr: ins?.summary?.tl_dr || "",
      };
    });
  }
  function exportSel(fmt: "json" | "csv") {
    const recs = buildExportRecordsSel();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (fmt === "json") {
      const blob = new Blob([JSON.stringify(recs, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `dashboard_export_${stamp}.json`);
    } else {
      const csv = toCsvGeneric(recs);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `dashboard_export_${stamp}.csv`);
    }
  }

  return (
    <Layout>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Dashboard
      </h2>

      {loading ? (
        <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
          Loading…
        </div>
      ) : error ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200 p-4 text-sm">
          {error}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Selected idea */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Selected idea
              </h3>
              {selectedIdea ? (
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="text-gray-800 dark:text-gray-100">
                      {selectedIdea.name}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        selectedIdea.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      }`}
                    >
                      {selectedIdea.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    slug: {selectedIdea.slug}
                  </div>
                  {selectedIdea.cofounder && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      cofounder: {selectedIdea.cofounder}
                    </div>
                  )}
                  {selectedIdea.notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">
                      {selectedIdea.notes}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/interviews"
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      View interviews
                    </Link>
                    <Link
                      href="/ideas"
                      className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Manage ideas
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  All ideas selected
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Interview stats
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">
                    Total interviews
                  </dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-medium">
                    {totalAll}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">
                    For selected idea
                  </dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-medium">
                    {totalSelected}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">
                    Avg. duration
                  </dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-medium">
                    {fmtDuration(avgDuration)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">
                    Last 7 days
                  </dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-medium">
                    {last7Count}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Pain snapshot */}
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Pain snapshot
              </h3>
              <div className="mt-2 text-sm text-gray-800 dark:text-gray-100">
                {painAvg == null ? (
                  <span className="text-gray-500 dark:text-gray-400">
                    No pain scores yet
                  </span>
                ) : (
                  <span className="text-2xl font-semibold">
                    {painAvg.toFixed(2)}
                  </span>
                )}
              </div>
              {topThemes.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Top themes
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {topThemes.map(([t, n]) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        {t}
                        <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">
                          ×{n}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Recent interviews */}
          <section className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {selectedIdea
                  ? "Recent interviews (selected idea)"
                  : "Recent interviews (all ideas)"}
              </h3>
              <Link
                href="/interviews"
                className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                View all
              </Link>
            </div>
            {/* Mobile cards (smaller than sm) */}
            <div className="mt-3 sm:hidden space-y-3">
              {recent5.length === 0 ? (
                <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
                  No interviews yet.
                </div>
              ) : (
                recent5.map((iv) => {
                  const p = peopleById.get(iv.person_id);
                  const comp = p?.company_id
                    ? companyById.get(p.company_id)
                    : undefined;
                  const ins = insightsByInterviewId.get(iv.id);
                  return (
                    <div
                      key={iv.id}
                      className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {p?.full_name || "—"}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {comp?.name || "—"} • {p?.role || "—"}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {fmtDateOnly(iv.happened_at)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs capitalize text-gray-600 dark:text-gray-300">
                            {iv.source || "—"}
                          </div>
                          <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                            {ins?.pain_score ?? "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 hidden sm:block overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
              <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-800 text-sm">
                <colgroup>
                  <col style={{ width: "7rem" }} />
                  <col style={{ width: "14rem" }} />
                  <col />
                  <col style={{ width: "6rem" }} />
                  <col style={{ width: "5rem" }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Person</th>
                    <th className="px-4 py-2 text-left">Company / Role</th>
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-left">Pain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {recent5.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-3 text-gray-500 dark:text-gray-400"
                        colSpan={5}
                      >
                        No interviews yet.
                      </td>
                    </tr>
                  ) : (
                    recent5.map((iv) => {
                      const p = peopleById.get(iv.person_id);
                      const comp = p?.company_id
                        ? companyById.get(p.company_id)
                        : undefined;
                      const ins = insightsByInterviewId.get(iv.id);
                      return (
                        <tr key={iv.id}>
                          <td className="px-4 py-3">
                            {fmtDateOnly(iv.happened_at)}
                          </td>
                          <td className="px-4 py-3">{p?.full_name || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="truncate text-gray-800 dark:text-gray-100">
                              {comp?.name || "—"}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {p?.role || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 capitalize">
                            {iv.source || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {ins?.pain_score ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {/* Analytics row: interviews per week, theme trends, pain histogram */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Interviews per week
              </h3>
              <MiniBars
                labels={weeks.map(fmtWeekLabel)}
                values={weeklyCounts}
              />
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Theme trends
              </h3>
              <StackedMiniBars
                labels={weeks.map(fmtWeekLabel)}
                series={themeTrend}
              />
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Pain distribution
              </h3>
              <MiniBars
                labels={[...Array(10)].map((_, i) => String(i + 1))}
                values={painHistogram}
                minDomain={5}
                showValues
                formatLabel={(l, v) => `Pain Score: ${l} (${v})`}
              />
            </div>
          </section>

          {/* Outliers + Freshness + Export */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Recent outliers
              </h3>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Highest pain
                  </div>
                  <ul className="space-y-1">
                    {outliers.topPain.map((o) => (
                      <li
                        key={`p-${o.id}`}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate mr-2">{o.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {o.pain}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Longest duration
                  </div>
                  <ul className="space-y-1">
                    {outliers.topDur.map((o) => (
                      <li
                        key={`d-${o.id}`}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate mr-2">{o.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {fmtDuration(o.dur)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Most quotes
                  </div>
                  <ul className="space-y-1">
                    {outliers.topQuotes.map((o) => (
                      <li
                        key={`q-${o.id}`}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate mr-2">{o.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {o.quotes}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Data freshness
              </h3>
              <div className="mt-2 text-sm text-gray-800 dark:text-gray-100">
                {lastInterviewAt ? (
                  <>
                    <div>
                      Last interview: {lastInterviewAt.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {daysSinceLast === 0
                        ? "Today"
                        : `${daysSinceLast} day${
                            daysSinceLast === 1 ? "" : "s"
                          } ago`}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">
                    No interviews yet
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Quick export
              </h3>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => exportSel("json")}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Export (JSON)
                </button>
                <button
                  onClick={() => exportSel("csv")}
                  className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Export (CSV)
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Scope: current selection in header (or all ideas if selected).
              </p>
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
}

function MiniBars({
  labels,
  values,
  minDomain = 1,
  showValues = false,
  formatLabel,
}: {
  labels: string[];
  values: number[];
  minDomain?: number;
  showValues?: boolean;
  formatLabel?: (label: string, value: number) => string;
}) {
  const [tip, setTip] = useState<null | {
    x: number;
    y: number;
    label: string;
  }>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // measure container width responsively
  const [cWidth, setCWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(
      (entries: ReadonlyArray<ResizeObserverEntry>) => {
        const w = entries[0]?.contentRect?.width ?? 0;
        setCWidth(w);
      }
    );
    ro.observe(el);
    setCWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Check for no data: all values are zero or length is zero
  const noData = !values.length || values.every((v) => v === 0);
  if (noData) {
    return (
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  const max = Math.max(minDomain, ...values);
  const n = values.length;
  const h = 100; // a bit taller for labels/tooltip
  const gap = 4;
  const barW = Math.max(
    6,
    Math.floor((Math.max(1, cWidth) - gap * (n - 1)) / Math.max(1, n))
  );
  const w = Math.max(0, barW * n + gap * (n - 1));
  const fmt = (l: string, v: number) =>
    formatLabel ? formatLabel(l, v) : `${l}: ${v}`;

  return (
    <div className="mt-2 relative" ref={containerRef}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="block">
        {values.map((v, i) => {
          const bh = Math.round((v / max) * (h - 22));
          const x = i * (barW + gap);
          const y = h - bh - 16;
          return (
            <Fragment key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                className="fill-gray-400 dark:fill-gray-600 cursor-pointer"
                onMouseLeave={() => setTip(null)}
                onMouseMove={() => {
                  setTip({
                    x: x + barW / 2,
                    y: Math.max(0, y - 10),
                    label: fmt(labels[i], v),
                  });
                }}
              >
                <title>{fmt(labels[i], v)}</title>
              </rect>
              {showValues && v > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 2}
                  textAnchor="middle"
                  className="fill-gray-600 dark:fill-gray-300 text-[10px]"
                >
                  {v}
                </text>
              )}
            </Fragment>
          );
        })}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-2 rounded bg-gray-900 px-2 py-1 text-xs text-white shadow dark:bg-black/90"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.label}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center truncate">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function StackedMiniBars({
  labels,
  series,
}: {
  labels: string[];
  series: Record<string, number[]>;
}) {
  const [tip, setTip] = useState<null | {
    x: number;
    y: number;
    label: string;
  }>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cWidth, setCWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(
      (entries: ReadonlyArray<ResizeObserverEntry>) => {
        const w = entries[0]?.contentRect?.width ?? 0;
        setCWidth(w);
      }
    );
    ro.observe(el);
    setCWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Compute data presence *after* hooks so hooks are never conditional
  const keys = Object.keys(series);
  const n = labels.length;
  const allZero =
    n === 0 ||
    keys.length === 0 ||
    labels.every((_, i) => keys.every((k) => (series[k]?.[i] || 0) === 0));
  if (n === 0 || allZero) {
    return (
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  const totals = Array.from({ length: n }, (_, i) =>
    keys.reduce((acc, k) => acc + (series[k]?.[i] || 0), 0)
  );
  const max = Math.max(1, ...totals);
  const h = 100;
  const gap = 4;
  const barW = Math.max(
    6,
    Math.floor((Math.max(1, cWidth) - gap * (n - 1)) / Math.max(1, n))
  );
  const w = Math.max(0, barW * n + gap * (n - 1));
  const palette = ["#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#06b6d4"];

  return (
    <div className="mt-2 relative" ref={containerRef}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="block">
        {labels.map((_, i) => {
          let y = h - 16;
          const x = i * (barW + gap);
          return (
            <Fragment key={i}>
              {keys.map((k, ki) => {
                const v = series[k]?.[i] || 0;
                const bh = Math.round((v / max) * (h - 22));
                y -= bh;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, bh)}
                    fill={palette[ki % palette.length]}
                    className="cursor-pointer"
                    onMouseLeave={() => setTip(null)}
                    onMouseMove={() => {
                      setTip({
                        x: x + barW / 2,
                        y: Math.max(0, y - 10),
                        label: `${labels[i]} — ${k}: ${v}`,
                      });
                    }}
                  >
                    <title>{`${labels[i]} — ${k}: ${v}`}</title>
                  </rect>
                );
              })}
            </Fragment>
          );
        })}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-2 rounded bg-gray-900 px-2 py-1 text-xs text-white shadow dark:bg-black/90"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.label}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center truncate">
            {l}
          </span>
        ))}
      </div>
      {keys.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-600 dark:text-gray-300">
          {keys.map((k, i) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: palette[i % palette.length] }}
              />
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- helpers ---
function indexBy<T, K extends string | number>(arr: T[], key: (x: T) => K) {
  const m = new Map<K, T>();
  for (const it of arr) m.set(key(it), it);
  return m;
}

function safeAvg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function fmtDuration(sec?: number | null) {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDateOnly(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

// --- dashboard helpers ---
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildWeeksRange(nWeeks: number) {
  const end = startOfWeek(new Date());
  const weeks: Date[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks;
}

function fmtWeekLabel(d: Date) {
  const m = d.toLocaleDateString(undefined, { month: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  return `${day} ${m}`;
}

function toCsvGeneric<T extends Record<string, unknown>>(records: T[]): string {
  if (!records.length) return "";
  const headers = Object.keys(records[0]) as Array<keyof T>;
  const escape = (val: unknown) => {
    if (val == null) return "";
    if (Array.isArray(val)) val = val.join(" | ");
    const s = String(val);
    if (s.includes('"') || s.includes(",") || s.includes("\n"))
      return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of records)
    lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n");
}

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
