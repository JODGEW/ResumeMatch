import { afterEach, describe, expect, it, vi } from 'vitest';

// Landing pulls in the auth context (Amplify) and the theme toggle
// (window.matchMedia); neither exists in the node test environment and
// neither affects the pricing markup under test.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));
vi.mock('../components/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

/**
 * BILLING_UI_ENABLED is read from import.meta.env at module load, so each
 * render stubs the env var and re-imports the whole module graph. React,
 * react-dom/server, and react-router-dom must come from the same fresh graph
 * as Landing — mixing pre-reset and post-reset copies would split the React
 * instance and break hooks and router context.
 */
async function renderLanding(flagValue: string): Promise<string> {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_BILLING_UI', flagValue);
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const { Landing } = await import('./Landing');
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(Landing)),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Landing pricing — billing flag off (production default)', () => {
  it('renders the beta pricing section with the production copy from main', async () => {
    const html = await renderLanding('false');
    expect(html).toContain('Start free. Everything is included right now.');
    expect(html).toContain('Free during beta');
    expect(html).toContain('Available now');
    expect(html).toContain('Coming Soon');
    expect(html).toContain('10 resume analyses per day');
  });

  it('does not render any three-tier pricing content', async () => {
    const html = await renderLanding('false');
    expect(html).not.toContain('Career Sprint');
    expect(html).not.toContain('$14.99');
    expect(html).not.toContain('$19.99');
    expect(html).not.toContain('Founding price');
  });

  it('keeps exactly one #pricing anchor target and a visible Pricing nav link', async () => {
    const html = await renderLanding('false');
    expect(html.match(/id="pricing"/g)).toHaveLength(1);
    // Desktop nav renders one Pricing link; the mobile menu (closed here) maps
    // the same navLinks array, so a duplicate would show up in this count.
    expect(html.match(/href="#pricing"/g)).toHaveLength(1);
  });
});

describe('Landing pricing — billing flag on', () => {
  it('renders the three-tier pricing with the founding Sprint price intact', async () => {
    const html = await renderLanding('true');
    expect(html).toContain('Start free, upgrade for the full loop');
    expect(html).toContain('Career Sprint');
    expect(html).toContain('$14.99');
    expect(html).toContain('$19.99');
    expect(html).toContain('$24.99');
    expect(html).toContain(
      'Founding price: $19.99 for the 60-day Career Sprint, available through October 31, 2026.',
    );
    expect(html).toContain('Best value');
  });

  it('does not render the beta fallback content', async () => {
    const html = await renderLanding('true');
    expect(html).not.toContain('Free during beta');
    expect(html).not.toContain('Coming Soon');
    expect(html).not.toContain('Everything is included right now');
  });

  it('keeps exactly one #pricing anchor target and a visible Pricing nav link', async () => {
    const html = await renderLanding('true');
    expect(html.match(/id="pricing"/g)).toHaveLength(1);
    expect(html.match(/href="#pricing"/g)).toHaveLength(1);
  });
});
