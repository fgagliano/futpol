import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";
type OneXTwo = "1" | "X" | "2";

function resultFromScore(score1: number, score2: number): Choice {
  if (score1 > score2) return "TEAM1";
  if (score2 > score1) return "TEAM2";
  return "DRAW";
}

function to1X2(c: Choice): OneXTwo {
  if (c === "TEAM1") return "1";
  if (c === "TEAM2") return "2";
  return "X";
}

function pointsForPick(real: Choice, pick: Choice): number {
  if (pick === real) return 3;

  // empate nunca dá negativo
  if (real === "DRAW") return 0;

  // oposto (1<->2) dá -1
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

  // picks da rodada
  const picksRound = games.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${games.map((g) => g.id)})
      `) as any[])
    : [];

  const pickMap = new Map<string, string>();
  for (const p of picksRound) pickMap.set(`${p.game_id}|${p.player_id}`, p.encrypted_choice);

  // resultado real e gabarito por jogo (se placar existe)
  const realByGame = new Map<string, Choice | null>();
  const gabaritoByGame = new Map<string, OneXTwo | null>();

  for (const g of games) {
    if (g.score1 === null || g.score2 === null) {
      realByGame.set(g.id, null);
      gabaritoByGame.set(g.id, null);
    } else {
      const real = resultFromScore(Number(g.score1), Number(g.score2));
      realByGame.set(g.id, real);
      gabaritoByGame.set(g.id, to1X2(real));
    }
  }

  // grid: [playerIndex][gameIndex] => pick + points
  const grid = players.map((pl) =>
    games.map((g) => {
      const enc = pickMap.get(`${g.id}|${pl.id}`);
      if (!enc) {
        return { pick: null as OneXTwo | null, points: null as number | null };
      }

      let pickChoice: Choice;
      try {
        pickChoice = decryptChoice(enc) as Choice;
      } catch {
        return { pick: null, points: null };
      }

      const pick1x2 = to1X2(pickChoice);
      const real = realByGame.get(g.id);

      if (!real) {
        // sem placar ainda: mostra palpite, mas pontos ficam null
        return { pick: pick1x2, points: null };
      }

      return { pick: pick1x2, points: pointsForPick(real, pickChoice) };
    })
  );

  // total da rodada por player (somando só jogos com points != null)
  const totalsRound = players.map((pl, pi) => {
    const total = grid[pi].reduce((acc, cell) => acc + (cell.points ?? 0), 0);
    return { playerId: pl.id, name: pl.name, totalRound: total };
  });

  // acumulado geral (todos os jogos com placar, todas as rodadas)
  const gamesScoredAll = (await sql`
    select id, score1, score2
    from public.games
    where score1 is not null and score2 is not null
  `) as any[];

  const realAll = new Map<string, Choice>();
  for (const g of gamesScoredAll) {
    realAll.set(g.id, resultFromScore(Number(g.score1), Number(g.score2)));
  }

  const picksAll = gamesScoredAll.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${gamesScoredAll.map((g) => g.id)})
      `) as any[])
    : [];

  const overall = players.map((pl) => ({ playerId: pl.id, name: pl.name, totalOverall: 0 }));
  const overallMap = new Map<string, (typeof overall)[number]>();
  for (const t of overall) overallMap.set(t.playerId, t);

  for (const p of picksAll) {
    const real = realAll.get(p.game_id);
    if (!real) continue;

    let pickChoice: Choice;
    try {
      pickChoice = decryptChoice(p.encrypted_choice) as Choice;
    } catch {
      continue;
    }

    overallMap.get(p.player_id)!.totalOverall += pointsForPick(real, pickChoice);
  }

  // ordenações para exibição (ranking)
  const totalsRoundSorted = [...totalsRound].sort(
    (a, b) => b.totalRound - a.totalRound || a.name.localeCompare(b.name)
  );

  const overallSorted = [...overall].sort(
    (a, b) => b.totalOverall - a.totalOverall || a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    round: block.round,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    games: games.map((g) => ({
      id: g.id,
      kickoff_at: g.kickoff_at,
      team1: g.team1,
      team2: g.team2,
      score1: g.score1,
      score2: g.score2,
      gabarito: gabaritoByGame.get(g.id) ?? null,
    })),
    grid, // [player][game] => { pick: "1"|"X"|"2"|null, points: -1|0|3|null }
    totalsRound: totalsRoundSorted,
    overall: overallSorted,
  });
}
