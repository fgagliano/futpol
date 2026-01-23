import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

function resultFromScore(score1: number, score2: number): Choice {
  if (score1 > score2) return "TEAM1";
  if (score2 > score1) return "TEAM2";
  return "DRAW";
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

  // picks do bloco
  const picks = games.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${games.map((g) => g.id)})
      `) as any[])
    : [];

  const pickMap = new Map<string, string>();
  for (const p of picks) pickMap.set(`${p.game_id}|${p.player_id}`, p.encrypted_choice);

  // monta resultado por jogo (se placar preenchido)
  const gameResults = new Map<string, Choice | null>();
  for (const g of games) {
    if (g.score1 === null || g.score2 === null) {
      gameResults.set(g.id, null);
    } else {
      gameResults.set(g.id, resultFromScore(Number(g.score1), Number(g.score2)));
    }
  }

  // pontos por player + detalhes por jogo
  const totals = players.map((pl) => ({
    playerId: pl.id,
    name: pl.name,
    total: 0,
    perGame: games.map((g) => ({
      gameId: g.id,
      points: null as number | null, // null quando não tem placar OU não palpitou
      pickText: null as string | null, // só pra debug/admin (opcional)
    })),
  }));

  const byPlayer = new Map<string, (typeof totals)[number]>();
  for (const t of totals) byPlayer.set(t.playerId, t);

  games.forEach((g, gi) => {
    const real = gameResults.get(g.id) ?? null;

    for (const pl of players) {
      const t = byPlayer.get(pl.id)!;
      const enc = pickMap.get(`${g.id}|${pl.id}`);

      if (!enc) {
        // não palpitou
        t.perGame[gi].points = null;
        continue;
      }

      let pick: Choice | null = null;
      try {
        pick = decryptChoice(enc) as Choice;
      } catch {
        pick = null;
      }

      if (!real || !pick) {
        // sem placar ainda OU erro decrypt
        t.perGame[gi].points = null;
        continue;
      }

      const pts = pointsForPick(real, pick);
      t.perGame[gi].points = pts;
      t.total += pts;

      // opcional: texto do palpite (admin)
      t.perGame[gi].pickText =
        pick === "TEAM1" ? g.team1 : pick === "TEAM2" ? g.team2 : "Empate";
    }
  });

  // ordena ranking
  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return NextResponse.json({
    round: block.round,
    players: totals.map((t) => ({ name: t.name, total: t.total })),
    details: totals, // inclui perGame com points (e pickText opcional)
    games: games.map((g) => ({
      id: g.id,
      kickoff_at: g.kickoff_at,
      team1: g.team1,
      team2: g.team2,
      score1: g.score1,
      score2: g.score2,
      result: gameResults.get(g.id),
    })),
  });
}
