"use client";

import { useEffect, useMemo, useState } from "react";

type Resp = {
  round: number;
  games: {
    id: string;
    kickoff_at: string;
    team1: string;
    team2: string;
    score1: number | null;
    score2: number | null;
  }[];
  gabarito: { gameId: string; gabarito: "1" | "X" | "2" | null }[];
  totalsRound: { name: string; totalRound: number }[];
  totalOverall: { name: string; totalOverall: number }[];
};

function fmtKickoff(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
      {children}
    </span>
  );
}

function ScorePill({ v }: { v: number }) {
  const cls =
    v > 0
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : v < 0
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  const txt = v > 0 ? `+${v}` : String(v);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>{txt}</span>;
}

export default function ResultadosPage() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(rnd: number) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/results/by-round?round=${rnd}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "Erro ao carregar resultados");
        setData(null);
        return;
      }
      setData(j as Resp);
    } catch {
      setErr("Falha de rede");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  const gabaritoMap = useMemo(() => {
    const m = new Map<string, "1" | "X" | "2" | null>();
    for (const g of data?.gabarito || []) m.set(g.gameId, g.gabarito);
    return m;
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resultados</h1>
            <p className="mt-1 text-sm text-slate-600">
              Placares, gabarito (1/X/2), total da rodada e acumulado.
            </p>
          </div>

          <button
            onClick={() => load(round)}
            disabled={loading}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm",
              loading ? "bg-slate-200 text-slate-500" : "bg-emerald-600 text-white hover:bg-emerald-700",
            ].join(" ")}
          >
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">Rodada</div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={round}
                  onChange={(e) => {
                    const rnd = Number(e.target.value);
                    setRound(rnd);
                    load(rnd);
                  }}
                  className="w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {Array.from({ length: 38 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Rodada {i + 1}
                    </option>
                  ))}
                </select>

                {data ? <Badge>Rodada {data.round}</Badge> : <Badge>—</Badge>}
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
              {err}
            </div>
          )}
        </div>

        {/* Jogos / placares */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Jogos</h2>
            <Badge>Gabarito: 1 / X / 2</Badge>
          </div>

          <div className="mt-3 divide-y divide-slate-200">
            {(data?.games || []).map((g) => {
              const gab = gabaritoMap.get(g.id) ?? null;
              const hasScore = g.score1 !== null && g.score2 !== null;

              return (
                <div key={g.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {g.team1} <span className="text-slate-400">x</span> {g.team2}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{fmtKickoff(g.kickoff_at)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
                        {hasScore ? `${g.score1} x ${g.score2}` : "—"}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                          gab
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : "bg-slate-100 text-slate-600 ring-slate-200",
                        ].join(" ")}
                      >
                        {gab ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo rodada + acumulado */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Total da rodada</h2>
            <div className="mt-3 space-y-2">
              {(data?.totalsRound || []).map((r) => (
                <div key={r.name} className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">{r.name}</div>
                  <ScorePill v={r.totalRound} />
                </div>
              ))}
              {!data && <div className="text-sm text-slate-500">—</div>}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Acumulado</h2>
            <div className="mt-3 space-y-2">
              {(data?.totalOverall || []).map((r) => (
                <div key={r.name} className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">{r.name}</div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {r.totalOverall}
                  </span>
                </div>
              ))}
              {!data && <div className="text-sm text-slate-500">—</div>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
