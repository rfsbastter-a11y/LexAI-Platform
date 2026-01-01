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
import { Search, Plus, Filter, Download, MoreVertical, RefreshCw, CheckCircle2, FileText, Scale, Bot, Loader2, Sparkles } from "lucide-react";
import { useCases, useCaseMovements, useDatajudSearch } from "@/hooks/use-cases";
import { useGeneratePiece } from "@/hooks/use-ai";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";

export default function CasesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState<"input" | "loading" | "review" | "success">("input");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [importNumber, setImportNumber] = useState("");
  const [datajudResult, setDatajudResult] = useState<any>(null);
  const [generatePieceOpen, setGeneratePieceOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [pieceType, setPieceType] = useState("Manifestação");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [generatedPiece, setGeneratedPiece] = useState<any>(null);

  const { data: cases, isLoading } = useCases();
  const { data: movements, isLoading: movementsLoading } = useCaseMovements(selectedCase?.id);
  const datajudSearch = useDatajudSearch();
  const generatePiece = useGeneratePiece();
  const [, navigate] = useLocation();

  const handleImport = async () => {
    setImportStep("loading");
    try {
      const result = await datajudSearch.mutateAsync({ caseNumber: importNumber });
      setDatajudResult(result);
      setImportStep("review");
    } catch (error) {
      console.error("Error searching DataJud:", error);
      setImportStep("input");
    }
  };

  const confirmImport = () => {
    setImportStep("success");
    setTimeout(() => {
      setImportStep("input");
      setIsImporting(false);
      setDatajudResult(null);
      setImportNumber("");
    }, 1500);
  };

  const handleGeneratePiece = async () => {
    if (!selectedCase || !selectedMovement) return;
    
    try {
      const result = await generatePiece.mutateAsync({
        pieceType,
        caseContext: {
          caseNumber: selectedCase.caseNumber,
          court: selectedCase.court,
          caseClass: selectedCase.caseClass || "Procedimento Comum",
          subject: selectedCase.subject || "Não especificado",
        },
        intimationText: selectedMovement.description,
        additionalInstructions,
      });
      setGeneratedPiece(result);
    } catch (error) {
      console.error("Error generating piece:", error);
    }
  };

  const filteredCases = cases?.filter((c: any) =>
    c.caseNumber.includes(searchTerm) ||
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.court.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Processos</h1>
          <p className="text-muted-foreground mt-1">Gestão processual integrada ao DataJud.</p>
        </div>
        <div className="flex gap-2 button-group-responsive">
          <Dialog open={isImporting} onOpenChange={setIsImporting}>
            <DialogTrigger asChild>
              <Button className="gap-2 btn-responsive" data-testid="btn-importar-datajud">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Importar do DataJud</span>
                <span className="sm:hidden">Importar</span>
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
                    <Input 
                      id="process-number" 
                      placeholder="0000000-00.0000.0.00.0000"
                      value={importNumber}
                      onChange={(e) => setImportNumber(e.target.value)}
                    />
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

              {importStep === "review" && datajudResult && (
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Processo Localizado com Sucesso</span>
                  </div>
                  
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{datajudResult.numeroProcesso}</CardTitle>
                      <CardDescription>{datajudResult.orgaoJulgador?.nome || "Tribunal não identificado"}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground text-xs block">Classe</span>
                          <span className="font-medium">{datajudResult.classe?.nome || "Não informada"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block">Assunto</span>
                          <span className="font-medium">{datajudResult.assuntos?.[0]?.nome || "Não informado"}</span>
                        </div>
                      </div>
                      {datajudResult.movimentos?.[0] && (
                        <div className="pt-2 border-t">
                          <span className="text-muted-foreground text-xs block mb-1">Última Movimentação</span>
                          <p className="text-foreground/80">{datajudResult.movimentos[0].nome}</p>
                        </div>
                      )}
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
                  <Button onClick={handleImport} disabled={!importNumber.trim() || datajudSearch.isPending}>
                    {datajudSearch.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Consultar DataJud
                  </Button>
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
          
          <Button variant="outline" className="gap-2 btn-responsive" data-testid="btn-novo-manual">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Manual</span>
            <span className="sm:hidden">Novo</span>
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número / Título</TableHead>
                <TableHead>Tribunal / Vara</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((item: any) => (
                <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCase(item)}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{item.caseNumber}</span>
                      <span className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{item.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.court}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{item.caseType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === "ativo" ? "default" : "secondary"} className="capitalize">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(item.createdAt).toLocaleDateString('pt-BR')}
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
        )}
      </div>

      {/* Case Detail Dialog */}
      {selectedCase && (
        <Dialog open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 border-b">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize">{selectedCase.caseType}</Badge>
                {selectedCase.datajudLastSync && (
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none">DataJud Sync</Badge>
                )}
              </div>
              <DialogTitle className="text-xl">{selectedCase.title}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {selectedCase.caseNumber} • {selectedCase.court}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex">
              <div className="w-64 bg-muted/30 border-r p-4 space-y-6 hidden md:block">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Risco</h4>
                  <Badge variant={selectedCase.riskLevel === "alto" ? "destructive" : "secondary"} className="capitalize">
                    {selectedCase.riskLevel || "Não avaliado"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Valor Estimado</h4>
                  <p className="text-sm font-medium">
                    {selectedCase.estimatedValue 
                      ? `R$ ${Number(selectedCase.estimatedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : "Não informado"
                    }
                  </p>
                </div>
                {selectedCase.tags && selectedCase.tags.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedCase.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="timeline" className="w-full">
                  <div className="border-b px-6 sticky top-0 bg-background z-10">
                    <TabsList className="h-12 bg-transparent space-x-6">
                      <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Movimentações
                      </TabsTrigger>
                      <TabsTrigger value="docs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Documentos
                      </TabsTrigger>
                      <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Dados
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="timeline" className="p-6">
                    {movementsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : movements && movements.length > 0 ? (
                      <div className="relative border-l border-border ml-3 space-y-8 pb-10">
                        {movements.map((event: any, idx: number) => (
                          <div key={idx} className="relative pl-8">
                            <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-background ${event.type === 'Intimação' ? 'bg-red-500' : 'bg-primary'}`} />
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-1">
                              <span className="text-sm font-bold text-foreground">{event.type}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {new Date(event.date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 bg-muted/30 p-3 rounded-md border border-border/50">
                              {event.description}
                            </p>
                            <div className="mt-2 flex gap-2 items-center">
                              <Badge variant="outline" className="text-[10px] h-5">{event.source}</Badge>
                              {(event.type === 'Intimação' || event.type === 'Decisão' || event.type === 'Sentença') && (
                                <Button 
                                  variant="default" 
                                  size="sm" 
                                  className="h-8 text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white ml-auto btn-responsive shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMovement(event);
                                    setGeneratePieceOpen(true);
                                  }}
                                  data-testid={`btn-gerar-peca-${event.id}`}
                                >
                                  <Sparkles className="w-4 h-4" />
                                  Gerar Peça com IA
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Nenhuma movimentação registrada.</p>
                        <p className="text-sm mt-2">Importe dados do DataJud para ver o histórico.</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="docs" className="p-6">
                    <div className="text-center py-10 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>Visualização de documentos em desenvolvimento.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="info" className="p-6">
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-muted-foreground text-xs block">Classe Processual</span>
                          <span className="font-medium">{selectedCase.caseClass || "Não informada"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block">Assunto</span>
                          <span className="font-medium">{selectedCase.subject || "Não informado"}</span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Generate Piece Dialog */}
      <Dialog open={generatePieceOpen} onOpenChange={setGeneratePieceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Gerar Peça Processual com IA
            </DialogTitle>
            <DialogDescription>
              A LexAI irá gerar um rascunho com base na intimação selecionada. Toda peça requer validação humana.
            </DialogDescription>
          </DialogHeader>

          {!generatedPiece ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Tipo de Peça</label>
                <select 
                  className="w-full border rounded-md p-2"
                  value={pieceType}
                  onChange={(e) => setPieceType(e.target.value)}
                >
                  <option value="Manifestação">Manifestação</option>
                  <option value="Contestação">Contestação</option>
                  <option value="Réplica">Réplica</option>
                  <option value="Petição Simples">Petição Simples</option>
                  <option value="Embargos de Declaração">Embargos de Declaração</option>
                  <option value="Recurso">Recurso</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Intimação de Origem</label>
                <div className="bg-muted/50 p-3 rounded-md text-sm">
                  {selectedMovement?.description}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Instruções Adicionais (opcional)</label>
                <Textarea 
                  placeholder="Ex: Focar na questão da prescrição, incluir jurisprudência do STJ..."
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>⚠️ Importante:</strong> Este é um rascunho assistido por IA. Toda produção jurídica deve ser revisada e validada por advogado antes do protocolo.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Peça Gerada com Sucesso</span>
              </div>

              <div className="max-h-[400px] overflow-y-auto bg-muted/30 p-4 rounded-md border">
                <pre className="whitespace-pre-wrap text-sm font-serif">{generatedPiece.content}</pre>
              </div>

              {generatedPiece.citations?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Fontes Citadas</h4>
                  <div className="space-y-2">
                    {generatedPiece.citations.map((cit: any, i: number) => (
                      <div key={i} className="text-xs bg-blue-50 p-2 rounded border border-blue-100">
                        <strong>{cit.source}:</strong> {cit.excerpt}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!generatedPiece ? (
              <>
                <Button variant="outline" onClick={() => setGeneratePieceOpen(false)}>Cancelar</Button>
                <Button 
                  onClick={handleGeneratePiece} 
                  disabled={generatePiece.isPending}
                  className="gap-2"
                >
                  {generatePiece.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Sparkles className="w-4 h-4" />
                  Gerar Peça
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => {
                  setGeneratedPiece(null);
                  setGeneratePieceOpen(false);
                }}>Fechar</Button>
                <Button onClick={() => navigate('/studio')}>
                  Abrir no Estúdio
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
