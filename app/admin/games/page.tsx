"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  id?: string;
  kickoff_at: string; // datetime-local
  team1: string;
  team2: string;
  score1: string; // permite vazio
  score2: string; // permite vazio
};

function emptyGames(): GameForm[] {
  return Array.from({ length: 5 }).map(() => ({
    kickoff_at: "",
    team1: "",
    team2: "",
    score1: "",
    score2: "",
  }));
}

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

function Pill({ kind, children }: { kind: "ok" | "warn" | "info"; children: ReactNode }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : kind === "warn"
      ? "bg-amber-50 text-amber-800 ring-amber-100"
      : "bg-blue-50 text-blue-700 ring-blue-100";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cls}`}>
      {children}
    </span>
  );
}

function Notice({ kind, text }: { kind: "ok" | "err"; text: string }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
      : "bg-rose-50 text-rose-700 ring-rose-100";
  return <div className={`mt-3 rounded-2xl px-4 py-3 text-sm ring-1 ${cls}`}>{text}</div>;
}

export default function AdminGamesPage() {
  const [round, setRound] = useState<number>(1);
  const [games, setGames] = useState<GameForm[]>(() => emptyGames());

  const [loadingRound, setLoadingRound] = useState(false);
  const [busySaveGames, setBusySaveGames] = useState(false);
  const [busySaveScores, setBusySaveScores] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err" | null>(null);

  const hasIds = useMemo(() => games.every((g) => !!g.id), [games]);

  const canSaveGames = useMemo(() => {
    if (!round || round < 1 || round > 38) return false;
    return games.every(
      (g) => g.kickoff_at.trim() && g.team1.trim().length >= 2 && g.team2.trim().length >= 2
    );
  }, [round, games]);

  const isEmptyRound = useMemo(() => games.every((g) => !g.id), [games]);

  function setGame(i: number, patch: Partial<GameForm>) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  async function loadRound(rnd: number) {
    setLoadingRound(true);
    setMsg(null);
    setMsgKind(null);

    try {
      const r = await fetch(
        `/api/block/by-round?round=${encodeURIComponent(String(rnd))}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const j = (await r.json()) as ApiByRoundResp;

      if (!j.block) {
        setRound(rnd);
        setGames(emptyGames());
        setMsg(`Rodada ${rnd} ainda não cadastrada. Preencha os 5 jogos e salve a estrutura.`);
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
      setMsg(`Rodada ${j.block.round} carregada.`);
      setMsgKind("ok");
    } catch {
      setMsg("Falha ao carregar a rodada (rede/servidor).");
      setMsgKind("err");
    } finally {
      setLoadingRound(false);
    }
  }

  useEffect(() => {
  (async () => {
    try {
      const r = await fetch(`/api/admin/last-round?ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      const last = Number(j?.lastRound);

      // proteção: se vier lixo, cai em 1
      const target = Number.isFinite(last) && last >= 1 && last <= 38 ? last : 1;

      await loadRound(target);
    } catch {
      await loadRound(1);
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


async function saveGamesStructure() {
  setBusySaveGames(true);
  setMsg(null);
  setMsgKind(null);

  try {
    const payload = {
      round,
      games: games.map((g) => ({
        id: g.id ?? null,
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

    // 👇 NÃO use mais r.json() direto (pode vir HTML de erro)
   const ct = r.headers.get("content-type") || "sem content-type";
const raw = await r.text();

let j: any = null;
try {
  j = raw ? JSON.parse(raw) : null;
} catch {}

if (!r.ok) {
  const snippet =
    (j?.error || j?.message) ??
    (raw ? raw.slice(0, 300) : "(sem body)");

  setMsg(`Erro: HTTP ${r.status} ${r.statusText} • ${ct} • ${snippet}`);
  setMsgKind("err");
  return;
}


    setMsg(`✅ Estrutura salva (rodada ${round}).`);
    setMsgKind("ok");
    await loadRound(round);
  } catch (e: any) {
    setMsg(`Erro ao salvar (rede/servidor): ${e?.message ?? String(e)}`);
    setMsgKind("err");
  } finally {
    setBusySaveGames(false);
  }
}


  async function saveScoresOnly() {
    setBusySaveScores(true);
    setMsg(null);
    setMsgKind(null);

    try {
      if (!hasIds) {
        setMsg("Ainda não existem jogos salvos nessa rodada. Salve a estrutura primeiro.");
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

      setMsg("✅ Placares salvos.");
      setMsgKind("ok");
      await loadRound(round);
    } catch {
      setMsg("Erro ao salvar placares (rede/servidor).");
      setMsgKind("err");
    } finally {
      setBusySaveScores(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin</h1>
            <p className="mt-1 text-sm text-slate-600">
              Lançamento dos 5 jogos e, depois, dos placares. Troque a rodada e o conteúdo carrega.
            </p>
          </div>

          <a
  href="/"
  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
>
  Home
</a>

        </div>

        {/* TOP CARD */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">Rodada</div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={round}
                  onChange={(e) => loadRound(Number(e.target.value))}
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

                {isEmptyRound ? <Pill kind="warn">não cadastrada</Pill> : <Pill kind="ok">carregada</Pill>}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={saveGamesStructure}
                disabled={!canSaveGames || busySaveGames}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm",
                  canSaveGames && !busySaveGames
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed",
                ].join(" ")}
              >
                {busySaveGames ? "Salvando…" : "Salvar jogos"}
              </button>
            </div>
          </div>

          {msg && msgKind && <Notice kind={msgKind} text={msg} />}

          <div className="mt-3 text-xs text-slate-500">
            <span className="font-semibold">Salvar jogos</span> cria/atualiza kickoff e times. O botão “Salvar” ao lado do placar
            salva <code>score1/score2</code>.
          </div>
        </div>

        {/* GAMES */}
        <div className="mt-4 space-y-3">
          {games.map((g, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Jogo {i + 1}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {g.id ? (
                      <span className="inline-flex items-center gap-2">
                        <Pill kind="info">id ok</Pill>
                        <span className="truncate max-w-[220px] sm:max-w-[420px]">{g.id}</span>
                      </span>
                    ) : (
                      <Pill kind="warn">sem id (ainda não salvo)</Pill>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Pill kind="ok">verde</Pill>
                  <Pill kind="info">azul</Pill>
                  <Pill kind="warn">amarelo</Pill>
                </div>
              </div>

              {/* TIMES */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

              {/* SCORE + BOTÃO SALVAR (por jogo) */}
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Placar (opcional)
                </label>

                <div className="mt-2 flex items-stretch gap-2">
                  <div className="inline-flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white">
                    <input
                      inputMode="numeric"
                      value={g.score1}
                      onChange={(e) => setGame(i, { score1: e.target.value })}
                      placeholder="—"
                      className="w-16 px-3 py-2 text-center text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <div className="flex items-center justify-center px-3 text-sm font-semibold text-slate-400">
                      x
                    </div>
                    <input
                      inputMode="numeric"
                      value={g.score2}
                      onChange={(e) => setGame(i, { score2: e.target.value })}
                      placeholder="—"
                      className="w-16 px-3 py-2 text-center text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <button
                    type="button"
                    title="Salvar placares"
                    onClick={saveScoresOnly}
                    disabled={!hasIds || busySaveScores}
                    className={[
                      "shrink-0 rounded-xl px-3 py-2 text-sm font-extrabold shadow-sm ring-1 transition",
                      hasIds && !busySaveScores
                        ? "bg-blue-700 text-white ring-blue-700 hover:bg-blue-800"
                        : "bg-slate-200 text-slate-500 ring-slate-200 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {busySaveScores ? "…" : "Salvar"}
                  </button>
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Deixe vazio para <span className="font-semibold">null</span>. (O botão salva os 5 placares de uma vez.)
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER HELP */}
        <div className="mt-6 text-xs text-slate-500">
          Dica: para cadastrar a rodada 2, selecione <span className="font-semibold">Rodada 2</span>. Se não existir, a tela abre vazia.
        </div>
      </div>
    </main>
  );
}
