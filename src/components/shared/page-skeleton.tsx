/** Esqueleto mostrado enquanto os dados locais carregam (estado de carregamento). */
export function PageSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/70" />
      ))}
    </div>
  );
}
