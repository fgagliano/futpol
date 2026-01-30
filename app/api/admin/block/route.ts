import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
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
    dataType: e?.dataType,
    schema: e?.schema,
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

    // valida payload antes de encostar no banco
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      const kickoff = g?.kickoff_at?.trim();
      const team1 = g?.team1?.trim();
      const team2 = g?.team2?.trim();

      if (!kickoff || !team1 || !team2) {
        return NextResponse.json(
          { error: `Jogo ${i + 1} com campos vazios` },
          { status: 400 }
        );
      }
    }

    // upsert do bloco pela round
    const [block] = await sql`
      insert into public.blocks (round)
      values (${round})
      on conflict (round) do update set round = excluded.round
      returning id, round
    `;

    // ATENÇÃO:
    // Esse delete pode falhar se existir FK de picks -> games sem ON DELETE CASCADE.
    // (E também é o que "apagava picks" quando você mexia na rodada 1.)
    await sql`delete from public.games where block_id = ${block.id}`;

    for (const g of games) {
      await sql`
        insert into public.games (block_id, kickoff_at, team1, team2)
        values (${block.id}, ${g.kickoff_at.trim()}, ${g.team1.trim()}, ${g.team2.trim()})
      `;
    }

    return NextResponse.json({ ok: true, block });
  } catch (e: any) {
    // Agora SEMPRE volta body com o erro real
    console.error("ERROR /api/admin/block:", e);
    return NextResponse.json(
      { error: "Falha interna ao salvar jogos", debug: errToObj(e) },
      { status: 500 }
    );
  }
}
