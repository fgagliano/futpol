import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

function resultFromScore(score1: number, score2: number): Choice {
  if (score1 > score2) return "TEAM1";
  if (score2 > score1) return "TEAM2";
  return "DRAW";
}

function resultTo1X2(real: Choice): "1" | "X" | "2" {
  if (real === "TEAM1") return "1";
  if (real === "TEAM2") return "2";
  return "X";
}

function pointsForPick(real: Choice, pick: Choice): number {
  if (pick === real) return 3;

  // empate nunca dá negativo
  if (real === "DRAW") return 0;

  // oposto dá -1 (TEAM1 <-> TEAM2)
  const isOpposite =
    (real === "TEAM1" && pick === "TEAM2") || (real === "TEAM2" && pick === "TEAM1");

  return isOpposite ? -1 : 0;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const round = Number(url.searchParams.get("round") || "");

  if (!round || round < 1 || round > 38) {
    return NextResponse.json({ error: "round inválido" }, { status: 400 });
  }

  const [block] = await sql`
    select id, round
    from public.blocks
    where round = ${round}
    limit 1
  `;

  if (!block) {
    return NextResponse.json({ error: "rodada não encontrada" }, { status: 404 });
  }

  const players = (await sql`
    select id, name
    from public.players
    where active = true
    order by name asc
  `) as any[];

  const games = (await sql`
    select id, kickoff_at, team1, team2, score1, score2
    from public.games
    where block_id = ${block.id}
    order by kickoff_at asc, team1 asc, team2 asc
  `) as any[];

  // picks dessa rodada
  const picks = games.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${games.map((g) => g.id)})
      `) as any[])
    : [];

  const pickMap = new Map<string, string>();
  for (const p of picks) pickMap.set(`${p.game_id}|${p.player_id}`, p.encrypted_choice);

  // resultado real por jogo (se placar preenchido)
  const gameReal = new Map<string, Choice | null>();
  for (const g of games) {
    if (g.score1 === null || g.score2 === null) gameReal.set(g.id, null);
    else gameReal.set(g.id, resultFromScore(Number(g.score1), Number(g.score2)));
  }

  // Totais da rodada
  const totalsRound = players.map((pl) => ({
    playerId: pl.id,
    name: pl.name,
    totalRound: 0,
    // para você (admin) poder auditar depois, deixo por jogo também
    perGame: games.map((g) => ({
      gameId: g.id,
      pick: null as ("1" | "X" | "2" | null),
      pts: null as (number | null),
    })),
  }));
  const byPlayer = new Map<string, (typeof totalsRound)[number]>();
  for (const t of totalsRound) byPlayer.set(t.playerId, t);

  games.forEach((g, gi) => {
    const real = gameReal.get(g.id);
    for (const pl of players) {
      const t = byPlayer.get(pl.id)!;
      const enc = pickMap.get(`${g.id}|${pl.id}`);
      if (!enc) continue;

      let pick: Choice;
      try {
        pick = decryptChoice(enc) as Choice;
      } catch {
        continue;
      }

      const pick1x2: "1" | "X" | "2" =
        pick === "TEAM1" ? "1" : pick === "TEAM2" ? "2" : "X";

      t.perGame[gi].pick = pick1x2;

      if (!real) continue; // sem placar => sem pontos ainda

      const pts = pointsForPick(real, pick);
      t.perGame[gi].pts = pts;
      t.totalRound += pts;
    }
  });

  // Acumulado geral (considera TODOS os jogos com placar em qualquer rodada)
  const gamesScored = (await sql`
    select id, score1, score2
    from public.games
    where score1 is not null and score2 is not null
  `) as any[];

  const realAll = new Map<string, Choice>();
  for (const g of gamesScored) realAll.set(g.id, resultFromScore(Number(g.score1), Number(g.score2)));

  const picksAll = gamesScored.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${gamesScored.map((g) => g.id)})
      `) as any[])
    : [];

  const totalOverall = players.map((pl) => ({
    playerId: pl.id,
    name: pl.name,
    totalOverall: 0,
  }));
  const overallMap = new Map<string, (typeof totalOverall)[number]>();
  for (const t of totalOverall) overallMap.set(t.playerId, t);

  for (const p of picksAll) {
    const real = realAll.get(p.game_id);
    if (!real) continue;

    let pick: Choice;
    try {
      pick = decryptChoice(p.encrypted_choice) as Choice;
    } catch {
      continue;
    }

    overallMap.get(p.player_id)!.totalOverall += pointsForPick(real, pick);
  }

  // gabarito 1/X/2 por jogo (null se sem placar)
  const gabarito = games.map((g) => {
    const real = gameReal.get(g.id);
    return {
      gameId: g.id,
      gabarito: real ? resultTo1X2(real) : null,
    };
  });

  // ordenações úteis
  const totalsRoundSorted = [...totalsRound].sort(
    (a, b) => b.totalRound - a.totalRound || a.name.localeCompare(b.name)
  );
  const totalOverallSorted = [...totalOverall].sort(
    (a, b) => b.totalOverall - a.totalOverall || a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    round: block.round,
    games: games.map((g) => ({
      id: g.id,
      kickoff_at: g.kickoff_at,
      team1: g.team1,
      team2: g.team2,
      score1: g.score1,
      score2: g.score2,
    })),
    gabarito,
    totalsRound: totalsRoundSorted.map((t) => ({
      name: t.name,
      totalRound: t.totalRound,
    })),
    totalOverall: totalOverallSorted.map((t) => ({
      name: t.name,
      totalOverall: t.totalOverall,
    })),
  });
}
