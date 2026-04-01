import { useState, useEffect } from "react";
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
  Building2,
  Mail,
  Calculator,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
  Handshake,
  Target,
  Video,
  FileSpreadsheet
} from "lucide-react";
import logoMs from "@/assets/images/logo-ms-new.png";
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
import { useQuery } from "@tanstack/react-query";
import { intimacoesApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const RESTRICTED_TO_STAFF = ["socio", "advogado", "admin"];

interface NavItem {
  label: string;
  icon: any;
  href: string;
  highlight?: boolean;
  allowedRoles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Gestão",
    items: [
      { label: "Painel Executivo", icon: LayoutDashboard, href: "/" },
      { label: "Relatórios", icon: BarChart3, href: "/reports", allowedRoles: RESTRICTED_TO_STAFF },
    ],
  },
  {
    title: "Jurídico",
    items: [
      { label: "Processos", icon: Scale, href: "/cases" },
      { label: "Contratos", icon: FileText, href: "/contracts", allowedRoles: RESTRICTED_TO_STAFF },
      { label: "Agenda Jurídica", icon: Calendar, href: "/calendar" },
      { label: "Cálculos e Custas", icon: Calculator, href: "/calculadora" },
    ],
  },
  {
    title: "Clientes & Negócios",
    items: [
      { label: "Clientes", icon: User, href: "/clients" },
      { label: "Financeiro", icon: CreditCard, href: "/billing", allowedRoles: RESTRICTED_TO_STAFF },
    ],
  },
  {
    title: "Inteligência Jurídica",
    items: [
      { label: "Estúdio", icon: Bot, href: "/studio", highlight: true },
      { label: "Secretária", icon: MessageSquare, href: "/mensagens", highlight: true },
      { label: "Negociações", icon: Handshake, href: "/negotiations", highlight: true },
      { label: "Acordos", icon: FileSpreadsheet, href: "/acordos", highlight: true },
      { label: "Prospecção", icon: Target, href: "/prospecting", highlight: true },
      { label: "Reunião", icon: Video, href: "/meetings", highlight: true },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { label: "E-mail", icon: Mail, href: "/email" },
    ],
  },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const userRole = user?.role ?? "";
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", String(isCollapsed));
    } catch {}
  }, [isCollapsed]);

  const { data: unreadCountData } = useQuery({
    queryKey: ["intimacoes", "unread-count"],
    queryFn: intimacoesApi.getUnreadCount,
    refetchInterval: 60000,
  });
  const unreadCount = unreadCountData?.count ?? 0;

  const { data: whatsappUnreadData } = useQuery({
    queryKey: ["whatsapp-unread"],
    queryFn: () => fetch("/api/whatsapp/unread-count").then(r => r.json()),
    refetchInterval: 10000,
  });
  const whatsappUnread = whatsappUnreadData?.count ?? 0;

  const { data: emailFoldersData } = useQuery({
    queryKey: ["/api/inbox/folders"],
    queryFn: () => fetch("/api/inbox/folders").then(r => r.json()).catch(() => []),
    refetchInterval: 60000,
  });
  const emailUnread = Array.isArray(emailFoldersData)
    ? emailFoldersData.reduce((sum: number, f: any) => sum + (f.unreadCount || 0), 0)
    : 0;

  const sidebarWidth = isCollapsed ? "w-[68px]" : "w-64";
  const mainMargin = isCollapsed ? "md:ml-[68px]" : "md:ml-64";

  const NavContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className={cn("flex items-center gap-2", collapsed ? "p-3 justify-center" : "p-6")}>
        <div className="w-[40px] h-[40px] flex items-center justify-center flex-shrink-0">
          <img src={logoMs} alt="Logo" className="w-[40px] h-[40px] object-contain mix-blend-screen" />
        </div>
        {!collapsed && <span className="font-serif text-xl font-bold tracking-tight">LexAI</span>}
      </div>

      <div className={cn("flex-1 py-2 overflow-y-auto sidebar-scroll", collapsed ? "px-2" : "px-4")}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title} className={cn(gi > 0 && "mt-3")}>
            {!collapsed && (
              <div className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-1 px-2 mt-1">
                {group.title}
              </div>
            )}
            {collapsed && gi > 0 && (
              <div className="border-t border-sidebar-border/30 my-2" />
            )}
            <div className="space-y-0.5">
              {group.items.filter(item => !item.allowedRoles || item.allowedRoles.includes(userRole)).map((item) => {
                const isActive = location === item.href;
                const badge = item.href === "/cases" && unreadCount > 0 ? unreadCount :
                              item.href === "/mensagens" && whatsappUnread > 0 ? whatsappUnread :
                              item.href === "/email" && emailUnread > 0 ? emailUnread : 0;
                const badgeColor = item.href === "/cases" ? "bg-orange-600" :
                                  item.href === "/email" ? "bg-purple-600" : "bg-green-600";

                const navLink = (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center rounded-md text-sm font-medium transition-colors cursor-pointer group relative",
                        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                        item.highlight && !isActive && "text-blue-400 hover:text-blue-300"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-4 h-4 flex-shrink-0",
                          item.highlight ? "text-blue-400" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
                          isActive && "text-sidebar-accent-foreground"
                        )}
                      />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {badge > 0 && (
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white rounded-full",
                          badgeColor,
                          collapsed && "absolute -top-1 -right-1 min-w-[16px] h-[16px] text-[9px]"
                        )}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );

                if (collapsed) {
                  return (
                    <TooltipProvider key={item.href} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {navLink}
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-sans text-xs">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }

                return navLink;
              })}
            </div>
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className="p-4 border-t border-sidebar-border space-y-4">
          <div className="bg-sidebar-accent/50 p-3 rounded-lg flex items-center gap-3">
            <Building2 className="w-8 h-8 text-sidebar-foreground/50 p-1 bg-background/10 rounded" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Marques & Serra</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">Plano Enterprise</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "px-4 py-2")}>
        <button
          onClick={() => setIsCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors text-xs"
          data-testid="sidebar-toggle"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : (
            <>
              <ChevronsLeft className="w-4 h-4" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-sans flex">
      <aside className={cn("hidden md:block fixed inset-y-0 z-50 transition-all duration-300", sidebarWidth)}>
        <NavContent collapsed={isCollapsed} />
      </aside>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r-0">
          <NavContent collapsed={false} />
        </SheetContent>
      </Sheet>

      <main className={cn("flex-1 flex flex-col min-h-screen transition-all duration-300", mainMargin)}>
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
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">RS</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || "Usuário"}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email || "sem-email"}
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
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
