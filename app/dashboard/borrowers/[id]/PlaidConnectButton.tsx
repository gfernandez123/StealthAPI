"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

export function PlaidConnectButton({ borrowerId, connected }: { borrowerId: string; connected: boolean }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    if (connected) return;
    fetch("/api/connect/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrowerId }),
    })
      .then((res) => res.json())
      .then((data) => setLinkToken(data.linkToken ?? null))
      .catch(() => setLinkToken(null));
  }, [borrowerId, connected]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setExchanging(true);
      await fetch("/api/connect/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrowerId, publicToken }),
      });
      router.refresh();
      setExchanging(false);
    },
    [borrowerId, router],
  );

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  if (connected) {
    return <span className="text-sm text-black/50 dark:text-white/50">Bank account connected</span>;
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || exchanging}
      className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20"
    >
      {exchanging ? "Connecting..." : "Connect bank account (Plaid)"}
    </button>
  );
}
