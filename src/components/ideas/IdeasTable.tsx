"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type IdeaRow = {
  id: number;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived" | string;
  cofounder?: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes?: string | null;
};

export default function IdeasTable() {
  const [rows, setRows] = useState<IdeaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  async function reload() {
    setRefreshFlag((n) => n + 1);
  }

  async function makeActive(slug: string) {
    setUpdatingSlug(slug);
    try {
      const res = await fetch("/api/n8n?target=update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, status: "active" }),
      });
      if (!res.ok) {
        alert(`Failed to update: ${res.status} ${res.statusText}`);
        return;
      }
      await reload();
    } finally {
      setUpdatingSlug(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("ideas")
        .select("id,name,slug,status,cofounder,started_at,ended_at,notes")
        .order("started_at", { ascending: false })
        .returns<IdeaRow[]>();
      if (!mounted) return;
      if (error) {
        setError(error.message);
      } else if (data) {
        const sorted = [...data].sort((a, b) => {
          const aActive = (a.status || "").toLowerCase() === "active";
          const bActive = (b.status || "").toLowerCase() === "active";
          if (aActive && !bActive) return -1;
          if (bActive && !aActive) return 1;
          const aEnd = a.ended_at ? new Date(a.ended_at).getTime() : 0;
          const bEnd = b.ended_at ? new Date(b.ended_at).getTime() : 0;
          // Descending by ended_at (most recently ended first)
          return bEnd - aEnd;
        });
        setRows(sorted);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshFlag]);

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        Loading ideas…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200 p-4 text-sm">
        Error loading ideas: {error}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center text-sm text-gray-600 dark:text-gray-300">
        No ideas yet. Use <span className="font-medium">Start new idea</span> to
        create one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-200">
          <tr>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th>Status</Th>
            <Th>Cofounder</Th>
            <Th>Started</Th>
            <Th>Ended</Th>
            <Th className="text-right pr-4">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.id} className="text-gray-800 dark:text-gray-100">
              <Td>{r.name}</Td>
              <Td>
                <code className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs">
                  {r.slug}
                </code>
              </Td>
              <Td>
                <StatusBadge status={r.status} />
              </Td>
              <Td>{r.cofounder || <span className="text-gray-400">—</span>}</Td>
              <Td>{fmtDate(r.started_at)}</Td>
              <Td>
                {fmtDate(r.ended_at) || (
                  <span className="text-gray-400">—</span>
                )}
              </Td>
              <Td className="text-right pr-4">
                {r.status !== "active" ? (
                  <button
                    onClick={() => makeActive(r.slug)}
                    disabled={updatingSlug === r.slug}
                    className="inline-flex items-center rounded-md px-2.5 py-1.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                  >
                    {updatingSlug === r.slug ? "Activating…" : "Activate"}
                  </button>
                ) : (
                  <span className="inline-flex items-center rounded-md px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs">
                    Current
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
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

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: {
      bg: "bg-green-100 dark:bg-green-900/40",
      fg: "text-green-800 dark:text-green-300",
      label: "active",
    },
    paused: {
      bg: "bg-red-100 dark:bg-red-900/40",
      fg: "text-red-800 dark:text-red-300",
      label: "paused",
    },
    archived: {
      bg: "bg-gray-100 dark:bg-gray-800",
      fg: "text-gray-800 dark:text-gray-300",
      label: "archived",
    },
  };
  const style = map[s] || map["archived"];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.fg}`}
    >
      {style.label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}
