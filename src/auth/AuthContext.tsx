import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

interface User {
  email: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  loadingMessage: string | null;
  authError: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  confirmAccount: (email: string, code: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';
const HOSTED_UI_SIGN_IN_KEY = 'amplify-signin-with-hostedUI';
const COGNITO_STORAGE_PREFIX = 'CognitoIdentityServiceProvider';
const HOSTED_UI_LOGOUT_TIMEOUT_MS = 10_000;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(
    DEV_MODE ? { email: 'dev@example.com', name: 'Dev User' } : null,
  );
  // Only show loading spinner if there might be an active session to restore.
  // OAuth callback (?code=) always needs loading; otherwise, check if tokens exist in storage.
  const hasOAuthCode = !DEV_MODE && new URLSearchParams(window.location.search).has('code');
  const hasTokens = !DEV_MODE && Object.keys(localStorage).some(k => k.startsWith(COGNITO_STORAGE_PREFIX));
  const [isLoading, setIsLoading] = useState(hasOAuthCode || hasTokens);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authCheckId = useRef(0);
  const hostedUiLogoutInProgress = useRef(false);
  const hostedUiLogoutTimeoutRef = useRef<number | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const clearHostedUiLogoutTimeout = useCallback(() => {
    if (hostedUiLogoutTimeoutRef.current !== null) {
      window.clearTimeout(hostedUiLogoutTimeoutRef.current);
      hostedUiLogoutTimeoutRef.current = null;
    }
  }, []);

  const clearAuthenticatedUser = useCallback(() => {
    authCheckId.current += 1;
    hostedUiLogoutInProgress.current = false;
    clearHostedUiLogoutTimeout();
    setUser(null);
    setIsLoading(false);
    setLoadingMessage(null);
  }, [clearHostedUiLogoutTimeout]);

  const getAuthenticatedUser = useCallback(async (): Promise<User | null> => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.payload;
      return {
        email: (idToken?.email as string) || currentUser.signInDetails?.loginId || currentUser.username,
        name: (idToken?.name as string) || undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const requestId = ++authCheckId.current;
    const authenticatedUser = await getAuthenticatedUser();
    if (requestId !== authCheckId.current) return;
    setUser(authenticatedUser);
    setIsLoading(false);
    setLoadingMessage(null);
  }, [getAuthenticatedUser]);

  useEffect(() => {
    if (DEV_MODE) return;

    // Listen for OAuth redirect completion
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        // Clean up OAuth params from the URL
        window.history.replaceState({}, '', window.location.pathname);
        checkAuth();
      }
      if (payload.event === 'signInWithRedirect_failure') {
        console.error('OAuth sign-in failed:', payload.data);
        window.history.replaceState({}, '', window.location.pathname);
        setIsLoading(false);
        setLoadingMessage(null);
      }
      if (payload.event === 'signedOut') {
        if (hostedUiLogoutInProgress.current) return;
        clearAuthenticatedUser();
      }
    });

    // Still check on mount for existing sessions (e.g. page refresh while already logged in)
    checkAuth();

    return () => unsubscribe();
  }, [checkAuth, clearAuthenticatedUser]);

  function getSignInStepError(step?: string) {
    if (!step) {
      return 'Sign-in is not complete. Please verify account status and credentials.';
    }
    if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      return 'This account requires a new password before it can sign in.';
    }
    if (step === 'CONFIRM_SIGN_UP') {
      return 'This account is not confirmed yet.';
    }
    return `Sign-in requires additional step: ${step}`;
  }

  function hasHostedUiSession() {
    if (localStorage.getItem(HOSTED_UI_SIGN_IN_KEY) === 'true') {
      return true;
    }

    return Object.keys(localStorage).some(key => {
      if (!key.startsWith(COGNITO_STORAGE_PREFIX)) return false;

      const value = localStorage.getItem(key);
      if (key.endsWith('.oauthSignIn')) {
        return value?.startsWith('true') ?? false;
      }

      if (!key.endsWith('.oauthMetadata') || !value) {
        return false;
      }

      try {
        return JSON.parse(value)?.oauthSignIn === true;
      } catch {
        return false;
      }
    });
  }

  async function login(email: string, password: string) {
    if (DEV_MODE) {
      setUser({ email, name: 'Dev User' });
      return;
    }
    setIsLoading(true);
    setLoadingMessage(null);
    try {
      const result = await signIn({ username: email, password });

      if (!result.isSignedIn) {
        throw new Error(getSignInStepError(result.nextStep?.signInStep));
      }

      const authenticatedUser = await getAuthenticatedUser();
      if (!authenticatedUser) {
        throw new Error('Signed in, but failed to load user session.');
      }

      setUser(authenticatedUser);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function signup(email: string, password: string, name: string) {
    await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email, name },
      },
    });
  }

  async function confirmAccount(email: string, code: string) {
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async function forgotPassword(email: string) {
    await resetPassword({ username: email });
  }

  async function confirmForgotPassword(email: string, code: string, newPassword: string) {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
  }

  async function logout() {
    if (DEV_MODE) {
      clearAuthenticatedUser();
      return;
    }

    const shouldRedirectToHostedUiLogout = hasHostedUiSession();
    hostedUiLogoutInProgress.current = shouldRedirectToHostedUiLogout;
    authCheckId.current += 1;
    setAuthError(null);
    setIsLoading(true);
    setLoadingMessage('Logging out...');

    if (shouldRedirectToHostedUiLogout) {
      clearHostedUiLogoutTimeout();
      hostedUiLogoutTimeoutRef.current = window.setTimeout(() => {
        // The Cognito redirect never arrived — recover so the user isn't stuck on the spinner.
        setAuthError('Sign out is taking longer than expected. You have been signed out locally.');
        clearAuthenticatedUser();
      }, HOSTED_UI_LOGOUT_TIMEOUT_MS);
    }

    try {
      await signOut({ global: false });
      if (!shouldRedirectToHostedUiLogout) {
        clearAuthenticatedUser();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed. Please try again.';
      setAuthError(message);
      clearAuthenticatedUser();
      throw err;
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, loadingMessage, authError, clearAuthError, login, logout, signup, confirmAccount, forgotPassword, confirmForgotPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
