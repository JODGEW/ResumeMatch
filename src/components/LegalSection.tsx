import type { ReactNode } from 'react';

type LegalSectionProps = {
  id: string;
  num: string;
  title: string;
  children: ReactNode;
};

export function LegalSection({ id, num, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="legal-section">
      <div className="legal-section__head">
        <span className="legal-section__num">{num}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
