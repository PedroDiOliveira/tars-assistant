import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 bg-background px-6 py-10 text-center md:border-x">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
          <p className="text-muted-foreground">Este endereço não existe no Tars.</p>
        </div>
        <Link href="/inicio" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
          Ir para o início
        </Link>
      </main>
    </div>
  );
}
