import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, loadingMessage } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        {loadingMessage && <p className="loading-screen__text">{loadingMessage}</p>}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
