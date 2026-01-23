import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    round: number;
    scores: { gameId: string; score1: number | null; score2: number | null }[];
  };

  const round = Number(body.round);
  const scores = Array.isArray(body.scores) ? body.scores : [];

  if (!round || round < 1 || round > 38) {
    return NextResponse.json({ error: "round inválido" }, { status: 400 });
  }
  if (!scores.length) {
    return NextResponse.json({ error: "scores vazio" }, { status: 400 });
  }

  // Confere bloco da rodada
  const [block] = await sql`
    select id
    from public.blocks
    where round = ${round}
    limit 1
  `;
  if (!block) {
    return NextResponse.json({ error: "Bloco/rodada não encontrado" }, { status: 404 });
  }

  // Atualiza somente os jogos pertencentes ao bloco informado.
  // Aceita null (placar parcial / ainda não lançado).
  for (const s of scores) {
    const gameId = (s.gameId || "").trim();
    if (!gameId) continue;

    const score1 =
      s.score1 === null || s.score1 === undefined || Number.isNaN(Number(s.score1))
        ? null
        : Number(s.score1);
    const score2 =
      s.score2 === null || s.score2 === undefined || Number.isNaN(Number(s.score2))
        ? null
        : Number(s.score2);

    await sql`
      update public.games
      set score1 = ${score1}, score2 = ${score2}
      where id = ${gameId}
        and block_id = ${block.id}
    `;
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
