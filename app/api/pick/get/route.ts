import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decryptChoice } from "@/lib/crypto";

type Choice = "TEAM1" | "DRAW" | "TEAM2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playerId = (url.searchParams.get("playerId") || "").trim();

  if (!playerId) {
    return NextResponse.json({ error: "playerId é obrigatório" }, { status: 400 });
  }

  const rows = await sql`
    select game_id, encrypted_choice
    from public.picks
    where player_id = ${playerId}
  `;

  const picks: Record<string, Choice> = {};
  for (const r of rows as any[]) {
    try {
      picks[r.game_id] = decryptChoice(r.encrypted_choice) as Choice;
    } catch {
      // ignora erro de decrypt
    }
  }

  const res = NextResponse.json({ picks });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
