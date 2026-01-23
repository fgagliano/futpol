"use client";

import { useEffect, useMemo, useState } from "react";

type ApiByRoundResp = {
  block: { id: string; round: number; kickoffMin: string | null } | null;
  players: { id: string; name: string }[];
  games: {
    id: string;
    kickoff_at: string;
    team1: string;
    team2: string;
    score1: number | null;
    score2: number | null;
  }[];
  isRevealed: boolean;
  grid: any[][];
};

type GameForm = {
  id?: string; // vem do banco quando já existe
  kickoff_at: string; // datetime-local
  team1: string;
  team2: string;
  score1: string; // input (permite vazio)
  score2: string;
};

function isoToDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function toIsoWithLocalTz(datetimeLocal: string) {
  const d = new Date(datetimeLocal);
  const pad = (n: number) => String(n).padStart(2, "0");

  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = "00";

  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

function emptyGames(): GameForm[] {
  return Array.from({ length: 5 }).map(() => ({
    kickoff_at: "",
    team1: "",
    team2: "",
    score1: "",
    score2: "",
  }));
}

export default function AdminGamesPage() {
  const [round, setRound] = useState<number>(1);
  const [games, setGames] = useState<GameForm[]>(() => emptyGames());

  const [busySave, setBusySave] = useState(false);
  const [busyScore, setBusyScore] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err" | null>(null);

  function setGame(i: number, patch: Partial<GameForm>) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  async function loadRound(rnd: number) {
    setMsg(null);
    setMsgKind(null);

    const r = await fetch(
      `/api/block/by-round?round=${encodeURIComponent(String(rnd))}&ts=${Date.now()}`,
      { cache: "no-store" }
    );
    const j = (await r.json()) as ApiByRoundResp;

    // rodada ainda não cadastrada: limpa a tela
    if (!j.block) {
      setRound(rnd);
      setGames(emptyGames());
      setMsg(
        `Rodada ${rnd} ainda não cadastrada. Preencha os 5 jogos e clique "Salvar jogos (estrutura)".`
      );
      setMsgKind("ok");
      return;
    }

    setRound(j.block.round);

    const base = (j.games || []).slice(0, 5);
    const mapped: GameForm[] = base.map((g) => ({
      id: g.id,
      kickoff_at: isoToDatetimeLocal(g.kickoff_at),
      team1: g.team1 ?? "",
      team2: g.team2 ?? "",
      score1: g.score1 === null || g.score1 === undefined ? "" : String(g.score1),
      score2: g.score2 === null || g.score2 === undefined ? "" : String(g.score2),
    }));

    while (mapped.length < 5) mapped.push(...emptyGames().slice(0, 5 - mapped.length));

    setGames(mapped);
    setMsg(`Carregado: rodada ${j.block.round}.`);
    setMsgKind("ok");
  }

  useEffect(() => {
    loadRound(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSaveGames = useMemo(() => {
    if (!round || round < 1 || round > 38) return false;
    if (games.length !== 5) return false;
    return games.every(
      (g) => g.kickoff_at.trim() && g.team1.trim().length >= 2 && g.team2.trim().length >= 2
    );
  }, [round, games]);

  const hasGameIds = useMemo(() => games.every((g) => !!g.id), [games]);

  async function saveGamesStructure() {
    setBusySave(true);
    setMsg(null);
    setMsgKind(null);

    try {
      const payload = {
        round,
        games: games.map((g) => ({
          kickoff_at: toIsoWithLocalTz(g.kickoff_at),
          team1: g.team1.trim(),
          team2: g.team2.trim(),
        })),
      };

      const r = await fetch("/api/admin/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();

      if (!r.ok) {
        setMsg(j?.error ? `Erro: ${j.error}` : "Erro ao salvar jogos");
        setMsgKind("err");
        return;
      }

      setMsg(`✅ Jogos da rodada ${round} salvos.`);
      setMsgKind("ok");

      await loadRound(round);
    } catch {
      setMsg("Erro ao salvar (rede ou servidor).");
      setMsgKind("err");
    } finally {
      setBusySave(false);
    }
  }

  async function saveScoresOnly() {
    setBusyScore(true);
    setMsg(null);
    setMsgKind(null);

    try {
      if (!hasGameIds) {
        setMsg("Ainda não tenho os IDs dos jogos. Salve os jogos primeiro.");
        setMsgKind("err");
        return;
      }

      const payload = {
        round,
        scores: games.map((g) => {
          const s1 = g.score1.trim();
          const s2 = g.score2.trim();

          const score1 = s1 === "" ? null : Number(s1);
          const score2 = s2 === "" ? null : Number(s2);

          return {
            gameId: g.id!,
            score1: Number.isFinite(score1 as any) ? (score1 as any) : null,
            score2: Number.isFinite(score2 as any) ? (score2 as any) : null,
          };
        }),
      };

      const r = await fetch("/api/admin/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();

      if (!r.ok) {
        setMsg(j?.error ? `Erro: ${j.error}` : "Erro ao salvar placares");
        setMsgKind("err");
        return;
      }

      setMsg("✅ Placares salvos (campos vazios ficam como null).");
      setMsgKind("ok");

      await loadRound(round);
    } catch {
      setMsg("Erro ao salvar placares (rede ou servidor).");
      setMsgKind("err");
    } finally {
      setBusyScore(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin — Jogos e placares</h1>
            <p className="mt-1 text-sm text-slate-600">
              Selecione a rodada. Se existir, carrega. Se não existir, abre vazio para cadastrar.
            </p>
          </div>

          <button
            onClick={() => loadRound(round)}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Recarregar
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-sm font-semibold text-slate-700">Rodada</label>

          <div className="mt-2 flex items-center gap-2">
            <select
              value={round}
              onChange={(e) => {
                const rnd = Number(e.target.value);
                if (!rnd) return;
                loadRound(rnd);
              }}
              className="w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {Array.from({ length: 38 }).map((_, i) => {
                const rnd = i + 1;
                return (
                  <option key={rnd} value={rnd}>
                    Rodada {rnd}
                  </option>
                );
              })}
            </select>

            <span className="text-xs text-slate-500">1 a 38</span>
          </div>

          {msg && (
            <div
              className={[
                "mt-3 rounded-xl px-3 py-2 text-sm ring-1",
                msgKind === "ok"
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                  : "bg-rose-50 text-rose-700 ring-rose-100",
              ].join(" ")}
            >
              {msg}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {games.map((g, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Jogo {i + 1}</div>
                  {g.id ? (
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                      ID OK
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                      sem ID
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Data/Hora
                    </label>
                    <input
                      type="datetime-local"
                      value={g.kickoff_at}
                      onChange={(e) => setGame(i, { kickoff_at: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Mandante
                    </label>
                    <input
                      value={g.team1}
                      onChange={(e) => setGame(i, { team1: e.target.value })}
                      placeholder="Ex.: Palmeiras"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Visitante
                    </label>
                    <input
                      value={g.team2}
                      onChange={(e) => setGame(i, { team2: e.target.value })}
                      placeholder="Ex.: Corinthians"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xs">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Placar mandante
                    </label>
                    <input
                      inputMode="numeric"
                      value={g.score1}
                      onChange={(e) => setGame(i, { score1: e.target.value })}
                      placeholder="(vazio = null)"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Placar visitante
                    </label>
                    <input
                      inputMode="numeric"
                      value={g.score2}
                      onChange={(e) => setGame(i, { score2: e.target.value })}
                      placeholder="(vazio = null)"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Dica: você pode preencher placares aos poucos. Campos vazios ficam como <span className="font-semibold">null</span>.
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={saveGamesStructure}
              disabled={!canSaveGames || busySave}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm",
                canSaveGames && !busySave
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {busySave ? "Salvando…" : "Salvar jogos (estrutura)"}
            </button>

            <button
              onClick={saveScoresOnly}
              disabled={!hasGameIds || busyScore}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm",
                hasGameIds && !busyScore
                  ? "bg-blue-700 text-white hover:bg-blue-800"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {busyScore ? "Salvando…" : "Salvar placares"}
            </button>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            <span className="font-semibold">Importante:</span> “Salvar placares” só dá UPDATE em{" "}
            <code>games.score1/score2</code>. Não apaga nem recria jogos.
          </div>
        </div>
      </div>
    </main>
  );
}
