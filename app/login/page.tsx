"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/palpitar";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setMsg(j?.error || "Erro ao entrar");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setMsg("Falha de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-600">Escolha seu nome e informe sua senha.</p>

        <form
          onSubmit={onSubmit}
          className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        >
          <label className="block text-sm font-semibold text-slate-800">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="Ex: Tiago"
          />

          <label className="mt-4 block text-sm font-semibold text-slate-800">Senha</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="••••••••"
          />

          {msg && (
            <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">
              {msg}
            </div>
          )}

          <button
            disabled={loading}
            className={[
              "mt-4 w-full rounded-2xl px-4 py-2 text-sm font-bold shadow-sm",
              loading
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            ].join(" ")}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
