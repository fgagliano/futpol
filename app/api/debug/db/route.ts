import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const [info] = await sql`
    select
      current_database() as db,
      current_user as user,
      inet_server_addr()::text as server_addr
  `;

  const [counts] = await sql`
    select
      (select count(*) from public.players) as players,
      (select count(*) from public.blocks) as blocks,
      (select count(*) from public.games) as games,
      (select count(*) from public.picks) as picks
  `;

  return NextResponse.json({ info, counts });
}
