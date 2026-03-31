import { useState } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Shield,
  Users,
  FileText,
  Scale,
  DollarSign,
  Send,
  X,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  AlertCircle,
  CheckCircle2,
  Target,
  Briefcase,
} from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type TabId = "financeiro" | "contratos" | "clientes" | "performance" | "risco";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("financeiro");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/reports/summary"],
    queryFn: async () => {
      const res = await fetch("/api/reports/summary", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleGenerateDiagnostico = async () => {
    if (!data) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/reports/ai-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ firmData: data }),
      });
      const result = await res.json();
      setAiAnalysis(result.analysis || "");
    } catch {
      setAiAnalysis("Erro ao gerar diagnóstico. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAskLexAI = async () => {
    if (!userQuery || !data) return;
    setIsAnswering(true);
    try {
      const res = await fetch("/api/reports/ai-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ firmData: data, question: userQuery }),
      });
      const result = await res.json();
      setQueryResult(result.analysis || "");
    } catch {
      setQueryResult("Erro na consulta. Tente novamente.");
    } finally {
      setIsAnswering(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "financeiro", label: "Financeiro Executivo", icon: <DollarSign className="w-4 h-4" /> },
    { id: "contratos", label: "Gestão de Contratos", icon: <FileText className="w-4 h-4" /> },
    { id: "clientes", label: "Análise de Carteira", icon: <Users className="w-4 h-4" /> },
    { id: "performance", label: "Performance", icon: <Activity className="w-4 h-4" /> },
    { id: "risco", label: "Risco e Alertas", icon: <Shield className="w-4 h-4" /> },
  ];

  const getCashHealth = () => {
    if (!data) return { label: "Carregando...", color: "text-muted-foreground", description: "", ratio: 0 };
    const { financeiro } = data;
    const ratio = financeiro.receitaMensal > 0 ? financeiro.totalRecebido / financeiro.receitaMensal : 0;
    const pct = Math.round(ratio * 100);
    if (ratio >= 0.8) return { label: `EXCELENTE — ${pct}% recebido`, color: "text-emerald-500", description: "Fluxo de caixa saudável com boa taxa de recebimento.", ratio };
    if (ratio >= 0.5) return { label: `BOM — ${pct}% recebido`, color: "text-blue-500", description: "Fluxo razoável, mas há espaço para melhorar cobranças.", ratio };
    if (ratio >= 0.2) return { label: `ATENÇÃO — ${pct}% recebido`, color: "text-amber-500", description: "Taxa de recebimento baixa. Revise a política de cobrança.", ratio };
    return { label: `CRÍTICO — ${pct}% recebido`, color: "text-red-500", description: "Fluxo de caixa comprometido. Ações urgentes necessárias.", ratio };
  };

  const cashHealth = getCashHealth();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6" data-testid="page-reports">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-reports-title">
              Relatórios de Gestão
            </h1>
            <p className="text-muted-foreground mt-1">Painel executivo e diagnóstico de saúde do escritório</p>
          </div>
          <Button
            onClick={handleGenerateDiagnostico}
            disabled={isGenerating || isLoading}
            className="gap-2"
            data-testid="btn-generate-diagnostic"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isGenerating ? "Analisando dados..." : "Gerar Diagnóstico LexAI"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Alertas Gerenciais Automáticos */}
            {data?.alertas && data.alertas.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="section-alerts">
                {data.alertas.map((alerta: any, idx: number) => {
                  const configMap: Record<string, { border: string; bg: string; icon: React.ReactNode; titleColor: string }> = {
                    danger: { border: "border-red-500/30", bg: "bg-red-500/5", icon: <AlertTriangle className="w-5 h-5 text-red-500" />, titleColor: "text-red-500" },
                    warning: { border: "border-amber-500/30", bg: "bg-amber-500/5", icon: <AlertCircle className="w-5 h-5 text-amber-500" />, titleColor: "text-amber-600" },
                    info: { border: "border-blue-500/30", bg: "bg-blue-500/5", icon: <TrendingUp className="w-5 h-5 text-blue-500" />, titleColor: "text-blue-600" },
                  };
                  const config = configMap[alerta.type] || { border: "border-muted", bg: "bg-muted/5", icon: <AlertCircle className="w-5 h-5" />, titleColor: "text-foreground" };

                  return (
                    <Card key={idx} className={`${config.border} ${config.bg} border`} data-testid={`card-alert-${idx}`}>
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">{config.icon}</div>
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wider ${config.titleColor}`}>{alerta.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{alerta.message}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Diagnóstico IA */}
            {aiAnalysis && (
              <Card className="border-t-4 border-t-primary" data-testid="card-ai-diagnostic">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-lg">Relatório Estratégico LexAI</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setAiAnalysis(null)} data-testid="btn-close-diagnostic">
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                    {aiAnalysis}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar" data-testid="nav-report-tabs">
              {tabs.map(tab => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "outline"}
                  size="sm"
                  className="gap-2 whitespace-nowrap"
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`tab-${tab.id}`}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {/* FINANCEIRO EXECUTIVO */}
              {activeTab === "financeiro" && data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="tab-content-financeiro">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Receita Consolidada
                      </CardTitle>
                      <CardDescription>Evolução nos últimos 6 meses (fixa vs variável)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.financeiro.historico}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="mes" axisLine={false} tickLine={false} fontSize={12} />
                          <YAxis axisLine={false} tickLine={false} fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                          <Tooltip
                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                            formatter={(value: number) => [formatCurrency(value), ""]}
                          />
                          <Legend />
                          <Bar dataKey="fixa" name="Receita Fixa" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={24} />
                          <Bar dataKey="variavel" name="Receita Variável" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card data-testid="card-receita-mensal">
                        <CardContent className="p-5">
                          <p className="text-xs text-muted-foreground font-medium">Receita Contratual</p>
                          <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(data.financeiro.receitaMensal)}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">mensal ativa</p>
                        </CardContent>
                      </Card>
                      <Card data-testid="card-previsao">
                        <CardContent className="p-5">
                          <p className="text-xs text-muted-foreground font-medium">Previsão 60 dias</p>
                          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(data.financeiro.previsao60dias)}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">projeção estimada</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card data-testid="card-cash-health">
                      <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Saúde do Caixa</p>
                        <p className={`text-4xl font-black tracking-tight ${cashHealth.color}`}>{cashHealth.label}</p>
                        <p className="text-xs text-muted-foreground mt-3 max-w-[250px]">{cashHealth.description}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          Ações Financeiras Prioritárias
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {data.performance.overdueCount > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <span>Cobrar {data.performance.overdueCount} fatura(s) em atraso ({formatCurrency(data.performance.totalInadimplencia)})</span>
                          </div>
                        )}
                        {data.contratos.vencendo30dias > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>Renovar {data.contratos.vencendo30dias} contrato(s) com vencimento próximo</span>
                          </div>
                        )}
                        {data.financeiro.pendenteCobranca > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span>Recuperar {formatCurrency(data.financeiro.pendenteCobranca)} em cobranças pendentes</span>
                          </div>
                        )}
                        {cashHealth.ratio < 0.5 && (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <span>Aumentar taxa de recebimento — apenas {Math.round(cashHealth.ratio * 100)}% do faturado foi efetivamente recebido</span>
                          </div>
                        )}
                        {data.performance.overdueCount === 0 && data.contratos.vencendo30dias === 0 && data.financeiro.pendenteCobranca === 0 && cashHealth.ratio >= 0.5 && (
                          <div className="flex items-center gap-2 text-sm text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Nenhuma ação urgente no momento</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* GESTÃO DE CONTRATOS */}
              {activeTab === "contratos" && data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="tab-content-contratos">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-primary" />
                        Perfil de Contratos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[280px]">
                      {data.contratos.distribuicao.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.contratos.distribuicao}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={85}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {data.contratos.distribuicao.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend layout="horizontal" verticalAlign="bottom" />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                          Nenhum contrato cadastrado
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="lg:col-span-2 space-y-4">
                    {[
                      { label: "Contratos Ativos", value: data.contratos.ativos, sub: `de ${data.contratos.total} total`, icon: <Briefcase className="w-5 h-5 text-primary" /> },
                      { label: "Vencimento em 30 dias", value: data.contratos.vencendo30dias, sub: "Ação comercial necessária", icon: <AlertCircle className="w-5 h-5 text-amber-500" /> },
                      { label: "Clientes Inadimplentes", value: data.contratos.inadimplentes, sub: "Com faturas em atraso", icon: <AlertTriangle className="w-5 h-5 text-red-500" /> },
                    ].map((item, i) => (
                      <Card key={i} className="hover:border-primary/50 transition-colors" data-testid={`card-contract-metric-${i}`}>
                        <CardContent className="p-5 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            {item.icon}
                            <div>
                              <p className="text-sm font-medium">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.sub}</p>
                            </div>
                          </div>
                          <div className="text-3xl font-bold">{item.value}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* ANÁLISE DE CARTEIRA */}
              {activeTab === "clientes" && data && (
                <div className="space-y-6" data-testid="tab-content-clientes">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card data-testid="card-total-clients">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Base de Clientes</p>
                        <p className="text-3xl font-bold mt-1">{data.clientes.total}</p>
                      </CardContent>
                    </Card>
                    <Card data-testid="card-concentracao">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Concentração Top 3</p>
                        <p className={`text-3xl font-bold mt-1 ${data.clientes.concentracaoPct >= 60 ? "text-red-500" : data.clientes.concentracaoPct >= 40 ? "text-amber-500" : "text-emerald-500"}`}>
                          {data.clientes.concentracaoPct}%
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="md:col-span-2" data-testid="card-dependencia">
                      <CardContent className="p-5 flex items-center gap-3">
                        <Shield className={`w-6 h-6 shrink-0 ${data.clientes.concentracaoPct >= 60 ? "text-red-500" : "text-amber-500"}`} />
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Análise de Dependência</p>
                          <p className="text-sm font-medium mt-0.5">{data.clientes.dependenciaFinanceira}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Top Clientes em Rentabilidade
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.clientes.topRentaveis.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                          {data.clientes.topRentaveis.map((client: any, i: number) => (
                            <Card key={i} className="hover:border-primary/50 transition-colors" data-testid={`card-top-client-${i}`}>
                              <CardContent className="p-4 text-center">
                                <Badge variant={i === 0 ? "default" : "secondary"} className="mb-2">#{i + 1}</Badge>
                                <p className="text-sm font-semibold truncate">{client.name}</p>
                                <p className="text-xs text-primary font-medium mt-1">{formatCurrency(client.revenue)}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma fatura registrada para calcular rentabilidade.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* PERFORMANCE */}
              {activeTab === "performance" && data && (
                <div className="space-y-6" data-testid="tab-content-performance">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card data-testid="card-total-cases">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Processos Totais</p>
                          <Scale className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-2xl font-bold mt-1">{data.processos.total}</p>
                      </CardContent>
                    </Card>
                    <Card data-testid="card-active-cases">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Processos Ativos</p>
                          <Activity className="w-4 h-4 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold mt-1">{data.processos.ativos}</p>
                      </CardContent>
                    </Card>
                    <Card data-testid="card-faturas-emitidas">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Faturas Emitidas</p>
                          <FileText className="w-4 h-4 text-orange-500" />
                        </div>
                        <p className="text-2xl font-bold mt-1">{data.performance.faturasEmitidas}</p>
                      </CardContent>
                    </Card>
                    <Card data-testid="card-taxa-recebimento">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Taxa Recebimento</p>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        </div>
                        <p className="text-2xl font-bold mt-1">{data.performance.taxaRecebimento}%</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Novos Processos por Mês</CardTitle>
                      <CardDescription>Entrada de processos nos últimos 6 meses</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.processos.historico}>
                          <defs>
                            <linearGradient id="colorNovos" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="mes" axisLine={false} tickLine={false} fontSize={12} />
                          <YAxis axisLine={false} tickLine={false} fontSize={12} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                          <Area type="monotone" dataKey="novos" name="Novos processos" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorNovos)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* RISCO E ALERTAS */}
              {activeTab === "risco" && data && (
                <div className="space-y-6" data-testid="tab-content-risco">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className={`border-l-4 ${data.clientes.concentracaoPct >= 60 ? "border-l-red-500" : data.clientes.concentracaoPct >= 40 ? "border-l-amber-500" : "border-l-emerald-500"}`}>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Risco de Concentração</p>
                        <p className={`text-2xl font-bold mt-2 ${data.clientes.concentracaoPct >= 60 ? "text-red-500" : data.clientes.concentracaoPct >= 40 ? "text-amber-500" : "text-emerald-500"}`}>
                          {data.clientes.concentracaoPct >= 60 ? "ALTO" : data.clientes.concentracaoPct >= 40 ? "MÉDIO" : "BAIXO"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{data.clientes.dependenciaFinanceira}</p>
                      </CardContent>
                    </Card>
                    <Card className={`border-l-4 ${data.performance.overdueCount > 5 ? "border-l-red-500" : data.performance.overdueCount > 0 ? "border-l-amber-500" : "border-l-emerald-500"}`}>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Risco de Inadimplência</p>
                        <p className={`text-2xl font-bold mt-2 ${data.performance.overdueCount > 5 ? "text-red-500" : data.performance.overdueCount > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                          {data.performance.overdueCount > 5 ? "ALTO" : data.performance.overdueCount > 0 ? "MODERADO" : "BAIXO"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{data.performance.overdueCount} fatura(s) em atraso - {formatCurrency(data.performance.totalInadimplencia)}</p>
                      </CardContent>
                    </Card>
                    <Card className={`border-l-4 ${data.contratos.vencendo30dias > 3 ? "border-l-red-500" : data.contratos.vencendo30dias > 0 ? "border-l-amber-500" : "border-l-emerald-500"}`}>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Risco Contratual</p>
                        <p className={`text-2xl font-bold mt-2 ${data.contratos.vencendo30dias > 3 ? "text-red-500" : data.contratos.vencendo30dias > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                          {data.contratos.vencendo30dias > 3 ? "ALTO" : data.contratos.vencendo30dias > 0 ? "MODERADO" : "BAIXO"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{data.contratos.vencendo30dias} contrato(s) vencendo em 30 dias</p>
                      </CardContent>
                    </Card>
                  </div>

                  {data.alertas && data.alertas.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="w-5 h-5 text-primary" />
                          Alertas Detalhados
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {data.alertas.map((alerta: any, idx: number) => (
                          <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${
                            alerta.type === "danger" ? "border-red-200 bg-red-50" :
                            alerta.type === "warning" ? "border-amber-200 bg-amber-50" :
                            "border-blue-200 bg-blue-50"
                          }`}>
                            {alerta.type === "danger" ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> :
                             alerta.type === "warning" ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> :
                             <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                            <div>
                              <p className="text-sm font-medium">{alerta.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{alerta.message}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <p className="text-sm font-medium">Nenhum alerta de risco ativo</p>
                        <p className="text-xs text-muted-foreground mt-1">O escritório está operando dentro dos parâmetros ideais.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>

            {/* Consultor Executivo LexAI */}
            <Card className="border-primary/20" data-testid="card-consultor-lexai">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Consultor Executivo LexAI</p>
                    <p className="text-xs text-muted-foreground">Pergunte sobre finanças, performance ou gestão do escritório</p>
                  </div>
                </div>

                {queryResult && (
                  <div className="mb-4 p-4 rounded-lg border-l-4 border-l-primary bg-muted/30">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{queryResult}</p>
                    <button onClick={() => setQueryResult(null)} className="text-xs text-primary font-medium mt-2 hover:underline">
                      Limpar resposta
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Ex: 'Onde estamos perdendo dinheiro?' ou 'Resuma o mês'..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleAskLexAI()}
                    data-testid="input-consultor-query"
                  />
                  <Button
                    onClick={handleAskLexAI}
                    disabled={isAnswering || !userQuery}
                    className="gap-2"
                    data-testid="btn-ask-lexai"
                  >
                    {isAnswering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Perguntar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
