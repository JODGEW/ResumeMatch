type LogoMarkProps = {
  width?: number;
  height?: number;
  className?: string;
};

export function LogoMark({ width = 28, height = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="var(--accent)" strokeWidth="2" />
      <path d="M8 9h12M8 14h8M8 19h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
