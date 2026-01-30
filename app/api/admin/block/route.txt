import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type GameInput = {
  id?: string;        // <- NOVO: se vier, fazemos UPDATE (preserva picks)
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

  // validação básica
  for (const g of games) {
    const kickoff = g.kickoff_at?.trim();
    const team1 = g.team1?.trim();
    const team2 = g.team2?.trim();
    if (!kickoff || !team1 || !team2) {
      return NextResponse.json({ error: "Jogo com campos vazios" }, { status: 400 });
    }
  }

  // transação pra evitar estado parcial
  await sql`begin`;

  try {
    // upsert do bloco pela round
    const [block] = await sql`
      insert into public.blocks (round)
      values (${round})
      on conflict (round) do update set round = excluded.round
      returning id, round
    `;

    // pega jogos atuais do bloco (pra sabermos o que existe)
    const existing = await sql`
      select id
      from public.games
      where block_id = ${block.id}
    `;
    const existingIds = new Set<string>((existing as any[]).map((x) => x.id));

    // garante que não vem ID duplicado no payload
    const seen = new Set<string>();
    for (const g of games) {
      if (g.id) {
        if (seen.has(g.id)) {
          await sql`rollback`;
          return NextResponse.json({ error: "Payload inválido: id duplicado" }, { status: 400 });
        }
        seen.add(g.id);
      }
    }

    // 1) Atualiza por ID quando existir
    // 2) Insere novo jogo quando não tiver ID (rodada nova ou slot novo)
    const keptIds: string[] = [];

    for (const g of games) {
      const kickoff = g.kickoff_at.trim();
      const team1 = g.team1.trim();
      const team2 = g.team2.trim();

      if (g.id && existingIds.has(g.id)) {
        const [upd] = await sql`
          update public.games
          set kickoff_at = ${kickoff},
              team1 = ${team1},
              team2 = ${team2}
          where id = ${g.id} and block_id = ${block.id}
          returning id
        `;
        keptIds.push(upd.id);
      } else {
        // novo registro (não apaga nada antigo)
        const [ins] = await sql`
          insert into public.games (block_id, kickoff_at, team1, team2)
          values (${block.id}, ${kickoff}, ${team1}, ${team2})
          returning id
        `;
        keptIds.push(ins.id);
      }
    }

    // 🔒 opcional “seguro”:
    // remove jogos “sobrando” DO BLOCO apenas se eles NÃO têm picks.
    // (assim você nunca perde palpites por acidente)
    await sql`
      delete from public.games g
      where g.block_id = ${block.id}
        and g.id <> all(${keptIds})
        and not exists (
          select 1 from public.picks p where p.game_id = g.id
        )
    `;

    await sql`commit`;
    return NextResponse.json({ ok: true, blockId: block.id, round: block.round, gameIds: keptIds });
  } catch (e: any) {
    await sql`rollback`;
    return NextResponse.json(
      { error: e?.message ? `Erro: ${e.message}` : "Erro ao salvar jogos" },
      { status: 500 }
    );
  }
}
