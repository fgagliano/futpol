import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql<
      { last_round: number | null }[]
    >`
      select max(b.round)::int as last_round
      from public.blocks b
      where exists (
        select 1
        from public.games g
        where g.block_id = b.id
      )
    `;

    const last = rows?.[0]?.last_round ?? null;

    return NextResponse.json({ lastRound: last ?? 1 });
  } catch (e) {
    // se der problema, não quebra a tela: volta pro padrão 1
    return NextResponse.json({ lastRound: 1 });
  }
}
