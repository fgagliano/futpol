import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const playerId = cookies().get("fp_player")?.value || "";

  if (!playerId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const [player] = await sql`
    select id, name
    from public.players
    where id = ${playerId}
    limit 1
  `;

  if (!player) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, player: { id: player.id, name: player.name } });
}
