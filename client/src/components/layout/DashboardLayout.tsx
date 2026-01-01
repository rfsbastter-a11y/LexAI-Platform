import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Scale,
  Calendar,
  CreditCard,
  BarChart3,
  Bot,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  User,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: "Painel Executivo", icon: LayoutDashboard, href: "/" },
  { label: "Processos", icon: Scale, href: "/cases" },
  { label: "LexAI Estúdio", icon: Bot, href: "/studio", highlight: true },
  { label: "Clientes", icon: User, href: "/clients" },
  { label: "Contratos", icon: FileText, href: "/contracts" },
  { label: "Agenda Jurídica", icon: Calendar, href: "/calendar" },
  { label: "Financeiro", icon: CreditCard, href: "/billing" },
  { label: "Relatórios", icon: BarChart3, href: "/reports" },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-2">
        <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <span className="font-serif text-xl font-bold tracking-tight">LexAI</span>
      </div>

      <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2 mt-4">
          Módulos
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer group",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  item.highlight && !isActive && "text-blue-400 hover:text-blue-300"
                )}
              >
                <item.icon
                  className={cn(
                    "w-4 h-4",
                    item.highlight ? "text-blue-400" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
                    isActive && "text-sidebar-accent-foreground"
                  )}
                />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border space-y-4">
        <div className="bg-sidebar-accent/50 p-3 rounded-lg flex items-center gap-3">
          <Building2 className="w-8 h-8 text-sidebar-foreground/50 p-1 bg-background/10 rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Barros & Silva Adv</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">Plano Enterprise</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-sans flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 fixed inset-y-0 z-50">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r-0">
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm px-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="relative hidden sm:block w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar processos, clientes ou documentos..."
                className="pl-9 bg-background/50 border-transparent hover:border-border focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src="https://github.com/shadcn.png" alt="@user" />
                    <AvatarFallback>DR</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Dra. Roberta Silva</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      roberta@barrosesilva.adv.br
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
