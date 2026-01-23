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

  // jogos com placar preenchido (só esses contam no ranking)
  const games = (await sql`
    select id, team1, team2, score1, score2
    from public.games
    where score1 is not null and score2 is not null
  `) as any[];

  const gameResult = new Map<string, Choice>();
  for (const g of games) {
    gameResult.set(g.id, resultFromScore(Number(g.score1), Number(g.score2)));
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
    const real = gameResult.get(p.game_id);
    if (!real) continue;

    let pick: Choice;
    try {
      pick = decryptChoice(p.encrypted_choice) as Choice;
    } catch {
      continue;
    }

    const pts = pointsForPick(real, pick);
    byId.get(p.player_id)!.total += pts;
  }

  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return NextResponse.json({ ranking: totals });
}
