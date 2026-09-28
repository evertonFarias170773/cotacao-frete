import type { Metadata } from "next";
import { safeNextPath } from "@/lib/safeNextPath";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar · Cotador de Fretes" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ para?: string | string[] }> }) {
  const { para } = await searchParams;
  const next = safeNextPath(Array.isArray(para) ? para[0] : para);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <LoginForm next={next} />
    </main>
  );
}
