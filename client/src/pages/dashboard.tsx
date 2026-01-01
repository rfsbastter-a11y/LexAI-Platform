import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_STATS, MOCK_CASES, RECENT_DOCS } from "@/lib/mock-data";
import { AlertCircle, ArrowUpRight, Clock, FileText, TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Painel Executivo</h1>
          <p className="text-muted-foreground mt-1">Visão geral e urgências do dia.</p>
        </div>
        <div className="flex gap-2">
          <Button>Nova Ação</Button>
          <Button variant="outline">Relatórios</Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prazos Urgentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DASHBOARD_STATS.urgentDeadlines}</div>
            <p className="text-xs text-muted-foreground">Para os próximos 3 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processos Ativos</CardTitle>
            <ScaleIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DASHBOARD_STATS.activeCases}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-500 flex items-center gap-1">
                +{DASHBOARD_STATS.newCasesThisMonth} este mês <TrendingUp className="w-3 h-3" />
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Estimado</CardTitle>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Mensal</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DASHBOARD_STATS.monthlyBilling}</div>
            <p className="text-xs text-muted-foreground">+12% vs. mês anterior</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eficiência IA</CardTitle>
            <BotIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8h 30min</div>
            <p className="text-xs text-muted-foreground">Economizados nesta semana</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Urgencies List */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Urgências e Prazos</CardTitle>
            <CardDescription>Atividades que requerem atenção imediata.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {MOCK_CASES.filter(c => c.tags.includes("Urgente") || c.tags.includes("Audiência Marcada")).map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className={`p-2 rounded-full ${item.tags.includes("Urgente") ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.court} • {item.number}</p>
                    <div className="flex gap-2 mt-2">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-secondary-foreground/10">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-destructive">
                      {item.nextDeadline ? new Date(item.nextDeadline).toLocaleDateString() : "Hoje"}
                    </span>
                    <p className="text-xs text-muted-foreground">Vencimento</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity / Docs */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Produção Recente</CardTitle>
            <CardDescription>Documentos e peças gerados recentemente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {RECENT_DOCS.map((doc, i) => (
                <div key={i} className="flex items-center justify-between group cursor-pointer hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                      {doc.type}
                    </div>
                    <div>
                      <p className="text-sm font-medium group-hover:text-blue-600 transition-colors">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.date}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="pt-4 border-t">
                <Button variant="outline" className="w-full gap-2">
                  <BotIcon className="w-4 h-4" />
                  Ir para LexAI Estúdio
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function ScaleIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

function BotIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  )
}
