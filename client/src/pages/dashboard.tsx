import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStats } from "@/hooks/use-dashboard";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Brain,
  Calendar,
  CheckCircle,
  DollarSign,
  FileText,
  Loader2,
  Scale,
  Send,
  TrendingUp,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("pt-BR");

function cleanMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s?/g, "")
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    .replace(/^[-*]\s/gm, "• ")
    .replace(/^\d+\.\s/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/---+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function DashboardPage() {
  const { data: stats } = useDashboardStats();
  const [briefing, setBriefing] = useState<string>("");
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboard", "full"],
    queryFn: async () => {
      const token = localStorage.getItem("lexai_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/dashboard/full", { headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    staleTime: 30000,
  });

  const briefingFetched = useRef(false);

  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const token = localStorage.getItem("lexai_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/ai/daily-briefing", { method: "POST", headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate briefing");
      const data = await res.json();
      setBriefing(cleanMarkdown(data.briefing));
    } catch {
      setBriefing("Erro ao gerar briefing. Tente novamente.");
    } finally {
      setLoadingBriefing(false);
    }
  };

  useEffect(() => {
    if (briefingFetched.current) return;
    const day = new Date().getDay();
    const isWeekday = day >= 1 && day <= 5;
    if (isWeekday) {
      briefingFetched.current = true;
      handleGenerateBriefing();
    }
  }, []);

  const ds = dashboard?.stats;
  const interventions = dashboard?.interventions || [];
  const overdueInvoices = dashboard?.overdueInvoices || [];
  const expiringContracts = dashboard?.expiringContracts || [];
  const staleCases = dashboard?.staleCases || [];
  const todayIntimacoes = dashboard?.todayIntimacoes || [];
  const aiEfficiency = dashboard?.aiEfficiency;
  const whatsappStatus = dashboard?.whatsappStatus || "disconnected";
  const upcomingDeadlines = (dashboard?.upcomingDeadlines || []).sort(
    (a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  const typeBadgeColor: Record<string, string> = {
    FIN: "bg-orange-100 text-orange-700 border-orange-200",
    JUR: "bg-red-100 text-red-700 border-red-200",
    CTR: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-dashboard-title">Painel Executivo</h1>
          <p className="text-muted-foreground mt-1">Visão geral e urgências do dia.</p>
        </div>
        <div className="flex gap-2 button-group-responsive">
          <Link href="/cases">
            <Button className="btn-responsive" data-testid="btn-nova-acao">Processos</Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" className="btn-responsive" data-testid="btn-relatorios">Relatórios</Button>
          </Link>
        </div>
      </div>

      {/* AI Daily Briefing */}
      <Card className="border-l-4 border-l-primary" data-testid="card-briefing">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Briefing Estratégico do Dia</CardTitle>
              {(() => {
                const day = new Date().getDay();
                const isWeekday = day >= 1 && day <= 5;
                return isWeekday && !briefing && !loadingBriefing ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Gerado automaticamente em dias úteis</p>
                ) : !isWeekday && !briefing ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Clique para gerar manualmente no fim de semana</p>
                ) : null;
              })()}
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleGenerateBriefing}
            disabled={loadingBriefing}
            data-testid="btn-gerar-briefing"
          >
            {loadingBriefing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            <span className="hidden sm:inline">{briefing ? "Atualizar Briefing" : "Gerar Briefing"}</span>
            <span className="sm:hidden">{briefing ? "Atualizar" : "Gerar"}</span>
          </Button>
        </CardHeader>
        {briefing && (
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-briefing-content">{briefing}</p>
          </CardContent>
        )}
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-prazos">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prazos Urgentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-urgent-deadlines">{ds?.urgentDeadlines || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Para os próximos 3 dias · <span data-testid="text-deadlines-7days">{ds?.deadlines7Days || 0}</span> em 7 dias
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-processos">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processos Ativos</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-active-cases">{ds?.activeCases || 0}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-500 flex items-center gap-1">
                    +{ds?.newCasesThisMonth || 0} este mês <TrendingUp className="w-3 h-3" />
                  </span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-valores">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valores a Faturar</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-pending-amount">{formatCurrency(ds?.pendingAmount || 0)}</div>
                <p className="text-xs text-muted-foreground">Pendente de cobrança</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-audiencias">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Audiências da Semana</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-audiencias-week">{ds?.audienciasWeek || 0}</div>
                <p className="text-xs text-muted-foreground">Agendadas esta semana</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Intervenções Necessárias */}
      <Card data-testid="card-intervencoes">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle>Intervenções Necessárias</CardTitle>
          </div>
          <CardDescription>Itens que requerem sua ação imediata.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : interventions.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <p>Nenhuma intervenção necessária</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interventions.map((item: any) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-4 p-3 rounded-lg border transition-colors ${
                    item.severity === "critical" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50"
                  }`}
                  data-testid={`intervention-${item.id}`}
                >
                  <Badge className={typeBadgeColor[item.type] || "bg-gray-100 text-gray-700"}>
                    {item.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <Link href={item.actionHref}>
                    <Button size="sm" variant="outline" data-testid={`btn-intervention-${item.id}`}>
                      {item.action}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Left column */}
        <div className="col-span-full lg:col-span-4 space-y-4">
          {/* Inadimplência */}
          <Card data-testid="card-inadimplencia">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-red-500" />
                  <CardTitle>Inadimplência</CardTitle>
                </div>
                <Link href="/billing">
                  <Button size="sm" variant="ghost" data-testid="link-billing">Ver tudo</Button>
                </Link>
              </div>
              <CardDescription>Faturas vencidas por cliente.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : overdueInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">Nenhuma fatura vencida.</p>
              ) : (
                <div className="space-y-2">
                  {overdueInvoices.map((inv: any) => {
                    const color = inv.daysOverdue > 30 ? "bg-red-500" : inv.daysOverdue > 15 ? "bg-orange-500" : "bg-yellow-500";
                    return (
                      <div key={inv.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`overdue-invoice-${inv.id}`}>
                        <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.clientName}</p>
                          <p className="text-xs text-muted-foreground">{inv.invoiceNumber}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{formatCurrency(inv.amount)}</p>
                          <p className="text-xs text-muted-foreground">{inv.daysOverdue} dias</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Intimações do Dia */}
          <Card data-testid="card-today-intimacoes">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-blue-500" />
                  <CardTitle>Intimações do Dia</CardTitle>
                </div>
                <Link href="/cases">
                  <Button size="sm" variant="ghost" data-testid="link-intimacoes-cases">Ver processos</Button>
                </Link>
              </div>
              <CardDescription>Movimentações e intimações recebidas hoje.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : todayIntimacoes.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">Nenhuma intimação recebida hoje.</p>
              ) : (
                <div className="space-y-2">
                  {todayIntimacoes.map((m: any) => (
                    <div key={m.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`intimacao-${m.id}`}>
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.caseNumber} — {m.type}</p>
                        {m.aiDeadlineSummary ? (
                          <p className="text-xs text-muted-foreground mt-0.5">{m.aiDeadlineSummary}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</p>
                        )}
                        {m.aiDeadlineDate && (
                          <p className="text-xs text-amber-600 mt-0.5">Prazo: {m.aiDeadlineDate}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processos sem Movimentação */}
          <Card data-testid="card-stale-cases">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-orange-500" />
                  <CardTitle>Processos sem Movimentação</CardTitle>
                </div>
                <Link href="/cases">
                  <Button size="sm" variant="ghost" data-testid="link-cases">Ver tudo</Button>
                </Link>
              </div>
              <CardDescription>Processos parados há mais de 30 dias.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : staleCases.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">Todos os processos em movimentação.</p>
              ) : (
                <div className="space-y-2">
                  {staleCases.map((c: any) => {
                    const color = c.staleness === "critical" ? "bg-red-500" : c.staleness === "warning" ? "bg-orange-500" : "bg-yellow-500";
                    return (
                      <div key={c.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`stale-case-${c.id}`}>
                        <div className={`w-2 h-2 rounded-full ${color} shrink-0 mt-1.5`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.caseNumber} · {c.court}</p>
                          <p className="text-xs text-muted-foreground">{c.clientName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{c.daysSinceMovement}d</p>
                          <p className="text-xs text-muted-foreground">parado</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="col-span-full lg:col-span-3 space-y-4">
          {/* Contratos Vencendo */}
          <Card data-testid="card-expiring-contracts">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                <CardTitle>Contratos Vencendo</CardTitle>
              </div>
              <CardDescription>Contratos próximos do vencimento.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : expiringContracts.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">Nenhum contrato próximo do vencimento.</p>
              ) : (
                <div className="space-y-2">
                  {expiringContracts.map((c: any) => {
                    const color = c.daysToExpire < 7 ? "bg-red-500" : c.daysToExpire < 15 ? "bg-orange-500" : "bg-yellow-500";
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`expiring-contract-${c.id}`}>
                        <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.clientName}</p>
                          <p className="text-xs text-muted-foreground">{c.type}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{c.daysToExpire}d</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(c.monthlyValue)}/mês</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prazos Próximos */}
          <Card data-testid="card-upcoming-deadlines">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <CardTitle>Prazos Próximos</CardTitle>
              </div>
              <CardDescription>Próximos prazos processuais.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : upcomingDeadlines.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">Nenhum prazo próximo.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingDeadlines.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`deadline-${d.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{d.type}</Badge>
                          <span className="text-xs text-muted-foreground">{d.caseNumber}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatDate(d.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Eficiência IA */}
        <Card data-testid="card-ai-efficiency">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              <CardTitle>Eficiência IA</CardTitle>
            </div>
            <CardDescription>Métricas de produtividade desta semana.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center" data-testid="stat-hours-saved">
                  <p className="text-2xl font-bold">{aiEfficiency?.hoursSaved || 0}h</p>
                  <p className="text-xs text-muted-foreground">Horas economizadas</p>
                </div>
                <div className="text-center" data-testid="stat-pieces-generated">
                  <p className="text-2xl font-bold">{aiEfficiency?.piecesGenerated || 0}</p>
                  <p className="text-xs text-muted-foreground">Peças geradas</p>
                </div>
                <div className="text-center" data-testid="stat-ai-interactions">
                  <p className="text-2xl font-bold">{aiEfficiency?.aiInteractions || 0}</p>
                  <p className="text-xs text-muted-foreground">Interações IA</p>
                </div>
                <div className="text-center" data-testid="stat-clients-created">
                  <p className="text-2xl font-bold">{aiEfficiency?.weeklyClientsCreated || 0}</p>
                  <p className="text-xs text-muted-foreground">Clientes criados</p>
                </div>
                <div className="text-center" data-testid="stat-cases-created">
                  <p className="text-2xl font-bold">{aiEfficiency?.weeklyCasesCreated || 0}</p>
                  <p className="text-xs text-muted-foreground">Processos criados</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status WhatsApp */}
        <Card data-testid="card-whatsapp-status">
          <CardHeader>
            <div className="flex items-center gap-2">
              {whatsappStatus === "connected" ? (
                <Wifi className="h-5 w-5 text-emerald-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <CardTitle>Status WhatsApp</CardTitle>
            </div>
            <CardDescription>Integração com WhatsApp Business.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    whatsappStatus === "connected"
                      ? "bg-emerald-500"
                      : whatsappStatus === "connecting" || whatsappStatus === "qr_ready"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-red-500"
                  }`}
                  data-testid="whatsapp-status-dot"
                />
                <span className="text-sm font-medium" data-testid="text-whatsapp-status">
                  {whatsappStatus === "connected"
                    ? "Conectado"
                    : whatsappStatus === "connecting" || whatsappStatus === "qr_ready"
                    ? "Conectando..."
                    : "Desconectado"}
                </span>
              </div>
              <Link href="/calendar">
                <Button size="sm" variant="outline" data-testid="btn-whatsapp-settings">
                  Configurações
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
