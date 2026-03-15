import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { setupFetchInterceptor } from "@/lib/fetch-patch";
import { AuthProvider, useAuth } from "@/lib/auth-context";

const LandingPage = lazy(() => import("@/pages/landing").then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/auth/login").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/auth/register").then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/auth/reset-password").then(m => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard").then(m => ({ default: m.DashboardPage })));
const ModelWizardPage = lazy(() => import("@/pages/model-wizard").then(m => ({ default: m.ModelWizardPage })));
const PublicWizardPage = lazy(() => import("@/pages/public-wizard").then(m => ({ default: m.PublicWizardPage })));
const AdminPage = lazy(() => import("@/pages/admin").then(m => ({ default: m.AdminPage })));
import NotFound from "@/pages/not-found";

setupFetchInterceptor();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return <div className="min-h-screen bg-background" />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <PageLoader />;
  }

  return user ? <Component /> : null;
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/underwriting" component={PublicWizardPage} />

        <Route path="/dashboard">
          {() => <ProtectedRoute component={DashboardPage} />}
        </Route>
        <Route path="/model/:id">
          {() => <ProtectedRoute component={ModelWizardPage} />}
        </Route>
        <Route path="/admin">
          {() => <ProtectedRoute component={AdminPage} />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
