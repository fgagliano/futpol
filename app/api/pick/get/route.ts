import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const playerId = cookies().get("fp_player")?.value || "";
  if (!playerId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const rows = (await sql`
    select p.game_id, p.encrypted_choice
    from public.picks p
    where p.player_id = ${playerId}
  `) as any[];

  const picks: Record<string, Choice> = {};
  for (const r of rows) {
    try {
      picks[r.game_id] = decryptChoice(r.encrypted_choice) as Choice;
    } catch {
      // ignora se corrompido
    }
  }

  return NextResponse.json({ ok: true, picks });
}
