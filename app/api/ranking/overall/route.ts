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
  if (real === "DRAW") return 0;
  const isOpposite =
    (real === "TEAM1" && pick === "TEAM2") || (real === "TEAM2" && pick === "TEAM1");
  return isOpposite ? -1 : 0;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const players = (await sql`
    select id, name
    from public.players
    where active = true
    order by name asc
  `) as any[];

  // jogos com placar preenchido + o número da rodada
  const games = (await sql`
    select g.id, g.team1, g.team2, g.score1, g.score2, b.round
    from public.games g
    join public.blocks b on g.block_id = b.id
    where g.score1 is not null and g.score2 is not null
  `) as any[];

  const gameDataMap = new Map<string, { real: Choice, round: number }>();
  for (const g of games) {
    gameDataMap.set(g.id, {
      real: resultFromScore(Number(g.score1), Number(g.score2)),
      round: Number(g.round)
    });
  }

  const picks = games.length
    ? ((await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${games.map((g) => g.id)})
      `) as any[])
    : [];

  const totals = players.map((p) => ({ playerId: p.id, name: p.name, total: 0 }));
  const byId = new Map<string, (typeof totals)[number]>();
  for (const t of totals) byId.set(t.playerId, t);

  for (const p of picks) {
    const gameData = gameDataMap.get(p.game_id);
    if (!gameData) continue;
    
    const { real, round } = gameData;

    let pick: Choice;
    try {
      pick = decryptChoice(p.encrypted_choice) as Choice;
    } catch {
      continue;
    }

    let pts = pointsForPick(real, pick);
    
    // Regra: Pontos a dobrar nas rodadas 34 a 38
    if (round >= 34 && round <= 38) {
      pts = pts * 2;
    }

    byId.get(p.player_id)!.total += pts;
  }

  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return NextResponse.json({ ranking: totals });
}
