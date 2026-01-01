import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FloatingAI } from "@/components/FloatingAI";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import CasesPage from "@/pages/cases";
import StudioPage from "@/pages/studio";
import ClientsPage from "@/pages/clients";
import ContractsPage from "@/pages/contracts";
import BillingPage from "@/pages/billing";
import CalendarPage from "@/pages/calendar";
import ReportsPage from "@/pages/reports";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/cases" component={CasesPage} />
      <Route path="/studio" component={StudioPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/contracts" component={ContractsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <FloatingAI />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
