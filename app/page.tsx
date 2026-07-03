import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">StealthAPI</h1>
      <p className="max-w-md text-black/60 dark:text-white/60">
        Receivables verification infrastructure for trade finance lenders — connect a borrower&apos;s
        accounting system, get real-time AR aging and authenticity-scored invoices.
      </p>
      <Link href="/dashboard" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
        Go to dashboard
      </Link>
    </main>
  );
}
