"use client";

import React, { useEffect, useMemo, useState, Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { supabase } from "@/lib/supabaseClient";

// Minimal row types per table
type Interview = {
  id: number;
  person_id: number;
  idea_id: number;
  source: string | null;
  happened_at: string | null;
  duration_seconds: number | null;
  transcript_text: string | null;
};

type Person = {
  id: number;
  full_name: string;
  role: string | null;
  company_id: number | null;
  idea_id: number | null;
};

type Company = { id: number; name: string };

type Idea = { id: number; name: string; slug: string };

type Insight = {
  interview_id: number;
  pain_score: number | null;
  themes: string[] | null;
  summary: {
    tl_dr?: string;
    problems?: string[];
    quotes?: string[];
    willingness_to_pay?: string | null;
  } | null;
};

export default function InterviewsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  // Filters
  const [ideaSlug, setIdeaSlug] = useState<string>("");
  // Sync ideaSlug filter with header selection via localStorage and custom event
  useEffect(() => {
    // initialize from header's stored selection
    try {
      const stored = localStorage.getItem("idea_slug") || "";
      setIdeaSlug(stored);
    } catch {}
    // listen for header changes in the same document
    const onIdeaChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string }>).detail;
      if (detail && typeof detail.slug === "string") {
        setIdeaSlug(detail.slug);
      }
    };
    window.addEventListener("idea:change", onIdeaChange as EventListener);
    return () =>
      window.removeEventListener("idea:change", onIdeaChange as EventListener);
  }, []);
  const [source, setSource] = useState<string>("");
  const [qCompany, setQCompany] = useState("");
  const [qRole, setQRole] = useState("");
  const [minPain, setMinPain] = useState<number>(0);

  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      // Load base tables in parallel
      const [ivRes, pplRes, compRes, ideaRes, insRes] = await Promise.all([
        supabase
          .from("interviews")
          .select(
            "id,person_id,idea_id,source,happened_at,duration_seconds,transcript_text"
          )
          .order("happened_at", { ascending: false })
          .returns<Interview[]>(),
        supabase
          .from("people")
          .select("id,full_name,role,company_id,idea_id")
          .returns<Person[]>(),
        supabase.from("companies").select("id,name").returns<Company[]>(),
        supabase.from("ideas").select("id,name,slug").returns<Idea[]>(),
        supabase
          .from("interview_insights")
          .select("interview_id,pain_score,themes,summary")
          .returns<Insight[]>(),
      ]);

      if (!mounted) return;

      const firstErr =
        ivRes.error ||
        pplRes.error ||
        compRes.error ||
        ideaRes.error ||
        insRes.error;
      if (firstErr) {
        setError(firstErr.message);
        setLoading(false);
        return;
      }

      setInterviews(ivRes.data || []);
      setPeople(pplRes.data || []);
      setCompanies(compRes.data || []);
      setIdeas(ideaRes.data || []);
      setInsights(insRes.data || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Build quick maps
  const peopleById = useMemo(() => indexBy(people, (p) => p.id), [people]);
  const companyById = useMemo(
    () => indexBy(companies, (c) => c.id),
    [companies]
  );
  const ideaById = useMemo(() => indexBy(ideas, (i) => i.id), [ideas]);
  const insightByInterviewId = useMemo(
    () => indexBy(insights, (i) => i.interview_id),
    [insights]
  );

  const ideaIdBySlug = useMemo(
    () => new Map(ideas.map((i) => [i.slug, i.id])),
    [ideas]
  );

  // Export helpers and handler
  function exportFiltered(fmt: "json" | "csv") {
    try {
      const records = buildExportRecords();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (fmt === "json") {
        const blob = new Blob([JSON.stringify(records, null, 2)], {
          type: "application/json",
        });
        triggerDownload(blob, `interviews_export_${stamp}.json`);
      } else {
        const csv = toCsv(records);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        triggerDownload(blob, `interviews_export_${stamp}.csv`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to export. Check console for details.");
    }
  }

  function buildExportRecords() {
    // Use the same filtered rows used for rendering
    const ideaIdFilter = ideaSlug ? ideaIdBySlug.get(ideaSlug) : null;
    const filtered = interviews
      .filter((iv) => {
        if (ideaIdFilter && iv.idea_id !== ideaIdFilter) return false;
        const person = peopleById.get(iv.person_id);
        const company = person?.company_id
          ? companyById.get(person.company_id)
          : undefined;
        const ins = insightByInterviewId.get(iv.id);
        const idea = ideaById.get(iv.idea_id);
        const row = {
          id: iv.id,
          date_iso: iv.happened_at || null,
          date: iv.happened_at ? fmtDateLong(new Date(iv.happened_at)) : "",
          time: iv.happened_at ? fmtTime(new Date(iv.happened_at)) : "",
          person: person?.full_name || "",
          role: person?.role || "",
          company: company?.name || "",
          idea: idea?.name || `#${iv.idea_id}`,
          source: iv.source || "",
          duration_seconds: iv.duration_seconds || 0,
          pain_score: ins?.pain_score ?? null,
          themes: ins?.themes || [],
          tl_dr: ins?.summary?.tl_dr || "",
          problems: ins?.summary?.problems || [],
          quotes: ins?.summary?.quotes || [],
          transcript: iv.transcript_text || "",
        };
        // Apply remaining filters the same way as table rows
        if (source && row.source.toLowerCase() !== source.toLowerCase())
          return false;
        if (qCompany && row.company.toLowerCase() !== qCompany.toLowerCase())
          return false;
        if (qRole && !row.role.toLowerCase().includes(qRole.toLowerCase()))
          return false;
        if (minPain && (row.pain_score ?? 0) < minPain) return false;
        return true;
      })
      .map((iv) => {
        const person = peopleById.get(iv.person_id);
        const company = person?.company_id
          ? companyById.get(person.company_id)
          : undefined;
        const ins = insightByInterviewId.get(iv.id);
        const idea = ideaById.get(iv.idea_id);
        return {
          id: iv.id,
          date_iso: iv.happened_at || null,
          date: iv.happened_at ? fmtDateLong(new Date(iv.happened_at)) : "",
          time: iv.happened_at ? fmtTime(new Date(iv.happened_at)) : "",
          person: person?.full_name || "",
          role: person?.role || "",
          company: company?.name || "",
          idea: idea?.name || `#${iv.idea_id}`,
          source: iv.source || "",
          duration_seconds: iv.duration_seconds || 0,
          pain_score: ins?.pain_score ?? null,
          themes: ins?.themes || [],
          tl_dr: ins?.summary?.tl_dr || "",
          problems: ins?.summary?.problems || [],
          quotes: ins?.summary?.quotes || [],
          transcript: iv.transcript_text || "",
        };
      });
    return filtered;
  }

  function toCsv<T extends Record<string, unknown>>(records: T[]): string {
    if (!records.length) return "";
    const headers = Object.keys(records[0]) as Array<keyof T>;

    const escape = (val: unknown) => {
      if (val == null) return "";
      // Join arrays as a readable string
      if (Array.isArray(val)) val = val.join(" | ");
      const str = String(val as unknown as string);
      // Quote if it contains quotes, commas, or newlines; and double any quotes
      if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const lines = [headers.join(",")];
    for (const rec of records) {
      const row = headers.map((h) => escape(rec[h])).join(",");
      lines.push(row);
    }
    return lines.join("\n");
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Dynamic options for Source and Company based on current idea selection
  const optionSets = useMemo(() => {
    const src = new Set<string>();
    const comp = new Set<string>();
    const ideaIdFilter = ideaSlug ? ideaIdBySlug.get(ideaSlug) : null;
    for (const iv of interviews) {
      if (ideaIdFilter && iv.idea_id !== ideaIdFilter) continue;
      // source
      if (iv.source && iv.source.trim()) src.add(iv.source.trim());
      // company (via person -> company)
      const person = peopleById.get(iv.person_id);
      const company = person?.company_id
        ? companyById.get(person.company_id)
        : undefined;
      if (company?.name) comp.add(company.name);
    }
    const sources = Array.from(src).sort((a, b) => a.localeCompare(b));
    const companies = Array.from(comp).sort((a, b) => a.localeCompare(b));
    return { sources, companies };
  }, [interviews, peopleById, companyById, ideaSlug, ideaIdBySlug]);

  // Combine rows for rendering
  const rows = useMemo(() => {
    const list = interviews.map((iv) => {
      const person = peopleById.get(iv.person_id);
      const company = person?.company_id
        ? companyById.get(person.company_id)
        : undefined;
      const idea = ideaById.get(iv.idea_id);
      const ins = insightByInterviewId.get(iv.id);
      return {
        id: iv.id,
        ideaId: iv.idea_id,
        date: iv.happened_at ? new Date(iv.happened_at) : undefined,
        personName: person?.full_name || "—",
        role: person?.role || "—",
        company: company?.name || "—",
        ideaName: idea?.name || `#${iv.idea_id}`,
        source: iv.source || "—",
        duration: iv.duration_seconds || 0,
        pain: ins?.pain_score ?? null,
        themes: ins?.themes || [],
        transcript: iv.transcript_text,
      };
    });

    // Apply filters
    return list.filter((r) => {
      if (ideaSlug && r.ideaId !== ideaIdBySlug.get(ideaSlug)) return false;
      if (source && r.source.toLowerCase() !== source.toLowerCase())
        return false;
      if (qCompany && r.company.toLowerCase() !== qCompany.toLowerCase())
        return false;
      if (qRole && !r.role.toLowerCase().includes(qRole.toLowerCase()))
        return false;
      if (minPain && (r.pain ?? 0) < minPain) return false;
      return true;
    });
  }, [
    interviews,
    peopleById,
    companyById,
    ideaById,
    insightByInterviewId,
    ideaSlug,
    source,
    qCompany,
    qRole,
    minPain,
    ideaIdBySlug,
  ]);

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        Loading interviews…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200 p-4 text-sm">
        Error loading interviews: {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="pb-1">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          {/* Source */}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Source
            </label>
            <Listbox value={source} onChange={setSource}>
              <div className="relative mt-1 w-full sm:w-40">
                <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 focus:outline-none">
                  <span className="block truncate capitalize">
                    {source || "All"}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-500 dark:text-gray-400">
                    <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Listbox.Button>
                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none">
                    <Listbox.Option
                      key="__all__"
                      className={({ active }) =>
                        `relative cursor-default select-none py-2 pl-8 pr-3 ${
                          active
                            ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                            : "text-gray-800 dark:text-gray-100"
                        }`
                      }
                      value=""
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            All
                          </span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-indigo-600 dark:text-indigo-400">
                              <CheckIcon
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                    {optionSets.sources.map((opt) => (
                      <Listbox.Option
                        key={opt}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-8 pr-3 ${
                            active
                              ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                              : "text-gray-800 dark:text-gray-100"
                          }`
                        }
                        value={opt}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate capitalize ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {opt}
                            </span>
                            {selected ? (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-indigo-600 dark:text-indigo-400">
                                <CheckIcon
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </span>
                            ) : null}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>
          </div>

          {/* Company */}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Company
            </label>
            <Listbox value={qCompany} onChange={setQCompany}>
              <div className="relative mt-1 w-full sm:w-56">
                <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 focus:outline-none">
                  <span className="block truncate">{qCompany || "All"}</span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-500 dark:text-gray-400">
                    <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Listbox.Button>
                <Transition
                  as={Fragment}
                  leave="transition ease-in duration-100"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none">
                    <Listbox.Option
                      key="__all__"
                      className={({ active }) =>
                        `relative cursor-default select-none py-2 pl-8 pr-3 ${
                          active
                            ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                            : "text-gray-800 dark:text-gray-100"
                        }`
                      }
                      value=""
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            All
                          </span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-indigo-600 dark:text-indigo-400">
                              <CheckIcon
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                    {optionSets.companies.map((name) => (
                      <Listbox.Option
                        key={name}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-8 pr-3 ${
                            active
                              ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                              : "text-gray-800 dark:text-gray-100"
                          }`
                        }
                        value={name}
                      >
                        {({ selected }) => (
                          <>
                            <span
                              className={`block truncate ${
                                selected ? "font-medium" : "font-normal"
                              }`}
                            >
                              {name}
                            </span>
                            {selected ? (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-indigo-600 dark:text-indigo-400">
                                <CheckIcon
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </span>
                            ) : null}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              </div>
            </Listbox>
          </div>

          {/* Role */}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Role
            </label>
            <input
              value={qRole}
              onChange={(e) => setQRole(e.target.value)}
              placeholder="Search..."
              className="mt-1 w-full sm:w-56 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2"
            />
          </div>

          {/* Min Pain */}
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Min. Pain
            </label>
            <input
              type="number"
              min={0}
              max={5}
              value={minPain}
              onChange={(e) => setMinPain(Number(e.target.value))}
              className="mt-1 w-full sm:w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-black dark:text-gray-100 px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {/* Mobile cards (smaller than sm) */}
      <div className="sm:hidden space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
            No interviews yet.
          </div>
        ) : (
          rows.map((r) => {
            const insight = insightByInterviewId.get(r.id);
            const isOpen = openId === r.id;
            return (
              <div
                key={r.id}
                className="w-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 max-w-full">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {r.personName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {r.company} • {r.role}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400 max-w-[40%]">
                      <div>{fmtDateShort(r.date)}</div>
                      <div className="capitalize">{r.source}</div>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-3">
                    <DetailsPanel
                      insight={insight}
                      transcript={r.transcript}
                      date={r.date}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-800 text-sm">
          <colgroup>
            {[
              "6.5rem",
              "12rem",
              "18rem",
              "12rem",
              "7.5rem",
              "6.5rem",
              "4.5rem",
              null,
              "1.5rem",
            ].map((w, i) => (
              <col key={i} {...(w ? { style: { width: w } } : {})} />
            ))}
          </colgroup>
          <thead className="bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-200">
            <tr>
              <Th className="w-24">Date</Th>
              <Th>Person</Th>
              <Th>Role / Company</Th>
              <Th>Idea</Th>
              <Th className="w-28">Source</Th>
              <Th className="w-24">Duration</Th>
              <Th className="w-16">Pain</Th>
              <Th>Themes</Th>
              <Th className="w-6"></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rows.map((r) => {
              const insight = insightByInterviewId.get(r.id);
              const isOpen = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setOpenId(isOpen ? null : r.id)}
                    className="text-gray-800 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <Td>
                      <span className="truncate inline-block max-w-[5.5rem]">
                        {fmtDateShort(r.date)}
                      </span>
                    </Td>
                    <Td>
                      <div className="truncate whitespace-nowrap">
                        {r.personName}
                      </div>
                    </Td>
                    <Td>
                      <div className="truncate">
                        <div className="truncate whitespace-nowrap text-gray-800 dark:text-gray-100">
                          {r.role}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {r.company}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="truncate whitespace-nowrap">
                        {r.ideaName}
                      </div>
                    </Td>
                    <Td className="capitalize">{r.source}</Td>
                    <Td>{fmtDuration(r.duration)}</Td>
                    <Td>{r.pain ?? "—"}</Td>
                    <Td className="max-w-[16rem]">
                      {r.themes && r.themes.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.themes.slice(0, 4).map((t, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                            >
                              {t}
                            </span>
                          ))}
                          {r.themes.length > 4 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{r.themes.length - 4} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                    <Td className="text-right w-6 select-none">
                      {isOpen ? "−" : "+"}
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <td colSpan={9} className="px-6 py-4">
                        <DetailsPanel
                          insight={insight}
                          transcript={r.transcript}
                          date={r.date}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Export actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => exportFiltered("json")}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Export filtered (JSON)
        </button>
        <button
          type="button"
          onClick={() => exportFiltered("csv")}
          className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Export filtered (CSV)
        </button>
      </div>
    </div>
  );
}

function DetailsPanel({
  insight,
  transcript,
  date,
}: {
  insight?: Insight | null;
  transcript?: string | null;
  date?: Date;
}) {
  const [showFull, setShowFull] = useState(false);

  const dateStr = fmtDateLong(date);
  const timeStr = fmtTime(date);

  const tlDr = insight?.summary?.tl_dr;
  const problems = insight?.summary?.problems;
  const quotes = insight?.summary?.quotes?.slice(0, 3) || [];
  const themes = insight?.themes || [];
  const pain = insight?.pain_score ?? null;

  const transcriptLines = transcript?.split("\n").map((l) => l.trim()) || [];
  const previewLines = transcriptLines.slice(0, 8);
  const hasMoreLines = transcriptLines.length > 8;

  return (
    <div className="space-y-3 text-sm text-gray-800 dark:text-gray-100">
      <div>
        <strong>Date:</strong> {dateStr || "—"} <span className="mx-2">•</span>{" "}
        <strong>Time:</strong> {timeStr || "—"}
      </div>
      {tlDr && (
        <div>
          <strong>Summary:</strong> {tlDr}
        </div>
      )}
      {problems && problems.length > 0 && (
        <div>
          <strong>Problems:</strong>
          <ul className="list-disc list-inside ml-4">
            {problems.map((p: string, i: number) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {quotes.length > 0 && (
        <div>
          <strong>Quotes:</strong>
          <ul className="list-disc list-inside ml-4 italic text-gray-600 dark:text-gray-400">
            {quotes.map((q: string, i: number) => (
              <li key={i}>&quot;{q}&quot;</li>
            ))}
          </ul>
        </div>
      )}
      {themes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {themes.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div>
        <strong>Pain Score:</strong> {pain ?? "—"}
      </div>
      <div>
        <strong>Transcript Preview:</strong>
        {transcript ? (
          <div className="mt-1 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-900">
            {showFull
              ? transcript
              : previewLines.join("\n") + (hasMoreLines ? "\n…" : "")}
            {hasMoreLines && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFull(!showFull);
                }}
                className="ml-2 text-indigo-600 dark:text-indigo-400 underline text-xs"
                type="button"
              >
                {showFull ? "Hide" : "Show full"}
              </button>
            )}
          </div>
        ) : (
          <div className="italic text-gray-400">No transcript available.</div>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={`px-4 py-3 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function indexBy<T>(arr: T[], key: (x: T) => number) {
  const m = new Map<number, T>();
  for (const it of arr) m.set(key(it), it);
  return m;
}

function fmtDateShort(d?: Date) {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function fmtDateLong(d?: Date) {
  if (!d) return "";
  try {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

function fmtTime(d?: Date) {
  if (!d) return "";
  try {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
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
