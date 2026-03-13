import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { Upload } from './pages/Upload';
import { Results } from './pages/Results';
import { History } from './pages/History';
import { Dashboard } from './pages/Dashboard';
import { Tracker } from './pages/Tracker';
import { ResultsPreview } from './pages/ResultsPreview';

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

function MaybeProtected({ children }: { children: React.ReactNode }) {
  if (DEV_MODE) return <>{children}</>;
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
            {DEV_MODE && (
              <Route path="/preview" element={<ResultsPreview />} />
            )}
          </Route>

          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
