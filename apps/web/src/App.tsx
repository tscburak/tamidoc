import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout, AuthLayout } from './layouts';
import { LandingPage } from './pages/landing/LandingPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { TemplatesPage } from './pages/templates/TemplatesPage';
import { CreateTemplatePage } from './pages/templates/CreateTemplatePage';
import { FillTemplatePage } from './pages/templates/FillTemplatePage';
import { FormsPage, FormSubmissionsPage, PublicFormFillPage, PublicStackFormFillPage } from './pages/forms';
import { FormReviewPage, StackFormSubmissionsPage } from './pages/stack-forms';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { OrganizationSettingsPage } from './pages/organization';
import { InvitePage } from '@edition';
import { ToastProvider } from './context/ToastProvider';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, OnboardingRoute } from './components/auth';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OrgSyncWithTemplates } from './components/OrgSyncWithTemplates';
import {
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  CheckEmailPage,
} from './pages/auth';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/f/:formToken" element={<PublicFormFillPage />} />
              <Route path="/fs/:stackToken" element={<PublicStackFormFillPage />} />
              {InvitePage && <Route path="/invite/:token" element={<InvitePage />} />}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/check-email" element={<CheckEmailPage />} />
              </Route>

              {/* Protected route - onboarding (after registration/first login) */}
              <Route element={<OnboardingRoute />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Route>

              {/* Legacy route - redirect to onboarding */}
              <Route path="/create-organization" element={<Navigate to="/onboarding" replace />} />

              {/* Protected routes - auth + org checks */}
              <Route element={<ProtectedRoute />}>
                {/* Org-scoped routes - validates and syncs URL org ↔ active org */}
                <Route path="/o/:organizationId" element={
                  <OrgSyncWithTemplates />
                }>
                  {/* Full-screen editors (no sidebar) */}
                  <Route path="templates/new" element={<CreateTemplatePage />} />
                  <Route path="templates/:id/edit" element={<CreateTemplatePage />} />
                  <Route path="templates/:id/fill" element={<FillTemplatePage />} />
                  <Route path="forms/review" element={<FormReviewPage />} />
                  {/* Admin panel (own sidebar) */}
                  <Route path="org-settings" element={<OrganizationSettingsPage />} />

                  {/* MainLayout-wrapped app routes */}
                  <Route element={<MainLayout />}>
                    <Route index element={<Navigate to="templates" replace />} />
                    <Route path="templates" element={<TemplatesPage kindFilter="all" />} />
                    <Route path="templates/fixed" element={<TemplatesPage kindFilter="fixed" />} />
                    <Route path="templates/composable" element={<TemplatesPage kindFilter="composable" />} />
                    <Route path="templates/:id" element={<Navigate to="edit" replace />} />
                    <Route path="templates/:id/edit" element={<div>Template Edit Page (TODO)</div>} />
                    <Route path="forms" element={<FormsPage />} />
                    <Route path="forms/:id" element={<FormSubmissionsPage />} />
                    <Route path="stack-forms/:id" element={<StackFormSubmissionsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
