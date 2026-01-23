import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { encryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    playerId: string;
    gameId: string;
    choice: Choice;
  };

  const playerId = (body.playerId || "").trim();
  const gameId = (body.gameId || "").trim();
  const choice = body.choice;

  if (!playerId || !gameId) {
    return NextResponse.json({ error: "playerId e gameId são obrigatórios" }, { status: 400 });
  }
  if (choice !== "TEAM1" && choice !== "DRAW" && choice !== "TEAM2") {
    return NextResponse.json({ error: "choice inválido" }, { status: 400 });
  }

  const [g] = await sql`
    select id, kickoff_at
    from public.games
    where id = ${gameId}
    limit 1
  `;
  if (!g) {
    return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  }

  // Bloqueia edição após kickoff do PRIMEIRO jogo do bloco (regra do bloco)
  const [bmin] = await sql`
    select min(g2.kickoff_at) as kickoff_min
    from public.games g2
    join public.blocks b on b.id = g2.block_id
    join public.games g1 on g1.id = ${gameId} and g1.block_id = b.id
  `;
  const kickoffMin: string | null = bmin?.kickoff_min ?? null;
  if (kickoffMin && new Date() >= new Date(kickoffMin)) {
    return NextResponse.json({ error: "Palpites travados (kickoff do bloco já iniciou)" }, { status: 403 });
  }

  const encrypted = encryptChoice(choice);

  await sql`
    insert into public.picks (player_id, game_id, encrypted_choice)
    values (${playerId}, ${gameId}, ${encrypted})
    on conflict (player_id, game_id)
    do update set encrypted_choice = excluded.encrypted_choice, updated_at = now()
  `;

  return NextResponse.json({ ok: true });
}
