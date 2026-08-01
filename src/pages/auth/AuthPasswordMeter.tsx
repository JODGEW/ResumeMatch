import { PASSWORD_RULES } from '../../utils/passwordPolicy';

function getPasswordStrength(pw: string): 'weak' | 'medium' | 'strong' {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <path d="M2.5 6.8 5 9.2l5.5-5.6" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <path d="M3.5 3.5l6 6M9.5 3.5l-6 6" fill="none" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/* The requirement list mirrors the Cognito pool policy via PASSWORD_RULES;
   the strength read adds a 12+ length bonus on top of the raw rule count.
   Reveal-on-focus: the parent passes `visible` (field focused OR non-empty) so
   the resting form stays compact and the one height change happens on focus,
   before typing — never under the user's cursor mid-entry. */
export function AuthPasswordMeter({ password, visible }: { password: string; visible: boolean }) {
  if (!visible) return null;
  const hasInput = password.length > 0;
  const strength = hasInput ? getPasswordStrength(password) : null;

  return (
    <div className="auth-pw-meter">
      <div className="auth-pw-reqs">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          const state = met ? ' is-met' : hasInput ? ' is-unmet' : '';
          return (
            <span key={rule.label} className={`auth-pw-req${state}`}>
              {met ? <CheckIcon /> : <XIcon />}
              {rule.label}
            </span>
          );
        })}
      </div>
      <div className={`auth-strength${strength ? ` auth-strength--${strength}` : ''}`}>
        <div className="auth-strength__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="auth-strength__label">{strength ?? '—'}</span>
      </div>
    </div>
  );
}

/* Always renders its row (fixed height) so the note appearing mid-typing
   never pushes the submit button down under the user's cursor. */
export function AuthMatchNote({ password, confirm }: { password: string; confirm: string }) {
  const active = confirm.length > 0;
  const match = confirm === password;
  return (
    <div
      className={`auth-match${active ? (match ? ' auth-match--yes' : ' auth-match--no') : ''}`}
      aria-live="polite"
    >
      {active && (
        <>
          {match ? <CheckIcon /> : <XIcon />}
          {match ? 'Passwords match' : 'Passwords do not match'}
        </>
      )}
    </div>
  );
}
