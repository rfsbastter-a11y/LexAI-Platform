import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download, Filter, Calendar as CalendarIcon, FileText, Gavel, Scale, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Mock Data
const PERFORMANCE_DATA = [
  { month: "Jul", novos: 12, finalizados: 8, receita: 45000 },
  { month: "Ago", novos: 15, finalizados: 10, receita: 48000 },
  { month: "Set", novos: 18, finalizados: 12, receita: 52000 },
  { month: "Out", novos: 14, finalizados: 15, receita: 49000 },
  { month: "Nov", novos: 20, finalizados: 14, receita: 58000 },
  { month: "Dez", novos: 16, finalizados: 18, receita: 62000 },
];

const SUCCESS_RATE_DATA = [
  { name: "Procedência Total", value: 45, color: "hsl(142, 76%, 36%)" }, // Green
  { name: "Parcialmente Procedente", value: 30, color: "hsl(38, 92%, 50%)" }, // Yellow
  { name: "Improcedência", value: 15, color: "hsl(0, 84%, 60%)" }, // Red
  { name: "Acordo", value: 10, color: "hsl(217, 91%, 60%)" }, // Blue
];

const PRODUCTIVITY_DATA = [
  { name: "Seg", pecas: 12, audiencias: 2 },
  { name: "Ter", pecas: 15, audiencias: 4 },
  { name: "Qua", pecas: 18, audiencias: 3 },
  { name: "Qui", pecas: 14, audiencias: 5 },
  { name: "Sex", pecas: 10, audiencias: 1 },
];

const FINANCIAL_BREAKDOWN = [
  { area: "Cível", value: 45 },
  { area: "Trabalhista", value: 25 },
  { area: "Tributário", value: 20 },
  { area: "Consultivo", value: 10 },
];

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Relatórios Estratégicos</h1>
            <p className="text-muted-foreground mt-1">Análise de performance, eficiência jurídica e indicadores financeiros.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="w-4 h-4" />
              Últimos 6 meses
            </Button>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              Exportar PDF
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-background border p-1 rounded-lg h-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 rounded-md transition-all">Visão Geral</TabsTrigger>
            <TabsTrigger value="financial" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 rounded-md transition-all">Financeiro</TabsTrigger>
            <TabsTrigger value="operational" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4 rounded-md transition-all">Operacional & Prazos</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Êxito</CardTitle>
                  <Gavel className="h-4 w-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">75%</div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-emerald-500 font-medium">+5%</span> vs. média do mercado
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Novos Processos</CardTitle>
                  <Scale className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">95</div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-emerald-500 font-medium">+12%</span> vs. semestre anterior
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Peças Produzidas</CardTitle>
                  <FileText className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">450</div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-blue-500 font-medium">320</span> com auxílio de IA
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Risco Jurídico</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">R$ 1.2M</div>
                  <p className="text-xs text-muted-foreground">Valor total em contingência</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Entrada vs. Saída de Processos</CardTitle>
                  <CardDescription>Fluxo processual nos últimos 6 meses.</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={PERFORMANCE_DATA}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
                      <YAxis axisLine={false} tickLine={false} fontSize={12} />
                      <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                      />
                      <Legend />
                      <Bar dataKey="novos" name="Novos Casos" fill="hsl(var(--sidebar-primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="finalizados" name="Arquivados/Finalizados" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Resultado das Demandas</CardTitle>
                  <CardDescription>Desfecho dos processos julgados no período.</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={SUCCESS_RATE_DATA}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {SUCCESS_RATE_DATA.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend layout="vertical" verticalAlign="middle" align="right" />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Financial Tab */}
          <TabsContent value="financial" className="space-y-6">
             <div className="grid gap-6 md:grid-cols-3">
               <Card className="col-span-2">
                 <CardHeader>
                   <CardTitle>Evolução da Receita</CardTitle>
                   <CardDescription>Crescimento mensal de honorários contratuais e sucumbenciais.</CardDescription>
                 </CardHeader>
                 <CardContent className="h-[350px]">
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={PERFORMANCE_DATA}>
                       <defs>
                         <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                       <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
                       <YAxis axisLine={false} tickLine={false} fontSize={12} tickFormatter={(val) => `R$${val/1000}k`} />
                       <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value) => [`R$ ${value},00`, "Receita"]} />
                       <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorReceita)" />
                     </AreaChart>
                   </ResponsiveContainer>
                 </CardContent>
               </Card>
               
               <Card className="col-span-1">
                 <CardHeader>
                   <CardTitle>Receita por Área</CardTitle>
                   <CardDescription>Distribuição de faturamento.</CardDescription>
                 </CardHeader>
                 <CardContent className="h-[350px] flex items-center justify-center">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={FINANCIAL_BREAKDOWN}
                         cx="50%"
                         cy="50%"
                         outerRadius={80}
                         dataKey="value"
                         label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                       >
                         {FINANCIAL_BREAKDOWN.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${index + 1}))`} />
                         ))}
                       </Pie>
                       <Tooltip />
                     </PieChart>
                   </ResponsiveContainer>
                 </CardContent>
               </Card>
             </div>
          </TabsContent>

          {/* Operational Tab */}
           <TabsContent value="operational" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Produtividade da Equipe (Semanal)</CardTitle>
                  <CardDescription>Volume de peças e audiências realizadas.</CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={PRODUCTIVITY_DATA}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend />
                      <Bar dataKey="pecas" name="Peças Processuais" fill="hsl(var(--sidebar-primary))" radius={[4, 4, 0, 0]} barSize={40} />
                      <Bar dataKey="audiencias" name="Audiências" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
           </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
