"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type BlockResp = { isRevealed: boolean };


type OneXTwo = "1" | "X" | "2";

type Resp = {
  round: number;
  players: { id: string; name: string }[];
  games: {
    id: string;
    kickoff_at: string;
    team1: string;
    team2: string;
    score1: number | null;
    score2: number | null;
    gabarito: OneXTwo | null;
  }[];
  grid: { pick: OneXTwo | null; points: number | null }[][];
  totalsRound: { playerId: string; name: string; totalRound: number }[];
  overall: { playerId: string; name: string; totalOverall: number }[];
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

function pillPts(pts: number | null) {
  if (pts === null) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (pts > 0) return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (pts < 0) return "bg-rose-50 text-rose-700 ring-rose-100";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function fmtPts(pts: number | null) {
  if (pts === null) return "—";
  if (pts > 0) return `+${pts}`;
  return String(pts);
}

function pickBadge(pick: OneXTwo | null) {
  if (!pick) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (pick === "1") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (pick === "2") return "bg-blue-50 text-blue-700 ring-blue-100";
  return "bg-amber-50 text-amber-800 ring-amber-100"; // X
}

export default function ResultadosPage() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
const [isRevealed, setIsRevealed] = useState(false);

async function loadRevealFlag() {
  try {
    const r = await fetch(`/api/block/current?ts=${Date.now()}`, { cache: "no-store" });
    const j = (await r.json()) as BlockResp;
    setIsRevealed(!!j?.isRevealed);
  } catch {
    // se der erro de rede, por segurança NÃO revela
    setIsRevealed(false);
  }
}

  async function load(rnd: number) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/results/by-round?round=${rnd}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "Erro ao carregar");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overallMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of data?.overall || []) m.set(o.playerId, o.totalOverall);
    return m;
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resultados</h1>
            <p className="mt-1 text-sm text-slate-600">
              Gabarito + palpites + pontos por jogo (estilo sua planilha).
            </p>
          </div>

          <button
            onClick={() => load(round)}
            disabled={loading}
            className={[
              "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm",
              loading
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            ].join(" ")}
          >
            {loading ? "Carregando…" : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-800">Rodada</div>
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
            </div>

            <div className="text-xs text-slate-500">
              {data ? `Rodada carregada: ${data.round}` : "—"}
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
              {err}
            </div>
          )}
        </div>

        {/* RESUMO DE JOGOS + GABARITO */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Jogos da rodada</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              gabarito: 1 / X / 2
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-200">
            {(data?.games || []).map((g) => {
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
                          g.gabarito
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                            : "bg-slate-100 text-slate-600 ring-slate-200",
                        ].join(" ")}
                      >
                        {g.gabarito ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TABELA "EXCEL" (DESKTOP) */}
        <div className="mt-4 hidden overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 sm:block">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                    Jogador
                  </th>

                  {(data?.games || []).map((g, idx) => (
                    <th
                      key={g.id}
                      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200"
                    >
                      <div className="text-slate-800 font-semibold normal-case">
                        {idx + 1}. {g.team1} x {g.team2}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        {fmtKickoff(g.kickoff_at)}
                      </div>
                    </th>
                  ))}

                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                    Total<br />Rodada
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                    Acum.
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* GABARITO */}
                <tr className="bg-amber-50">
                  <td className="sticky left-0 z-10 bg-amber-50 px-4 py-3 text-sm font-extrabold text-slate-900 ring-1 ring-slate-200">
                    GABARITO
                  </td>

                  {(data?.games || []).map((g) => (
                    <td key={g.id} className="px-4 py-3 ring-1 ring-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          {g.gabarito ?? "—"}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {g.score1 !== null && g.score2 !== null ? `${g.score1}x${g.score2}` : ""}
                        </span>
                      </div>
                    </td>
                  ))}

                  <td className="px-4 py-3 text-center ring-1 ring-slate-200 text-sm font-semibold text-slate-700">—</td>
                  <td className="px-4 py-3 text-center ring-1 ring-slate-200 text-sm font-semibold text-slate-700">—</td>
                </tr>

                {/* PLAYERS: 2 linhas por jogador */}
                {(data?.players || []).map((pl, pi) => {
                  const rowPick = data?.grid?.[pi] || [];
                  const totalRound =
                    rowPick.reduce((acc, c) => acc + (c.points ?? 0), 0) ?? 0;
                  const acum = overallMap.get(pl.id) ?? 0;

                  return (
<Fragment key={pl.id}>

                    {/* linha Palpite */}
                      <tr className="bg-white">
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 ring-1 ring-slate-200">
                          <div className="text-sm font-bold text-slate-900">{pl.name}</div>
                          <div className="text-xs font-semibold text-slate-500">Palpite</div>
                        </td>

                        {(data?.games || []).map((g, gi) => {
                          const cell = rowPick[gi] || { pick: null, points: null };
                          return (
                            <td key={g.id} className="px-4 py-3 ring-1 ring-slate-200">
                              <span
                                className={[
                                  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                                  pickBadge(cell.pick),
                                ].join(" ")}
                              >
                                {cell.pick ?? "—"}
                              </span>
                            </td>
                          );
                        })}

                        <td className="px-4 py-3 text-center ring-1 ring-slate-200">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pillPts(totalRound)}`}>
                            {fmtPts(totalRound)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center ring-1 ring-slate-200">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {acum}
                          </span>
                        </td>
                      </tr>

                      {/* linha Pontos */}
                      <tr className="bg-slate-50">
                        <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                          <div className="text-xs font-semibold text-slate-500">Pontos</div>
                        </td>

                        {(data?.games || []).map((g, gi) => {
                          const cell = rowPick[gi] || { pick: null, points: null };
                          return (
                            <td key={g.id} className="px-4 py-3 ring-1 ring-slate-200">
                              <span
                                className={[
                                  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                                  pillPts(cell.points),
                                ].join(" ")}
                              >
                                {fmtPts(cell.points)}
                              </span>
                            </td>
                          );
                        })}

                        <td className="px-4 py-3 text-center ring-1 ring-slate-200 text-sm font-semibold text-slate-700">
                          {/* repetimos o total aqui como você faz no excel (opcional). Se não quiser, troca por "—" */}
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pillPts(totalRound)}`}>
                            {fmtPts(totalRound)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center ring-1 ring-slate-200 text-sm font-semibold text-slate-700">
                          —
                        </td>
                      </tr>
                    </Fragment>

                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE: cards por jogador */}
        <div className="mt-4 space-y-3 sm:hidden">
          {(data?.players || []).map((pl, pi) => {
            const row = data?.grid?.[pi] || [];
            const totalRound = row.reduce((acc, c) => acc + (c.points ?? 0), 0);
            const acum = overallMap.get(pl.id) ?? 0;

            return (
              <div key={pl.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-bold text-slate-900">{pl.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Total rodada:{" "}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${pillPts(totalRound)}`}>
                        {fmtPts(totalRound)}
                      </span>{" "}
                      • Acum.:{" "}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                        {acum}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {(data?.games || []).map((g, gi) => {
                    const cell = row[gi] || { pick: null, points: null };
                    return (
                      <div key={g.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <div className="text-xs font-semibold text-slate-700">
                          {gi + 1}. {g.team1} x {g.team2}
                          <div className="mt-0.5 text-[11px] font-medium text-slate-500">
                            Gab: {g.gabarito ?? "—"} • {g.score1 !== null && g.score2 !== null ? `${g.score1}x${g.score2}` : "sem placar"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pickBadge(cell.pick)}`}>
                            {cell.pick ?? "—"}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${pillPts(cell.points)}`}>
                            {fmtPts(cell.points)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
                {/* RANKINGS (FINAL) */}
        {data && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Ranking da Rodada */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Ranking da Rodada</h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  Rodada {data.round}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {data.totalsRound.map((r, idx) => (
                  <div
                    key={r.playerId}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-sm font-extrabold text-slate-700">
                        {idx + 1}º
                      </span>
                      <span className="text-sm font-bold text-slate-900">{r.name}</span>
                    </div>

                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                        pillPts(r.totalRound),
                      ].join(" ")}
                    >
                      {fmtPts(r.totalRound)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking Acumulado */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Ranking Acumulado</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                  Geral
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {data.overall.map((r, idx) => (
                  <div
                    key={r.playerId}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-sm font-extrabold text-slate-700">
                        {idx + 1}º
                      </span>
                      <span className="text-sm font-bold text-slate-900">{r.name}</span>
                    </div>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                      {r.totalOverall}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
