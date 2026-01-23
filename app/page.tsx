"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResp = {
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
  grid: { status: "MISSING" | "SENT" | "REVEALED"; text: string | null }[][];
};

function fmtKickoff(iso: string) {
  // mostra em pt-BR no fuso local do navegador
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Dot({ kind }: { kind: "red" | "green" }) {
  return (
    <span
      className={[
        "inline-block h-3 w-3 rounded-full",
        kind === "green" ? "bg-green-500" : "bg-red-500",
      ].join(" ")}
    />
  );
}

export default function HomePage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/block/current", { cache: "no-store" });
      const j = (await r.json()) as ApiResp;
      setData(j);
    } catch (e: any) {
      setErr("Falha ao carregar /api/block/current");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // atualiza a cada 30s
    return () => clearInterval(t);
  }, []);

  const title = useMemo(() => {
    if (!data?.block) return "FutPol";
    return `FutPol — Rodada ${data.block.round}`;
  }, [data?.block]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Antes do kickoff do primeiro jogo, você só vê se o palpite foi enviado (🔴/🟢). No kickoff, revela.
            </p>
          </div>

          <button
            onClick={load}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Atualizar
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          {loading && <p className="text-sm text-slate-600">Carregando…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}

          {!loading && !err && data && (
            <>
              {!data.block ? (
                <p className="text-sm text-slate-700">
                  Nenhum bloco cadastrado ainda. Use a API admin para cadastrar a rodada e os 5 jogos.
                </p>
              ) : data.games.length === 0 ? (
                <p className="text-sm text-slate-700">
                  Bloco existe, mas não há jogos cadastrados nele.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking
