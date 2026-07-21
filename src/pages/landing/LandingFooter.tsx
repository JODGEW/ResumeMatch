import { Link, useLocation } from 'react-router-dom';
import { LogoMark } from '../../components/LogoMark';
import { siteConfig } from '../../config/site';

type LandingFooterProps = {
  appHref: string;
  /* Legal pages use the bundle's 1120px container instead of the landing 1200px */
  narrow?: boolean;
};

export function LandingFooter({ appHref, narrow }: LandingFooterProps) {
  const year = new Date().getFullYear();
  const { pathname } = useLocation();
  const currentClass = (path: string) => (pathname === path ? 'is-current' : undefined);

  return (
    <footer className="landing-footer">
      <div className={`landing-footer__inner${narrow ? ' landing-footer__inner--narrow' : ''}`}>
        <div className="landing-footer__brand">
          <div className="landing-footer__logo">
            <LogoMark />
            <span>{siteConfig.name}</span>
          </div>
          <p className="landing-footer__tagline">{siteConfig.tagline}</p>
          <p className="landing-footer__support">
            Questions? <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          </p>
          <p className="landing-footer__trust">No data sold. No model training on your content.</p>
        </div>
        <div className="landing-footer__side">
          <nav className="landing-footer__links" aria-label="Footer">
            <Link to={appHref}>Analyze My Resume</Link>
            <Link to="/privacy" className={currentClass('/privacy')}>
              Privacy
            </Link>
            <Link to="/terms" className={currentClass('/terms')}>
              Terms
            </Link>
          </nav>
          <div className="landing-footer__meta">
            © {year} {siteConfig.name}
          </div>
        </div>
      </div>
    </footer>
  );
}
