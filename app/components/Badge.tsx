interface Props {
  color?: string;
  children: React.ReactNode;
}

export default function Badge({ color, children }: Props) {
  const c = color || "#64748b";
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: c + "20", color: c }}
    >
      {children}
    </span>
  );
}
