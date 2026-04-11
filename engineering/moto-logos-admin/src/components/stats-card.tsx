interface StatsCardProps {
  label: string;
  value: number | string;
  accent?: boolean;
}

export function StatsCard({ label, value, accent }: StatsCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-sm text-text-secondary mb-1">{label}</p>
      <p className={`text-3xl font-bold font-[family-name:var(--font-inter)] ${accent ? 'text-accent' : 'text-foreground'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
