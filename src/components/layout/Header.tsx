"use client";

import { useState, useEffect, useCallback } from "react";
import { Fragment, useMemo } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/solid";
import { supabase } from "@/lib/supabaseClient";
import useStartup from "@/hooks/useStartup";
import type { IdeaLite } from "@/lib/types";

type CofounderOption = { user_id: string; email: string };

export default function Header() {
  const [showUpload, setShowUpload] = useState(false);
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [showTranscribe, setShowTranscribe] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [ideas, setIdeas] = useState<IdeaLite[]>([]);
  const [cofounders, setCofounders] = useState<CofounderOption[]>([]);
  const [cofounderId, setCofounderId] = useState<string>("");
  const { startupId, email: loggedEmail } = useStartup();
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    try {
      const v = localStorage.getItem("idea_slug");
      return v !== null ? v : "";
    } catch {
      return "";
    }
  });
  const [mounted, setMounted] = useState(false);

  // Upload Meeting modal state
  const [uploadIdeaSlug, setUploadIdeaSlug] = useState<string>("");
  const [uploadSource, setUploadSource] = useState<
    "zoom" | "meet" | "teams" | "manual"
  >("zoom");

  // Load only ideas connected to the current startup via ideas_startups
  const loadIdeas = useCallback(async () => {
    if (!startupId) {
      setIdeas([]);
      return;
    }

    // 1) Get idea ids for this startup
    const { data: links, error: linkErr } = await supabase
      .from("idea_startups")
      .select("idea_id")
      .eq("startup_id", startupId);

    if (linkErr) {
      setIdeas([]);
      return;
    }

    const ideaIds = (links ?? []).map((l) => l.idea_id as number);
    if (ideaIds.length === 0) {
      setIdeas([]);
      return;
    }

    // 2) Fetch the idea rows themselves
    const { data, error } = await supabase
      .from("ideas")
      .select("id,name,slug,status,cofounder")
      .in("id", ideaIds)
      .order("started_at", { ascending: false });

    if (!error && data) {
      setIdeas(data as IdeaLite[]);
      // Keep selection sane if current slug vanished
      if (selectedSlug !== "" && !data.some((i) => i.slug === selectedSlug)) {
        const activeIdea = data.find((i) => i.status === "active");
        setSelectedSlug(activeIdea ? activeIdea.slug : data[0]?.slug ?? "");
      }
    } else {
      setIdeas([]);
    }
  }, [startupId, selectedSlug]);

  const loadCofounders = useCallback(async () => {
    // Do nothing until we know who is logged in
    // and only fetch when the modal is shown (hooked in a useEffect below).
    try {
      const q = supabase.from("profiles").select("user_id,email");
      // Exclude self if we know the email
      if (loggedEmail) q.neq("email", loggedEmail);
      const { data, error } = await q.order("email", { ascending: true });
      if (!error && data) {
        setCofounders(
          (data as { user_id: string; email: string }[]).filter(
            (r) => !!r.user_id && !!r.email
          )
        );
      } else {
        setCofounders([]);
      }
    } catch {
      setCofounders([]);
    }
  }, [loggedEmail]);

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
    if (showNewIdea) {
      setCofounderId("");
      void loadCofounders();
    }
  }, [showNewIdea, loadCofounders]);

  useEffect(() => {
    if (showUpload) {
      // Default to the currently selected idea if available; otherwise force empty so the user must pick
      setUploadIdeaSlug(selectedIdea ? selectedIdea.slug : "");
      setUploadSource("zoom");
    }
  }, [showUpload, selectedIdea]);

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
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white"
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

                // Hard stop if no idea chosen
                if (!uploadIdeaSlug) {
                  alert(
                    "Please select an idea first (start an idea if you don’t have one)."
                  );
                  return;
                }

                const fd = new FormData(form);
                if (startupId) fd.set("startup_id", startupId);

                // Inject the Listbox-chosen values
                fd.set("idea_slug", uploadIdeaSlug);
                fd.set("source", uploadSource);

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
                  <div className="mt-1">
                    <Listbox
                      value={uploadIdeaSlug}
                      onChange={setUploadIdeaSlug}
                    >
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-10 text-left text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <span className="block truncate">
                            {uploadIdeaSlug
                              ? ideas.find((i) => i.slug === uploadIdeaSlug)
                                  ?.name ?? "Select idea"
                              : ideas.length
                              ? "Select idea"
                              : "No ideas — start one first"}
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
                            {ideas.map((idea) => (
                              <Listbox.Option
                                key={idea.id}
                                value={idea.slug}
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-8 pr-3 ${
                                    active
                                      ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`
                                }
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
                                        {idea.status === "active"
                                          ? "active"
                                          : "paused"}
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
                            {ideas.length === 0 && (
                              <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
                                No ideas yet — start one first.
                              </div>
                            )}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Source
                  </label>
                  <div className="mt-1">
                    <Listbox value={uploadSource} onChange={setUploadSource}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-10 text-left text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <span className="block truncate">
                            {uploadSource === "zoom" && "Zoom"}
                            {uploadSource === "meet" && "Google Meet"}
                            {uploadSource === "teams" && "MS Teams"}
                            {uploadSource === "manual" && "Manual"}
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
                            {[
                              { v: "zoom", label: "Zoom" },
                              { v: "meet", label: "Google Meet" },
                              { v: "teams", label: "MS Teams" },
                              { v: "manual", label: "Manual" },
                            ].map((opt) => (
                              <Listbox.Option
                                key={opt.v}
                                value={
                                  opt.v as "zoom" | "meet" | "teams" | "manual"
                                }
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-8 pr-3 ${
                                    active
                                      ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {opt.label}
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
                  {ideas.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      You don’t have any ideas yet. Start an idea first to
                      attach this meeting.
                    </p>
                  )}
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
                  disabled={!uploadIdeaSlug || ideas.length === 0}
                  title={
                    !uploadIdeaSlug || ideas.length === 0
                      ? "Select or start an idea first"
                      : undefined
                  }
                  className={`rounded-md px-3 py-2 text-sm font-medium text-white ${
                    !uploadIdeaSlug || ideas.length === 0
                      ? "bg-indigo-400 cursor-not-allowed opacity-70"
                      : "bg-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-500"
                  }`}
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
                const selectedCofounderId = cofounderId || "";
                const cofounder_email =
                  cofounders.find((c) => c.user_id === selectedCofounderId)
                    ?.email ?? null;

                const payload = {
                  name: String(fd.get("name") || ""),
                  slug: String(fd.get("slug") || ""),
                  notes: String(fd.get("notes") || ""),
                  // keep legacy key blank to avoid breaking older n8n flows
                  cofounder: "",
                  cofounder_user_id: selectedCofounderId || null,
                  cofounder_email,
                  startup_id: startupId ?? null,
                  creator_email: loggedEmail ?? null,
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
                  <div className="mt-1">
                    <Listbox value={cofounderId} onChange={setCofounderId}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 pl-3 pr-10 text-left text-sm text-gray-800 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <span className="block truncate">
                            {cofounderId
                              ? cofounders.find(
                                  (c) => c.user_id === cofounderId
                                )?.email ?? "Select cofounder"
                              : "— None —"}
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
                              key="__none__"
                              value=""
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-8 pr-3 ${
                                  active
                                    ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                                    : "text-gray-800 dark:text-gray-100"
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? "font-medium" : "font-normal"
                                    }`}
                                  >
                                    — None —
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
                            {cofounders.map((c) => (
                              <Listbox.Option
                                key={c.user_id}
                                value={c.user_id}
                                className={({ active }) =>
                                  `relative cursor-default select-none py-2 pl-8 pr-3 ${
                                    active
                                      ? "bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <span
                                      className={`block truncate ${
                                        selected ? "font-medium" : "font-normal"
                                      }`}
                                    >
                                      {c.email}
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
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Optional. Select another user (excluding yourself).
                  </p>
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
                  setTranscribing(true);
                  const res = await fetch(TRANSCRIBE_URL, {
                    method: "POST",
                    body: fd,
                  });

                  if (!res.ok) {
                    const txt = await res.text().catch(() => "");
                    alert(
                      "Transcription failed: " +
                        res.status +
                        (txt ? " — " + txt : "")
                    );
                    return;
                  }

                  // We expect a file (text/plain) from n8n -> download it
                  const blob = await res.blob();

                  // Try to use filename from Content-Disposition; fallback to default
                  const cd = res.headers.get("content-disposition") || "";
                  let filename = "transcript.txt";
                  const m =
                    /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
                  if (m)
                    filename = decodeURIComponent(m[1] || m[2] || filename);

                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);

                  setShowTranscribe(false);
                  form.reset();
                } catch (err) {
                  alert(
                    "Network error: " + ((err as Error)?.message || String(err))
                  );
                } finally {
                  setTranscribing(false);
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
                  disabled={transcribing}
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={transcribing}
                  onClick={() => setShowTranscribe(false)}
                  className={`rounded-md px-3 py-2 text-sm ${
                    transcribing
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transcribing}
                  aria-busy={transcribing}
                  className={`rounded-md px-3 py-2 text-sm font-medium text-white ${
                    transcribing
                      ? "bg-emerald-600 opacity-70 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500"
                  }`}
                >
                  {transcribing ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        ></path>
                      </svg>
                      Transcribing…
                    </span>
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
