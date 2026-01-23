"use client";

import { useEffect, useState } from "react";

type ApiResp = {
  block: { id: string; round: number; kickoffMin: string | null } | null;
  players: { id: string; name: string }[];
  games: { id: string; kickoff_at: string; team1: string; team2: string }[];
  isRevealed: boolean;
  grid: any[][];
};

type Choice = "TEAM1" | "DRAW" | "TEAM2";

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PalpitarPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/block/current", { cache: "no-store" });
    setData(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function sendPick(gameId: string, choice: Choice) {
    if (!playerId) {
      setMsg("Escolha o jogador primeiro.");
      return;
    }
    setMsg(null);
    const key = `${gameId}:${choice}`;
    setBusyKey(key);

    try {
      const r = await fetch("/api/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, gameId, choice }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j?.error || "Erro ao enviar palpite");
        return;
      }
      setMsg("✅ Palpite enviado.");
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Palpitar</h1>
        <p className="mt-1 text-sm text-slate-600">Escolha seu nome e envie os palpites do bloco atual.</p>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-sm font-semibold text-slate-700">Jogador</label>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">Selecione…</option>
            {data?.players?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {msg && <div className="mt-3 text-sm text-slate-700">{msg}</div>}
        </div>

        <div className="mt-4 space-y-3">
          {data?.games?.map((g) => (
            <div key={g.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {g.team1} <span className="text-slate-400">x</span> {g.team2}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{fmt(g.kickoff_at)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  onClick={() => sendPick(g.id, "TEAM1")}
                  disabled={busyKey !== null}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  {busyKey === `${g.id}:TEAM1` ? "Enviando…" : g.team1}
                </button>

                <button
                  onClick={() => sendPick(g.id, "DRAW")}
                  disabled={busyKey !== null}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  {busyKey === `${g.id}:DRAW` ? "Enviando…" : "Empate"}
                </button>

                <button
                  onClick={() => sendPick(g.id, "TEAM2")}
                  disabled={busyKey !== null}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  {busyKey === `${g.id}:TEAM2` ? "Enviando…" : g.team2}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Abra a Home para ver as bolinhas mudando para 🟢 conforme envia.
        </div>
      </div>
    </main>
  );
}
