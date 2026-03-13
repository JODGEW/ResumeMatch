import './Badge.css';

interface Props {
  label: string;
  variant: 'success' | 'danger';
}

export function Badge({ label, variant }: Props) {
  return (
    <span className={`badge badge--${variant}`}>
      <span className="badge__dot" />
      {label}
    </span>
  );
}
