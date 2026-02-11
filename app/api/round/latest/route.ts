import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rows = await sql`
      select coalesce(max(b.round), 1) as round
      from public.blocks b
      where exists (
        select 1
        from public.games g
        where g.block_id = b.id
      )
    `;

    const round = Number(rows?.[0]?.round ?? 1) || 1;

    const res = NextResponse.json({ round });
    // reforço extra contra cache intermediário (CDN/edge)
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  } catch (e: any) {
    const res = NextResponse.json({ round: 1, error: "failed" }, { status: 200 });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }
}