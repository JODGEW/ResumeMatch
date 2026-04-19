import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { Upload } from './pages/Upload';
import { Results } from './pages/Results';
import { History } from './pages/History';
import { Dashboard } from './pages/Dashboard';
import { Tracker } from './pages/Tracker';
import { Interview } from './pages/Interview';
import { InterviewHistory } from './pages/InterviewHistory';
import { InterviewResults } from './pages/InterviewResults';
import { ResultsPreview } from './pages/ResultsPreview';

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

function MaybeProtected({ children }: { children: React.ReactNode }) {
  if (DEV_MODE) return <>{children}</>;
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function RootGate() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }
  if (user) return <Navigate to="/upload" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootGate />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route
            element={
              <MaybeProtected>
                <Layout />
              </MaybeProtected>
            }
          >
            <Route path="/upload" element={<Upload />} />
            <Route path="/results/:analysisId" element={<Results />} />
            <Route path="/history" element={<History />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/interview" element={<Interview />} />
            <Route path="/interview/history" element={<InterviewHistory />} />
            <Route path="/interview/results/:sessionId" element={<InterviewResults />} />
            {DEV_MODE && (
              <Route path="/preview" element={<ResultsPreview />} />
            )}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
