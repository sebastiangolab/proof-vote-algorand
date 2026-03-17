type SectionLabelProps = { children: React.ReactNode };

function SectionLabel({ children }: SectionLabelProps) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{children}</p>;
}

export default SectionLabel;
