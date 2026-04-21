import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { siteConfig } from '../config/site';
import './PublicFooter.css';

export function PublicFooter() {
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const appHref = user ? '/upload' : '/login';

  return (
    <footer className="public-footer">
      <div className="page-container public-footer__inner">
        <div className="public-footer__brand">
          <p className="public-footer__title">{siteConfig.name}</p>
          <p className="public-footer__tagline">{siteConfig.tagline}</p>
          <p className="public-footer__support">
            Questions?{' '}
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          </p>
          <p className="public-footer__trust">No data sold. No model training on your content.</p>
        </div>

        <nav className="public-footer__links" aria-label="Legal">
          <Link to={appHref} className="public-footer__cta">Analyze My Resume</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>

        <p className="public-footer__meta">© {year} {siteConfig.name}</p>
      </div>
    </footer>
  );
}
