"use client";

import { useMemo, useState } from "react";

type GameForm = {
  kickoff_at: string; // datetime-local
  team1: string;
  team2: string;
};

function toIsoWithLocalTz(datetimeLocal: string) {
  // datetimeLocal: "2026-01-24T00:00"
  // Converte para ISO com timezone local do browser.
  // Ex.: "2026-01-24T00:00:00-03:00"
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

export default function AdminGamesPage() {
  const [round, setRound] = useState<number>(1);
  const [games, setGames] = useState<GameForm[]>(() =>
    Array.from({ length: 5 }).map(() => ({
      kickoff_at: "",
      team1: "",
      team2: "",
    }))
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!round || round < 1 || round > 38) return false;
    if (games.length !== 5) return false;
    return games.every(
      (g) =>
        g.kickoff_at.trim() &&
        g.team1.trim().length >= 2 &&
        g.team2.trim().length >= 2
    );
  }, [round, games]);

  function setGame(i: number, patch: Partial<GameForm>) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  async function save() {
    setBusy(true);
    setMsg(null);

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
        setMsg(j?.error ? `Erro: ${j.error}` : "Erro ao salvar");
        return;
      }

      setMsg(`✅ Rodada ${round} salva com 5 jogos.`);
    } catch (e: any) {
      setMsg("Erro ao salvar (rede ou servidor).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Admin — Lançar jogos
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Informe a rodada e os 5 jogos (data/hora + mandante + visitante). Sem proteção por enquanto.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-sm font-semibold text-slate-700">
            Rodada (bloco atual = maior rodada)
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={38}
              value={round}
              onChange={(e) => setRound(parseInt(e.target.value || "1", 10))}
              className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <span className="text-xs text-slate-500">1 a 38</span>
          </div>

          <div className="mt-6 space-y-4">
            {games.map((g, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">
                    Jogo {i + 1}
                  </div>
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
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={save}
              disabled={!canSubmit || busy}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
                canSubmit && !busy
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {busy ? "Salvando…" : "Salvar 5 jogos"}
            </button>

            {msg && (
              <div className="text-sm text-slate-700">
                {msg}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Dica: por padrão, essa tela chama <code>/api/admin/block</code>.
            Depois que salvar, confira a Home e o <code>/api/block/current</code>.
          </div>
        </div>
      </div>
    </main>
  );
}
