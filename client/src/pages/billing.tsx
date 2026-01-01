import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Download, Filter } from "lucide-react";

const DATA = [
  { name: "Jan", faturado: 40000, recebido: 38000 },
  { name: "Fev", faturado: 42000, recebido: 39000 },
  { name: "Mar", faturado: 45000, recebido: 41000 },
  { name: "Abr", faturado: 43000, recebido: 43000 },
  { name: "Mai", faturado: 48000, recebido: 45000 },
  { name: "Jun", faturado: 52000, recebido: 48000 },
];

export default function BillingPage() {
  return (
    <DashboardLayout>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Financeiro</h1>
          <p className="text-muted-foreground mt-1">Faturamento baseado em contratos e controle de inadimplência.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtrar
           </Button>
           <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Relatório
           </Button>
        </div>
      </div>

      <div className="grid gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Faturamento vs. Recebimento (Semestral)</CardTitle>
            <CardDescription>Análise de fluxo de caixa e inadimplência.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DATA}>
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="faturado" name="Faturado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="hsl(var(--sidebar-primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
