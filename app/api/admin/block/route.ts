import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
  id?: string | null;      // <-- AGORA ACEITA ID
  kickoff_at: string;      // ISO string
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

  // Se a rodada já existe (tem jogos), EXIGIMOS que venham 5 ids:
  const [cnt] = await sql`
    select count(*)::int as n
    from public.games
    where block_id = ${block.id}
  `;
  const existingCount = cnt?.n ?? 0;

  if (existingCount > 0) {
    const ids = games.map((g) => (g.id ?? "").trim()).filter(Boolean);
    if (ids.length !== 5) {
      return NextResponse.json(
        { error: "Rodada já existe. Para editar, envie os 5 IDs (não posso duplicar)." },
        { status: 400 }
      );
    }
  }

  // UPSERT POR ID (se veio id -> UPDATE; se não veio -> INSERT)
  for (const g of games) {
    const id = (g.id ?? "").trim();
    const kickoff = (g.kickoff_at ?? "").trim();
    const team1 = (g.team1 ?? "").trim();
    const team2 = (g.team2 ?? "").trim();

    if (!kickoff || !team1 || !team2) {
      return NextResponse.json({ error: "Jogo com campos vazios" }, { status: 400 });
    }

    if (id) {
      // UPDATE: NÃO troca id, NÃO apaga picks
      const updated = await sql`
        update public.games
           set kickoff_at = ${kickoff},
               team1 = ${team1},
               team2 = ${team2}
         where id = ${id}
           and block_id = ${block.id}
         returning id
      `;

      // Se por algum motivo esse id não pertence ao bloco, recusa (evita bagunça)
      if (!updated || updated.length === 0) {
        return NextResponse.json(
          { error: "ID inválido para esta rodada (block). Não salvei para evitar duplicação." },
          { status: 400 }
        );
      }
    } else {
      // INSERT: só acontece quando a rodada ainda não existia
      await sql`
        insert into public.games (block_id, kickoff_at, team1, team2)
        values (${block.id}, ${kickoff}, ${team1}, ${team2})
      `;
    }
  }

  return NextResponse.json({ ok: true, block });
}
