import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

export async function GET() {
  // bloco atual = maior rodada
  const [block] = await sql`
    select id, round
    from public.blocks
    order by round desc
    limit 1
  `;

  if (!block) {
    return NextResponse.json({
      block: null,
      players: [],
      games: [],
      isRevealed: false,
      grid: [],
    });
  }

  const players = await sql`
    select id, name
    from public.players
    where active = true
    order by name asc
  `;

  const games = await sql`
    select id, kickoff_at, team1, team2, score1, score2
    from public.games
    where block_id = ${block.id}
    order by kickoff_at asc, team1 asc, team2 asc
  `;

  const [minKickoff] = await sql`
    select min(kickoff_at) as kickoff_min
    from public.games
    where block_id = ${block.id}
  `;

  const kickoffMin: string | null = minKickoff?.kickoff_min ?? null;
  const now = new Date();
  const isRevealed = kickoffMin ? now >= new Date(kickoffMin) : false;

  const picks = games.length
    ? await sql`
        select game_id, player_id, encrypted_choice
        from public.picks
        where game_id = any(${games.map((g: any) => g.id)})
      `
    : [];

  const pickMap = new Map<string, string>();
  for (const p of picks as any[]) {
    pickMap.set(`${p.game_id}|${p.player_id}`, p.encrypted_choice);
  }

  const grid = games.map((g: any) =>
    players.map((pl: any) => {
      const enc = pickMap.get(`${g.id}|${pl.id}`);
      if (!enc) return { status: "MISSING", text: null };

      if (!isRevealed) return { status: "SENT", text: null };

      let choice: Choice;
      try {
        choice = decryptChoice(enc) as Choice;
      } catch {
        return { status: "SENT", text: "ERRO" };
      }

      const text =
        choice === "TEAM1"
          ? g.team1
          : choice === "TEAM2"
          ? g.team2
          : "Empate";

      return { status: "REVEALED", text };
    })
  );

  return NextResponse.json({
    block: { id: block.id, round: block.round, kickoffMin },
    players,
    games,
    isRevealed,
    grid,
  });
}
