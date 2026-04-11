import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FloatingAI } from "@/components/FloatingAI";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import CasesPage from "@/pages/cases";
import StudioPage from "@/pages/studio";
import ClientsPage from "@/pages/clients";
import ContractsPage from "@/pages/contracts";
import BillingPage from "@/pages/billing";
import CalendarPage from "@/pages/calendar";
import ReportsPage from "@/pages/reports";
import EmailPage from "@/pages/email";
import CalculadoraPage from "@/pages/calculadora";
import MensagensPage from "@/pages/mensagens";
import NegotiationsPage from "@/pages/negotiations";
import AcordosPage from "@/pages/acordos";
import ProspectingPage from "@/pages/prospecting";
import MeetingsPage from "@/pages/meetings";
import ProtocolosPage from "@/pages/protocolos";
import LoginPage from "@/pages/login";

const STAFF_ROLES = ["socio", "advogado", "admin"];

function RoleGuard({ allowedRoles, component: Component }: { allowedRoles: string[]; component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role)) {
      toast({ title: "Acesso restrito", description: "Você não tem permissão para acessar esta página.", variant: "destructive" });
      navigate("/");
    }
  }, [isLoading, user, allowedRoles, navigate, toast]);

  if (isLoading || !user) return null;
  if (!allowedRoles.includes(user.role)) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/cases" component={CasesPage} />
      <Route path="/studio" component={StudioPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/clients/:id" component={ClientsPage} />
      <Route path="/contracts">{() => <RoleGuard allowedRoles={STAFF_ROLES} component={ContractsPage} />}</Route>
      <Route path="/billing">{() => <RoleGuard allowedRoles={STAFF_ROLES} component={BillingPage} />}</Route>
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/reports">{() => <RoleGuard allowedRoles={STAFF_ROLES} component={ReportsPage} />}</Route>
      <Route path="/email" component={EmailPage} />
      <Route path="/calculadora" component={CalculadoraPage} />
      <Route path="/mensagens" component={MensagensPage} />
      <Route path="/negotiations" component={NegotiationsPage} />
      <Route path="/acordos" component={AcordosPage} />
      <Route path="/protocolos" component={ProtocolosPage} />
      <Route path="/prospecting" component={ProspectingPage} />
      <Route path="/meetings" component={MeetingsPage} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f2447",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "3px solid rgba(201, 169, 110, 0.3)",
            borderTopColor: "#c9a96e",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <>
      <Router />
      <FloatingAI />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
