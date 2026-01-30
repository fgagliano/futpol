import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
  id?: string | null;
  kickoff_at: string; // ISO string
  team1: string;
  team2: string;
};

function errToObj(e: any) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    detail: e?.detail,
    hint: e?.hint,
    constraint: e?.constraint,
    table: e?.table,
    column: e?.column,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { round: number; games: GameInput[] };
    const round = body?.round;
    const games = body?.games;

    if (!round || !Number.isInteger(round) || round < 1 || round > 38) {
      return NextResponse.json({ error: "round inválida (1..38)" }, { status: 400 });
    }
    if (!Array.isArray(games) || games.length !== 5) {
      return NextResponse.json({ error: "Informe exatamente 5 jogos" }, { status: 400 });
    }

    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g?.kickoff_at?.trim() || !g?.team1?.trim() || !g?.team2?.trim()) {
        return NextResponse.json({ error: `Jogo ${i + 1} com campos vazios` }, { status: 400 });
      }
    }

    // bloco da rodada
    const [block] = await sql`
      insert into public.blocks (round)
      values (${round})
      on conflict (round) do update set round = excluded.round
      returning id, round
    `;

    const savedIds: string[] = [];

    // 1) update nos jogos que vieram com id (mantém picks!)
    for (const g of games) {
      const id = g.id?.trim();
      if (!id) continue;

      const [row] = await sql`
        update public.games
        set kickoff_at = ${g.kickoff_at.trim()},
            team1 = ${g.team1.trim()},
            team2 = ${g.team2.trim()}
        where id = ${id} and block_id = ${block.id}
        returning id
      `;

      if (row?.id) savedIds.push(row.id);
    }

    // 2) insert dos que não têm id (rodada nova ou slot novo)
    for (const g of games) {
      const id = g.id?.trim();
      if (id) continue;

      const [row] = await sql`
        insert into public.games (block_id, kickoff_at, team1, team2)
        values (${block.id}, ${g.kickoff_at.trim()}, ${g.team1.trim()}, ${g.team2.trim()})
        returning id
      `;
      if (row?.id) savedIds.push(row.id);
    }

    // 3) NÃO deletamos nada. (Se quiser “apagar jogo removido”, aí é outra ação explícita)
    return NextResponse.json({ ok: true, block, savedGameIds: savedIds });
  } catch (e: any) {
    console.error("ERROR /api/admin/block:", e);
    return NextResponse.json(
      { error: "Falha interna ao salvar jogos", debug: errToObj(e) },
      { status: 500 }
    );
  }
}
