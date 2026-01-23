import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { encryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const playerId = cookies().get("fp_player")?.value || "";
  if (!playerId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const gameId = String(body?.gameId || "");
  const choice = body?.choice as Choice;

  if (!gameId || !choice || !["TEAM1", "DRAW", "TEAM2"].includes(choice)) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // trava se bloco já revelou (kickoff do primeiro jogo)
  const [row] = await sql`
    select b.id as block_id, min(g2.kickoff_at) as kickoff_min
    from public.games g
    join public.blocks b on b.id = g.block_id
    join public.games g2 on g2.block_id = b.id
    where g.id = ${gameId}
    group by b.id
    limit 1
  `;

  const kickoffMin = row?.kickoff_min ? new Date(row.kickoff_min) : null;
  const isRevealed = kickoffMin ? new Date() >= kickoffMin : false;

  if (isRevealed) {
    return NextResponse.json(
      { error: "Palpites travados (kickoff do bloco já iniciou)." },
      { status: 403 }
    );
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
