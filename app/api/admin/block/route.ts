import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
  kickoff_at: string; // ISO string
  team1: string;
  team2: string;
};

export async function POST(req: Request) {
  const { round, games } = (await req.json()) as {
    round: number;
    games: GameInput[];
  };

  if (!round || !Number.isInteger(round) || round < 1 || round > 38) {
    return NextResponse.json({ error: "round inválida (1..38)" }, { status: 400 });
  }

  if (!Array.isArray(games) || games.length !== 5) {
    return NextResponse.json({ error: "Informe exatamente 5 jogos" }, { status: 400 });
  }

  // upsert do bloco pela round
  const [block] = await sql`
    insert into public.blocks (round)
    values (${round})
    on conflict (round) do update set round = excluded.round
    returning id, round
  `;

  // regrava jogos do bloco (simples e robusto)
  await sql`delete from public.games where block_id = ${block.id}`;

  for (const g of games) {
    const kickoff = g.kickoff_at?.trim();
    const team1 = g.team1?.trim();
    const team2 = g.team2?.trim();

    if (!kickoff || !team1 || !team2) {
      return NextResponse.json({ error: "Jogo com campos vazios" }, { status: 400 });
    }

    await sql`
      insert into public.games (block_id, kickoff_at, team1, team2)
      values (${block.id}, ${kickoff}, ${team1}, ${team2})
    `;
  }

  return NextResponse.json({ ok: true, block });
}
