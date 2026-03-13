import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

interface User {
  email: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(
    DEV_MODE ? { email: 'dev@example.com', name: 'Dev User' } : null,
  );
  const [isLoading, setIsLoading] = useState(!DEV_MODE);

  useEffect(() => {
    if (DEV_MODE) return;
    checkAuth();
  }, []);

  async function getAuthenticatedUser(): Promise<User | null> {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      return {
        email: currentUser.signInDetails?.loginId || currentUser.username,
        name: session.tokens?.idToken?.payload?.name as string | undefined,
      };
    } catch {
      return null;
    }
  }

  async function checkAuth() {
    const authenticatedUser = await getAuthenticatedUser();
    setUser(authenticatedUser);
    setIsLoading(false);
  }

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

  async function login(email: string, password: string) {
    if (DEV_MODE) {
      setUser({ email, name: 'Dev User' });
      return;
    }
    setIsLoading(true);
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
    }
  }

  async function logout() {
    if (DEV_MODE) {
      setUser(null);
      return;
    }
    await signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
