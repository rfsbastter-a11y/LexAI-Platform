import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, DollarSign, AlertCircle } from "lucide-react";

const MOCK_CONTRACTS = [
  { id: 1, client: "Indústrias Horizonte Ltda", type: "Mensal (Partido)", value: "R$ 12.500,00", status: "Ativo", nextAdjustment: "Jan/2027" },
  { id: 2, client: "Comércio Varejista Central S.A.", type: "Híbrido (Mensal + Êxito)", value: "R$ 8.000,00 + 10%", status: "Ativo", nextAdjustment: "Jun/2026" },
  { id: 3, client: "Roberto Silva", type: "Ad Hoc (Êxito Puro)", value: "20% do Ganho", status: "Finalizado", nextAdjustment: "-" },
];

export default function ContractsPage() {
  return (
    <DashboardLayout>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Contratos</h1>
          <p className="text-muted-foreground mt-1">Gestão de honorários e regras de faturamento.</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Contrato
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-6">
        <div className="bg-card p-6 rounded-lg border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Receita Recorrente (MRR)</p>
              <h3 className="text-2xl font-bold">R$ 45.230,00</h3>
            </div>
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg border shadow-sm">
           <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contratos Ativos</p>
              <h3 className="text-2xl font-bold">24</h3>
            </div>
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg border shadow-sm">
           <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Reajustes Próximos</p>
              <h3 className="text-2xl font-bold">3</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Modelo de Honorários</TableHead>
              <TableHead>Valor / Regra</TableHead>
              <TableHead>Próx. Reajuste</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {MOCK_CONTRACTS.map((contract) => (
              <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-medium">{contract.client}</TableCell>
                <TableCell>
                   <Badge variant="outline">{contract.type}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{contract.value}</TableCell>
                <TableCell className="text-muted-foreground">{contract.nextAdjustment}</TableCell>
                <TableCell>
                  <Badge variant={contract.status === "Ativo" ? "default" : "secondary"}>
                    {contract.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">Editar</Button>
                </TableCell>
              </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </DashboardLayout>
  );
}
