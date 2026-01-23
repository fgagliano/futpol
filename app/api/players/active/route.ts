import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const players = await sql`
    select id, name
    from public.players
    where active = true
    order by name asc
  `;

  return NextResponse.json({ ok: true, players });
}
