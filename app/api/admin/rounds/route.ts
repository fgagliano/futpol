import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const rows = await sql`
    select round
    from public.blocks
    order by round asc
  `;

  return NextResponse.json({
    rounds: (rows as any[]).map((r) => Number(r.round)),
  });
}
