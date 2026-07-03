"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Invalid API key");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-8 dark:border-white/15">
        <div>
          <h1 className="text-lg font-semibold">StealthAPI</h1>
          <p className="text-sm text-black/60 dark:text-white/60">Sign in with your lender API key</p>
        </div>

        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk_live_..."
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          autoFocus
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !apiKey}
          className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-xs text-black/50 dark:text-white/50">
          Don&apos;t have a key? Run <code>npx tsx prisma/seed.ts &quot;Your Company&quot;</code> to create one.
        </p>
      </form>
    </main>
  );
}
