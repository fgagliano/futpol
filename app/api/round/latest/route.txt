import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    // Maior rodada que tem pelo menos 1 jogo
    const rows = await sql`
      select coalesce(max(b.round), 1) as round
      from public.blocks b
      where exists (
        select 1
        from public.games g
        where g.block_id = b.id
      )
    `;

    const round = Number(rows?.[0]?.round ?? 1);

    return NextResponse.json({ round });
  } catch (e: any) {
    // fallback seguro
    return NextResponse.json({ round: 1, error: "failed" }, { status: 200 });
  }
}
