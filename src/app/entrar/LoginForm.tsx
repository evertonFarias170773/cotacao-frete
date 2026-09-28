"use client";

import { Loader2, Lock } from "lucide-react";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.assign(next);
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Não foi possível entrar. Tente novamente.");
    } catch {
      setError("Sem conexão. Verifique a internet e tente novamente.");
    }
    setSending(false);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6" noValidate>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg">
          <Lock className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-xl font-bold tracking-tight">Cotador de Fretes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Acesso restrito à equipe.</p>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Senha
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "password-error" : undefined}
          className={`field ${error ? "field-error" : ""}`}
        />
        {error && (
          <p id="password-error" role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={sending || !password}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        Entrar
      </button>
    </form>
  );
}
