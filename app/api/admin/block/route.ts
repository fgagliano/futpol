import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
  id?: string | null;
  kickoff_at: string; // ISO string
  team1: string;
  team2: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as { round: number; games: GameInput[] };
  const round = body?.round;
  const games = body?.games;

  if (!round || !Number.isInteger(round) || round < 1 || round > 38) {
    return NextResponse.json({ error: "round inválida (1..38)" }, { status: 400 });
  }

  if (!Array.isArray(games) || games.length !== 5) {
    return NextResponse.json({ error: "Informe exatamente 5 jogos" }, { status: 400 });
  }

  // garante o bloco
  const [block] = await sql`
    insert into public.blocks (round)
    values (${round})
    on conflict (round) do update set round = excluded.round
    returning id, round
  `;

  // valida campos
  for (const g of games) {
    const kickoff = g.kickoff_at?.trim();
    const team1 = g.team1?.trim();
    const team2 = g.team2?.trim();
    if (!kickoff || !team1 || !team2) {
      return NextResponse.json({ error: "Jogo com campos vazios" }, { status: 400 });
    }
  }

  // atualiza/insere sem apagar nada
  const savedIds: string[] = [];

  for (const g of games) {
    const id = (g.id ?? null) as string | null;
    const kickoff = g.kickoff_at.trim();
    const team1 = g.team1.trim();
    const team2 = g.team2.trim();

    if (id) {
      // update do jogo existente (e garante que pertence ao bloco)
      const res = await sql`
        update public.games
           set kickoff_at = ${kickoff},
               team1 = ${team1},
               team2 = ${team2}
         where id = ${id}
           and block_id = ${block.id}
        returning id
      `;

      if (res.length === 0) {
        return NextResponse.json(
          { error: `game id inválido para esta rodada: ${id}` },
          { status: 400 }
        );
      }

      savedIds.push(res[0].id);
    } else {
      // insert novo (só se não tiver id)
      const [ins] = await sql`
        insert into public.games (block_id, kickoff_at, team1, team2)
        values (${block.id}, ${kickoff}, ${team1}, ${team2})
        returning id
      `;
      savedIds.push(ins.id);
    }
  }

  return NextResponse.json({ ok: true, block, savedIds });
}
