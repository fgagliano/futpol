"use client";

import { useEffect, useState } from "react";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

type ApiResp = {
  block: { id: string; round: number; kickoffMin: string | null } | null;
  players: { id: string; name: string }[];
  games: { id: string; kickoff_at: string; team1: string; team2: string }[];
  isRevealed: boolean;
  grid: any[][];
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ revealed }: { revealed: boolean }) {
  return revealed ? (
    <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
      REVELADO
    </span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
      ABERTO
    </span>
  );
}

export default function PalpitarPage() {
  const [data, setData] = useState<ApiResp | null>(null);

  const [playerId, setPlayerId] = useState("");
  const [saved, setSaved] = useState<Record<string, Choice>>({});

  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err" | null>(null);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/block/current", { cache: "no-store" });
    setData(await r.json());
  }

  async function loadSaved(pid: string) {
    if (!pid) {
      setSaved({});
      return;
    }
    const r = await fetch(`/api/pick/get?playerId=${encodeURIComponent(pid)}`, {
      cache: "no-store",
    });
    const j = await r.json();
    setSaved(j?.picks || {});
  }

  useEffect(() => {
    load();
  }, []);

  async function sendPick(gameId: string, choice: Choice) {
    if (!playerId) {
      setMsg("Escolha o jogador primeiro.");
      setMsgKind("err");
      return;
    }

    if (data?.isRevealed) {
      setMsg("Palpites travados (kickoff do bloco já iniciou).");
      setMsgKind("err");
      return;
    }

    setMsg(null);
    setMsgKind(null);

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
        setMsgKind("err");
        return;
      }

      setSaved((prev) => ({ ...prev, [gameId]: choice }));
      setMsg("✅ Palpite salvo.");
      setMsgKind("ok");

      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Palpitar
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Escolha seu nome e envie os palpites do bloco atual.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Jogador
            </label>

            {data?.block && <Badge revealed={!!data.isRevealed} />}
          </div>

          <select
            value={playerId}
            onChange={async (e) => {
              const id = e.target.value;
              setPlayerId(id);
              setMsg(null);
              setMsgKind(null);
              setSaved({});
              if (!id) return;
              await loadSaved(id);
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Selecione…</option>
            {data?.players?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {data?.block && (
            <div className="mt-3 text-xs text-slate-500">
              Rodada{" "}
              <span className="font-semibold text-slate-700">
                {data.block.round}
              </span>{" "}
              • {data.isRevealed ? "Revelado" : "Aberto para palpites"}
            </div>
          )}

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
        </div>

        <div className="mt-4 space-y-3">
          {data?.games?.map((g) => {
            const current = saved[g.id];

            return (
              <div
                key={g.id}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {g.team1} <span className="text-slate-400">x</span>{" "}
                      {g.team2}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmt(g.kickoff_at)}
                    </div>

                    {current ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-700">
                        ✅ Salvo
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-400">Pendente</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => sendPick(g.id, "TEAM1")}
                    disabled={busyKey !== null || !!data?.isRevealed}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                      current === "TEAM1"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50",
                      (busyKey !== null || !!data?.isRevealed)
                        ? "opacity-70 cursor-not-allowed"
                        : "",
                    ].join(" ")}
                  >
                    {busyKey === `${g.id}:TEAM1` ? "Salvando…" : g.team1}
                  </button>

                  <button
                    onClick={() => sendPick(g.id, "DRAW")}
                    disabled={busyKey !== null || !!data?.isRevealed}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                      current === "DRAW"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50",
                      (busyKey !== null || !!data?.isRevealed)
                        ? "opacity-70 cursor-not-allowed"
                        : "",
                    ].join(" ")}
                  >
                    {busyKey === `${g.id}:DRAW` ? "Salvando…" : "Empate"}
                  </button>

                  <button
                    onClick={() => sendPick(g.id, "TEAM2")}
                    disabled={busyKey !== null || !!data?.isRevealed}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold border transition active:scale-[0.99]",
                      current === "TEAM2"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50",
                      (busyKey !== null || !!data?.isRevealed)
                        ? "opacity-70 cursor-not-allowed"
                        : "",
                    ].join(" ")}
                  >
                    {busyKey === `${g.id}:TEAM2` ? "Salvando…" : g.team2}
                  </button>
                </div>

                {data?.isRevealed && (
                  <div className="mt-3 text-xs text-amber-700">
                    Palpites travados (kickoff do bloco já iniciou).
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Dica: abra a Home para ver as bolinhas mudando para 🟢 conforme envia.
        </div>
      </div>
    </main>
  );
}
