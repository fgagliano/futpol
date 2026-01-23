"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Player = { id: string; name: string };

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/players/active", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && j?.ok) {
          setPlayers(j.players || []);
        }
      } catch {
        // silencioso
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setMsgKind(null);

    if (!name) {
      setMsg("Selecione seu nome.");
      setMsgKind("err");
      setLoading(false);
      return;
    }

    if (!password || password.trim().length < 3) {
      setMsg("Informe uma senha (mínimo 3 caracteres).");
      setMsgKind("err");
      setLoading(false);
      return;
    }

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || "Erro ao entrar");
        setMsgKind("err");
        return;
      }

      if (j?.mode === "created") {
        setMsg("✅ Senha criada com sucesso! Entrando...");
      } else {
        setMsg("✅ Login OK! Entrando...");
      }
      setMsgKind("ok");

      setTimeout(() => {
        router.push(nextPath);
        router.refresh();
      }, 300);
    } catch {
      setMsg("Falha de rede");
      setMsgKind("err");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-600">
          No primeiro acesso, você cria sua senha. Depois, é só entrar.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        >
          <label className="block text-sm font-semibold text-slate-800">
            Nome
          </label>

          <select
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMsg(null);
              setMsgKind(null);
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Selecione…</option>
            {players.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-semibold text-slate-800">
            Senha
          </label>
          <input
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMsg(null);
              setMsgKind(null);
            }}
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {msg && (
            <div
              className={[
                "mt-3 rounded-xl px-3 py-2 text-sm ring-1",
                msgKind === "ok"
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                  : "bg-rose-50 text-rose-700 ring-rose-100",
              ].join(" ")}
            >
              {msg}
            </div>
          )}

          <button
            disabled={loading}
            className={[
              "mt-4 w-full rounded-2xl px-4 py-2 text-sm font-bold shadow-sm transition",
              loading
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            ].join(" ")}
          >
            {loading ? "Processando..." : "Entrar"}
          </button>

          <div className="mt-3 text-xs text-slate-500">
            Se for seu primeiro acesso, essa senha será registrada no sistema.
          </div>
        </form>
      </div>
    </main>
  );
}
