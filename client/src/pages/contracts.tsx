import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, DollarSign, AlertCircle, Loader2 } from "lucide-react";
import { useContracts } from "@/hooks/use-contracts";

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();

  const activeContracts = contracts?.filter((c: any) => c.status === "ativo") || [];
  const totalMRR = activeContracts.reduce((sum: number, c: any) => sum + (Number(c.monthlyValue) || 0), 0);

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Contratos</h1>
          <p className="text-muted-foreground mt-1">Gestão de honorários e regras de faturamento.</p>
        </div>
        <Button className="gap-2 btn-responsive" data-testid="btn-novo-contrato">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Contrato</span>
          <span className="sm:hidden">Novo</span>
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
              <h3 className="text-2xl font-bold">
                R$ {totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
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
              <h3 className="text-2xl font-bold">{activeContracts.length}</h3>
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
              <h3 className="text-2xl font-bold">
                {contracts?.filter((c: any) => {
                  if (!c.nextAdjustmentDate) return false;
                  const adjustDate = new Date(c.nextAdjustmentDate);
                  const threeMonths = new Date();
                  threeMonths.setMonth(threeMonths.getMonth() + 3);
                  return adjustDate <= threeMonths;
                }).length || 0}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
              {contracts?.map((contract: any) => (
                <TableRow key={contract.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">Cliente #{contract.clientId}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{contract.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {contract.monthlyValue 
                      ? `R$ ${Number(contract.monthlyValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : contract.successFeePercent 
                        ? `${contract.successFeePercent}% êxito`
                        : "-"
                    }
                    {contract.monthlyValue && contract.successFeePercent && ` + ${contract.successFeePercent}%`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {contract.nextAdjustmentDate 
                      ? new Date(contract.nextAdjustmentDate).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                      : "-"
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant={contract.status === "ativo" ? "default" : "secondary"} className="capitalize">
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
        )}
      </div>
    </DashboardLayout>
  );
}
