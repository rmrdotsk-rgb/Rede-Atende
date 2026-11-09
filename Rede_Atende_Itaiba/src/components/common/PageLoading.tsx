export function PageLoading() {
  return (
    <section
      role="status"
      aria-busy="true"
      className="min-h-[100svh] flex items-center justify-center text-sm text-slate-600"
    >
      Carregando página...
    </section>
  );
}
