"use client";

import { useState, useEffect, useCallback } from "react";
import { Fragment, useMemo } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Header() {
  const [showUpload, setShowUpload] = useState(false);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [showTranscribe, setShowTranscribe] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const [ideas, setIdeas] = useState<
    {
      id: number;
      name: string;
      slug: string;
      status: string;
      cofounder?: string | null;
    }[]
  >([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    try {
      const v = localStorage.getItem("idea_slug");
      return v !== null ? v : "";
    } catch {
      return "";
    }
  });
  const [mounted, setMounted] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (active) setUserEmail(data.user?.email ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);
  const router = useRouter();

  async function handleLogout() {
    try {
      localStorage.removeItem("idea_slug");
      localStorage.removeItem("sidebar_collapsed");
      localStorage.removeItem("theme");
    } catch {}
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Extracted loadIdeas function for reuse
  const loadIdeas = useCallback(async () => {
    const { data, error } = await supabase
      .from("ideas")
      .select("id,name,slug,status,cofounder")
      .order("started_at", { ascending: false });
    if (!error && data) {
      setIdeas(data);
      // Only correct the selection if it's non-empty and no longer exists
      if (
        selectedSlug !== "" &&
        !data.some((idea) => idea.slug === selectedSlug)
      ) {
        const activeIdea = data.find((idea) => idea.status === "active");
        setSelectedSlug(activeIdea ? activeIdea.slug : data[0]?.slug ?? "");
      }
    }
  }, [selectedSlug]);

  const selectedIdea = useMemo(
    () => ideas.find((i) => i.slug === selectedSlug) || null,
    [ideas, selectedSlug]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const ideaLabel = useMemo(() => {
    // Before mount or before ideas are loaded, keep it stable as "All ideas"
    if (!mounted || ideas.length === 0)
      return selectedSlug === "" ? "All ideas" : "All ideas";
    if (selectedIdea) return selectedIdea.name;
    return selectedSlug === "" ? "All ideas" : "Select idea";
  }, [mounted, ideas.length, selectedIdea, selectedSlug]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "dark") {
        setDarkMode(true);
        document.documentElement.classList.add("dark");
        return;
      }
      if (stored === "light") {
        setDarkMode(false);
        document.documentElement.classList.remove("dark");
        return;
      }
    } catch {}
    // Fallback to OS preference if nothing stored
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(prefersDark);
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    // run once
    /// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (darkMode === null) return; // wait for init
    if (darkMode) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    }
  }, [darkMode]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);

  useEffect(() => {
    try {
      localStorage.setItem("idea_slug", selectedSlug);
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent("idea:change", { detail: { slug: selectedSlug } })
      );
    } catch {}
  }, [selectedSlug]);

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => {
            try {
              window.dispatchEvent(new CustomEvent("sidebar:open"));
            } catch {}
          }}
          className="sm:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Open menu"
        >
          {/* Bars icon */}
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              d="M3 6h18M3 12h18M3 18h18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <h1 className="text-sm font-medium text-gray-800 dark:text-gray-100">
          Idea:
        </h1>
        <div className="ml-2 w-60">
          <Listbox
            value={selectedSlug}
            onChange={(slug) => setSelectedSlug(slug)}
          >
            <div className="relative">
              <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-10 text-left text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <span className="block truncate">
                  {ideaLabel}
                  {mounted && selectedIdea ? (
                    <span
                      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        selectedIdea.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      }`}
                    >
                      {selectedIdea.status === "active" ? "active" : "paused"}
                    </span>
                  ) : null}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </span>
              </Listbox.Button>
              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 text-sm shadow-lg focus:outline-none">
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
                          All ideas
                        </span>
                        {selected ? (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-indigo-600 dark:text-indigo-400">
                            <CheckIcon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Listbox.Option>
                  {ideas.map((idea) => (
                    <Listbox.Option
                      key={idea.id}
                      className={({ active }) =>
                        `relative cursor-default select-none py-2 pl-8 pr-3 ${
                          active
                            ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                            : "text-gray-800 dark:text-gray-100"
                        }`
                      }
                      value={idea.slug}
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${
                              selected ? "font-medium" : "font-normal"
                            }`}
                          >
                            {idea.name}
                            <span
                              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                idea.status === "active"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              }`}
                            >
                              {idea.status === "active" ? "active" : "paused"}
                            </span>
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
      </div>

      <div className="hidden sm:flex items-center gap-2">
        {userEmail && (
          <span className="hidden sm:inline text-xs text-gray-600 dark:text-gray-300 mr-1">
            {userEmail}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Logout
        </button>
        <button
          className="px-3 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={() => setDarkMode((v) => !(v ?? false))}
          aria-label="Toggle dark mode"
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
        {/* These buttons open modals */}
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
        >
          Upload Meeting
        </button>
        <button
          onClick={() => setShowNewIdea(true)}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Start Idea
        </button>
        <button
          onClick={() => setShowTranscribe(true)}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Transcribe Audio
        </button>
      </div>
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowUpload(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Upload meeting
              </h2>
              <button
                onClick={() => setShowUpload(false)}
                className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const fd = new FormData(form);
                // If idea_slug not set by user, fall back to selectedSlug
                if (!fd.get("idea_slug"))
                  fd.set("idea_slug", selectedSlug || "");
                const INGEST_URL = "/api/n8n?target=ingest";
                try {
                  const res = await fetch(INGEST_URL, {
                    method: "POST",
                    body: fd,
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    alert("Upload failed: " + res.status + " " + text);
                    return;
                  }
                  const data: Record<string, unknown> = await res
                    .json()
                    .catch(() => ({} as Record<string, unknown>));
                  alert(
                    "Uploaded! Interview ID: " +
                      (data?.id || data?.interview_id || "OK")
                  );
                  setShowUpload(false);
                  form.reset();
                } catch (err) {
                  alert(
                    "Network error: " + ((err as Error)?.message || String(err))
                  );
                }
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Full name
                  </label>
                  <input
                    name="full_name"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Role
                  </label>
                  <input
                    name="role"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Company
                  </label>
                  <input
                    name="company"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Idea
                  </label>
                  <select
                    name="idea_slug"
                    defaultValue={selectedSlug}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 px-3 py-2 text-sm"
                  >
                    {ideas.map((i) => (
                      <option key={i.id} value={i.slug}>
                        {i.name} {i.status === "active" ? "🟢" : "🔴"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Source
                  </label>
                  <select
                    name="source"
                    required
                    defaultValue="zoom"
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 px-3 py-2 text-sm"
                  >
                    <option value="zoom">Zoom</option>
                    <option value="meet">Google Meet</option>
                    <option value="teams">MS Teams</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Transcript file
                  </label>
                  <input
                    name="transcript"
                    type="file"
                    required
                    accept=".txt,.vtt,.srt"
                    className="mt-1 block w-full text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700 dark:hover:file:bg-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="rounded-md px-3 py-2 text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                >
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showNewIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowNewIdea(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Start new idea
              </h2>
              <button
                onClick={() => setShowNewIdea(false)}
                className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const fd = new FormData(form);
                const payload = {
                  name: String(fd.get("name") || ""),
                  slug: String(fd.get("slug") || ""),
                  notes: String(fd.get("notes") || ""),
                  cofounder: String(fd.get("cofounder") || ""),
                };
                if (!payload.name || !payload.slug) {
                  alert("Name and slug are required.");
                  return;
                }
                const START_URL = "/api/n8n?target=start-idea";
                try {
                  const res = await fetch(START_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    alert("Create failed: " + res.status + " " + text);
                    return;
                  }
                  const data: Record<string, unknown> = await res
                    .json()
                    .catch(() => ({} as Record<string, unknown>));
                  // Attempt to extract the returned idea row
                  const raw = data as unknown;
                  const row = Array.isArray(raw)
                    ? (raw as Record<string, unknown>[])[0]
                    : (raw as Record<string, unknown>);
                  const newIdea = {
                    id: Number(row?.id ?? Date.now()),
                    name: String(row?.name ?? payload.name),
                    slug: String(row?.slug ?? payload.slug),
                    status: String(row?.status ?? "active"),
                    cofounder:
                      row?.cofounder != null
                        ? String(row.cofounder)
                        : payload.cofounder || null,
                  };
                  // Update local list: put new idea first
                  setIdeas((prev) => {
                    const filtered = prev.filter(
                      (i) => i.slug !== newIdea.slug
                    );
                    return [newIdea, ...filtered];
                  });
                  // Refresh from Supabase so dropdown updates with new states
                  await loadIdeas();
                  setSelectedSlug(newIdea.slug);
                  setShowNewIdea(false);
                  form.reset();
                } catch (err) {
                  alert(
                    "Network error: " + ((err as Error)?.message || String(err))
                  );
                }
              }}
            >
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    name="name"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Slug (url-safe, e.g. customer-ai-assistant)
                  </label>
                  <input
                    name="slug"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Cofounder
                  </label>
                  <input
                    name="cofounder"
                    placeholder="(optional)"
                    className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 placeholder:text-gray-500 caret-gray-700 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewIdea(false)}
                  className="rounded-md px-3 py-2 text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showTranscribe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowTranscribe(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Transcribe audio
              </h2>
              <button
                onClick={() => setShowTranscribe(false)}
                className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const fd = new FormData(form);
                const TRANSCRIBE_URL = "/api/n8n?target=transcribe";
                try {
                  const res = await fetch(TRANSCRIBE_URL, {
                    method: "POST",
                    body: fd,
                  });
                  if (!res.ok) {
                    const txt = await res.text().catch(() => "");
                    alert("Transcription failed: " + res.status + " " + txt);
                    return;
                  }
                  const data: Record<string, unknown> = await res
                    .json()
                    .catch(() => ({} as Record<string, unknown>));
                  alert(
                    "Transcription requested. Job: " +
                      (data?.job_id || data?.id || "OK")
                  );
                  setShowTranscribe(false);
                  form.reset();
                } catch (err) {
                  alert(
                    "Network error: " + ((err as Error)?.message || String(err))
                  );
                }
              }}
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Audio file (MP3/WAV/M4A)
                </label>
                <input
                  name="audio"
                  type="file"
                  required
                  accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                  className="mt-1 block w-full text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700 dark:hover:file:bg-emerald-500"
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTranscribe(false)}
                  className="rounded-md px-3 py-2 text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md px-3 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-500"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
