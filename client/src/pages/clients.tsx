import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Upload, CheckCircle2, Loader2, Building2, User } from "lucide-react";
import { useState } from "react";
import { useClients } from "@/hooks/use-clients";

export default function ClientsPage() {
  const [isAdding, setIsAdding] = useState(false);
  const [addStep, setAddStep] = useState<"upload" | "extracting" | "form">("upload");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: clients, isLoading } = useClients();

  const handleUpload = () => {
    setAddStep("extracting");
    setTimeout(() => {
      setAddStep("form");
    }, 2000);
  };

  const filteredClients = clients?.filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.document.includes(searchTerm)
  ) || [];

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gestão de base de clientes com extração automática de dados.</p>
        </div>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="gap-2 btn-responsive" data-testid="btn-novo-cliente">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Cliente</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Cadastro de Cliente</DialogTitle>
              <DialogDescription>
                A LexAI exige um documento vinculante (Contrato Social, Procuração ou RG/CNH) para iniciar o cadastro.
              </DialogDescription>
            </DialogHeader>

            {addStep === "upload" && (
              <div className="py-8">
                <div 
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={handleUpload}
                >
                  <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">Upload de Documento Vinculante</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Arraste o Contrato Social ou Documento Pessoal aqui. A IA extrairá os dados automaticamente.
                  </p>
                </div>
              </div>
            )}

            {addStep === "extracting" && (
              <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <div>
                  <h3 className="font-semibold text-lg">Analisando Documento...</h3>
                  <p className="text-muted-foreground text-sm">Extraindo Razão Social, CNPJ, Endereço e Sócios.</p>
                </div>
              </div>
            )}

            {addStep === "form" && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Dados extraídos com confiança de 98%</span>
                </div>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Input value="Pessoa Jurídica" readOnly className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Documento (CNPJ)</label>
                      <Input defaultValue="45.123.001/0001-99" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Razão Social</label>
                    <Input defaultValue="Nova Tech Soluções Digitais Ltda" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Endereço (Sede)</label>
                    <Input defaultValue="Av. Paulista, 1000, Andar 12, São Paulo - SP" />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {addStep === "form" ? (
                <>
                  <Button variant="outline" onClick={() => setAddStep("upload")}>Voltar</Button>
                  <Button onClick={() => { setIsAdding(false); setAddStep("upload"); }}>Confirmar Cadastro</Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 bg-card p-4 rounded-lg border shadow-sm mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            className="pl-9 border-none bg-muted/50 focus:bg-background transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Nome / Razão Social</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Cliente Desde</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client: any) => (
                <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground">
                      {client.type === "PJ" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{client.document}</TableCell>
                  <TableCell>{new Date(client.createdAt).getFullYear()}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === "ativo" ? "default" : "secondary"} className="capitalize">
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Ver Detalhes</Button>
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
