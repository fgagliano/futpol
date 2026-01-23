import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "").trim();

  if (!name || !password) {
    return NextResponse.json({ ok: false, error: "Informe nome e senha" }, { status: 400 });
  }

  const [player] = await sql`
    select id, name, password_hash
    from public.players
    where lower(name) = lower(${name})
      and active = true
    limit 1
  `;

  if (!player) {
    return NextResponse.json({ ok: false, error: "Jogador não encontrado" }, { status: 401 });
  }

  const passHash = sha256(password);

  // 1º acesso: define senha
  if (!player.password_hash) {
    await sql`
      update public.players
      set password_hash = ${passHash}
      where id = ${player.id}
    `;

    cookies().set("fp_player", player.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ ok: true, mode: "created" });
  }

  // acessos seguintes: valida senha
  if (player.password_hash !== passHash) {
    return NextResponse.json({ ok: false, error: "Senha incorreta" }, { status: 401 });
  }

  cookies().set("fp_player", player.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, mode: "login" });
}
