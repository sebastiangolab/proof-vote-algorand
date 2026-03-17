type StatCardProps = { label: string; value: string; sub: string }

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

export default StatCard;
