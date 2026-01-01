import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Filter, Download, MoreVertical, RefreshCw, CheckCircle2, AlertTriangle, FileText, Gavel, Scale, Bot } from "lucide-react";
import { MOCK_CASES, DATAJUD_TIMELINE_MOCK } from "@/lib/mock-data";

export default function CasesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState<"input" | "loading" | "review" | "success">("input");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const handleImport = () => {
    setImportStep("loading");
    // Simulate API call to DataJud
    setTimeout(() => {
      setImportStep("review");
    }, 2000);
  };

  const confirmImport = () => {
    setImportStep("success");
    // In a real app, this would add the case to the list
    setTimeout(() => {
      setImportStep("input");
      setIsImporting(false);
    }, 1500);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Processos</h1>
          <p className="text-muted-foreground mt-1">Gestão processual integrada ao DataJud.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isImporting} onOpenChange={setIsImporting}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Download className="w-4 h-4" />
                Importar do DataJud
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Importação via DataJud (CNJ)</DialogTitle>
                <DialogDescription>
                  Digite o número do processo (CNJ) ou CPF/CNPJ para buscar na base unificada.
                </DialogDescription>
              </DialogHeader>

              {importStep === "input" && (
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label htmlFor="process-number" className="text-sm font-medium">Número do Processo / CPF / CNPJ</label>
                    <Input id="process-number" placeholder="0000000-00.0000.0.00.0000" />
                  </div>
                  <div className="bg-blue-50 p-3 rounded-md flex gap-2 text-sm text-blue-700">
                    <Scale className="w-5 h-5 flex-shrink-0" />
                    <p>
                      A LexAI consultará a API pública do DataJud para extrair metadados, partes, classe e últimas movimentações automaticamente.
                    </p>
                  </div>
                </div>
              )}

              {importStep === "loading" && (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                  <RefreshCw className="w-10 h-10 animate-spin text-primary" />
                  <div>
                    <h3 className="font-semibold text-lg">Consultando DataJud...</h3>
                    <p className="text-muted-foreground text-sm">Validando chaves e buscando metadados nos tribunais.</p>
                  </div>
                </div>
              )}

              {importStep === "review" && (
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Processo Localizado com Sucesso</span>
                  </div>
                  
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">5001234-56.2025.8.13.0024</CardTitle>
                      <CardDescription>TJMG • 12ª Vara Cível de Belo Horizonte</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground text-xs block">Classe</span>
                          <span className="font-medium">Procedimento Comum Cível</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block">Assunto</span>
                          <span className="font-medium">Indenização por Dano Material</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground text-xs block mb-1">Última Movimentação (28/12/2025)</span>
                        <p className="text-foreground/80">Expedição de intimação para manifestação sobre laudo pericial.</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {importStep === "success" && (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center text-green-600">
                  <CheckCircle2 className="w-16 h-16" />
                  <div>
                    <h3 className="font-semibold text-lg">Importação Concluída</h3>
                    <p className="text-muted-foreground text-sm">O processo foi cadastrado e a agenda de prazos foi atualizada.</p>
                  </div>
                </div>
              )}

              <DialogFooter>
                {importStep === "input" && (
                  <Button onClick={handleImport}>Consultar DataJud</Button>
                )}
                {importStep === "review" && (
                  <>
                    <Button variant="outline" onClick={() => setImportStep("input")}>Voltar</Button>
                    <Button onClick={confirmImport}>Confirmar Importação</Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Manual
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, parte, tag ou tribunal..."
            className="pl-9 border-none bg-muted/50 focus:bg-background transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="icon">
          <Filter className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número / Título</TableHead>
              <TableHead>Tribunal / Vara</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última Atualização</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_CASES.map((item) => (
              <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCase(item)}>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span>{item.number}</span>
                    <span className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{item.title}</span>
                  </div>
                </TableCell>
                <TableCell>{item.court}</TableCell>
                <TableCell>{item.client}</TableCell>
                <TableCell>
                  <Badge variant={item.status === "Ativo" ? "default" : "secondary"}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(item.lastUpdate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Case Detail Sheet/Panel */}
      {selectedCase && (
        <Dialog open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 border-b">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{selectedCase.type}</Badge>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none">DataJud Sync</Badge>
              </div>
              <DialogTitle className="text-xl">{selectedCase.title}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {selectedCase.number} • {selectedCase.court}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex">
              <div className="w-64 bg-muted/30 border-r p-4 space-y-6 hidden md:block">
                 <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Cliente</h4>
                   <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">IH</div>
                      <span className="text-sm font-medium">{selectedCase.client}</span>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Tags</h4>
                   <div className="flex flex-wrap gap-1">
                     {selectedCase.tags.map((tag: string) => (
                       <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                     ))}
                   </div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                 <Tabs defaultValue="timeline" className="w-full">
                    <div className="border-b px-6 sticky top-0 bg-background z-10">
                      <TabsList className="h-12 bg-transparent space-x-6">
                        <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">Movimentações (DataJud)</TabsTrigger>
                        <TabsTrigger value="docs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">Peças & Documentos</TabsTrigger>
                        <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">Dados do Processo</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="timeline" className="p-6">
                      <div className="relative border-l border-border ml-3 space-y-8 pb-10">
                        {DATAJUD_TIMELINE_MOCK.map((event, idx) => (
                          <div key={idx} className="relative pl-8">
                             <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-background ${event.type === 'Intimação' ? 'bg-red-500' : 'bg-primary'}`} />
                             <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-1">
                                <span className="text-sm font-bold text-foreground">{event.type}</span>
                                <span className="text-xs text-muted-foreground font-mono">{new Date(event.date).toLocaleDateString()}</span>
                             </div>
                             <p className="text-sm text-foreground/80 bg-muted/30 p-3 rounded-md border border-border/50">
                               {event.description}
                             </p>
                             <div className="mt-2 flex gap-2 items-center">
                               <Badge variant="outline" className="text-[10px] h-5">{event.source}</Badge>
                               {event.type === 'Intimação' && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   className="h-6 text-[10px] gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 ml-auto"
                                   onClick={() => window.location.href = '/studio'}
                                 >
                                   <Bot className="w-3 h-3" />
                                   Gerar Peça com IA
                                 </Button>
                               )}
                             </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="docs" className="p-6">
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Visualização de documentos em desenvolvimento.</p>
                      </div>
                    </TabsContent>
                 </Tabs>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
