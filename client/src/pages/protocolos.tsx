import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, CheckCircle2, ClipboardList, Copy, ExternalLink, FileText, Loader2, Stamp } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { protocolPackagesApi } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  preparando: "Preparando",
  pronto_para_conferencia: "Pronto para conferência",
  protocolado: "Protocolado",
  erro: "Erro",
  cancelado: "Cancelado",
};

const STATUS_CLASSES: Record<string, string> = {
  preparando: "bg-slate-100 text-slate-700",
  pronto_para_conferencia: "bg-amber-100 text-amber-800",
  protocolado: "bg-green-100 text-green-800",
  erro: "bg-red-100 text-red-800",
  cancelado: "bg-zinc-100 text-zinc-600",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function buildPdpjIntercorrentePayload(pkg: any) {
  const protocolData = pkg?.protocolData || {};
  const attachments = Array.isArray(pkg?.attachments) ? pkg.attachments : [];
  return protocolData.pdpjIntercorrente || {
    schema: "lexai.pdpj.intercorrente.v1",
    tipoPeticionamento: "INTERCORRENTE",
    numeroProcesso: pkg?.caseNumber || null,
    tribunal: pkg?.court || null,
    documentoPrincipal: {
      titulo: pkg?.mainDocumentTitle || pkg?.title || "Peticao intercorrente",
      formatoOrigem: "html",
      obrigatorio: true,
    },
    documentos: attachments.map((attachment: any, index: number) => ({
      ordem: index + 1,
      nome: attachment.name,
      tipo: attachment.type || "application/octet-stream",
      origem: attachment.source || "arquivo",
      textoExtraido: !!attachment.hasExtractedText,
    })),
    metadados: {
      classeJudicial: protocolData?.dadosIniciais?.classeJudicial || null,
      assuntoSugerido: protocolData?.assunto?.sugestao || null,
      codigoAssunto: protocolData?.assunto?.codigo || null,
      procurador: protocolData?.procurador || null,
    },
    pendencias: [
      !pkg?.caseNumber ? "Informar numero do processo antes do protocolo." : null,
      attachments.length === 0 ? "Conferir se ha anexos obrigatorios para a peticao." : null,
    ].filter(Boolean),
  };
}

export default function ProtocolosPage() {
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [protocolNumber, setProtocolNumber] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [pdpjResult, setPdpjResult] = useState<any | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["protocol-packages"],
    queryFn: protocolPackagesApi.getAll,
  });

  const markProtocolado = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status: string; protocolNumber?: string; receiptUrl?: string } }) =>
      protocolPackagesApi.updateStatus(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["protocol-packages"] });
      setSelectedPackage(updated);
      toast({ title: "Protocolo marcado como protocolado." });
    },
    onError: (err) => {
      toast({
        title: "Erro ao atualizar protocolo",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const validatePdpj = useMutation({
    mutationFn: (id: number) => protocolPackagesApi.validatePdpj(id),
    onSuccess: (result) => {
      setPdpjResult(result);
      toast({
        title: result.ok ? "Pacote validado para PDPJ." : "Pacote com pendências PDPJ.",
        description: result.errors?.[0] || result.warnings?.[0],
        variant: result.ok ? "default" : "destructive",
      });
    },
    onError: (err) => {
      toast({
        title: "Erro ao validar PDPJ",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const submitPdpj = useMutation({
    mutationFn: (id: number) => protocolPackagesApi.submitPdpj(id),
    onSuccess: (result) => {
      setPdpjResult(result);
      queryClient.invalidateQueries({ queryKey: ["protocol-packages"] });
      toast({
        title: result.dryRun ? "Dry-run PDPJ concluído." : "Enviado ao PDPJ.",
        description: result.message || "Resultado recebido.",
      });
    },
    onError: (err) => {
      toast({
        title: "Erro ao enviar PDPJ",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const openDetails = async (pkg: any) => {
    try {
      const full = await protocolPackagesApi.getById(pkg.id);
      setSelectedPackage(full);
      setProtocolNumber(full.protocolNumber || "");
      setReceiptUrl(full.receiptUrl || "");
      setPdpjResult(null);
    } catch (err) {
      toast({
        title: "Erro ao abrir pacote",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const protocolData = selectedPackage?.protocolData || {};
  const attachments = Array.isArray(selectedPackage?.attachments) ? selectedPackage.attachments : [];
  const pdpjPayload = selectedPackage ? buildPdpjIntercorrentePayload(selectedPackage) : null;

  const copyPdpjPayload = async () => {
    if (!pdpjPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(pdpjPayload, null, 2));
      toast({ title: "Payload PDPJ copiado." });
    } catch {
      toast({ title: "Erro ao copiar payload.", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="page-protocolos">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Stamp className="w-7 h-7 text-blue-700" />
              Protocolos
            </h1>
            <p className="text-muted-foreground">
              Pacotes de petição intercorrente preparados no Estúdio para conferência e protocolo.
            </p>
          </div>
          <Button onClick={() => window.location.href = "/studio"} data-testid="btn-open-studio">
            <FileText className="w-4 h-4 mr-2" />
            Preparar no Estúdio
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Peticionamento Intercorrente</CardTitle>
            <CardDescription>
              Esta primeira versão salva a peça principal, anexos e metadados para protocolo manual conferido pelo advogado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Carregando pacotes...
              </div>
            ) : packages.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                Nenhum pacote preparado ainda. Gere uma peça no Estúdio e use “Salvar pacote intercorrente”.
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map((pkg: any) => (
                  <div key={pkg.id} className="border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{pkg.title}</h3>
                        <Badge className={STATUS_CLASSES[pkg.status] || STATUS_CLASSES.preparando}>
                          {STATUS_LABELS[pkg.status] || pkg.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {pkg.caseNumber ? `Processo ${pkg.caseNumber}` : "Processo não informado"}
                        {pkg.court ? ` · ${pkg.court}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Preparado em {formatDate(pkg.preparedAt)} · {Array.isArray(pkg.attachments) ? pkg.attachments.length : 0} anexo(s)
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => openDetails(pkg)} data-testid={`btn-open-protocol-${pkg.id}`}>
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Conferir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedPackage} onOpenChange={(open) => !open && setSelectedPackage(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedPackage?.title}</DialogTitle>
            <DialogDescription>
              Confira a peça, os anexos e os dados antes de protocolar no sistema do tribunal.
            </DialogDescription>
          </DialogHeader>

          {selectedPackage && (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-0">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dados do pacote</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <div>
                        <Badge className={STATUS_CLASSES[selectedPackage.status] || STATUS_CLASSES.preparando}>
                          {STATUS_LABELS[selectedPackage.status] || selectedPackage.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Processo</Label>
                      <p>{selectedPackage.caseNumber || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Tribunal</Label>
                      <p>{selectedPackage.court || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Preparado em</Label>
                      <p>{formatDate(selectedPackage.preparedAt)}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>Tipo:</strong> Petição intercorrente</div>
                    <div><strong>Número do processo:</strong> {selectedPackage.caseNumber || "-"}</div>
                    <div><strong>Classe:</strong> {protocolData?.dadosIniciais?.classeJudicial || "-"}</div>
                    <div><strong>Assunto:</strong> {protocolData?.assunto?.sugestao || "-"}</div>
                    <div><strong>Procurador:</strong> {protocolData?.procurador?.nome || "-"}</div>
                    <div><strong>OAB:</strong> {protocolData?.procurador?.oab || "-"}</div>
                    <div><strong>Anexos:</strong> {attachments.length}</div>
                    {pdpjPayload?.pendencias?.length > 0 ? (
                      <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                        <div className="flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          Pendências
                        </div>
                        <ul className="mt-1 list-disc pl-4 text-xs">
                          {pdpjPayload.pendencias.map((item: string) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-green-800 flex items-center gap-1 text-xs">
                        <Check className="w-3 h-3" />
                        Checklist mínimo pronto para conferência.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Payload PDPJ futuro</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Estrutura interna para futura integração via API oficial. Hoje serve para conferência e validação do pacote.
                    </p>
                    <Button variant="outline" className="w-full" onClick={copyPdpjPayload} data-testid="btn-copy-pdpj-payload">
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar JSON
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={validatePdpj.isPending}
                      onClick={() => validatePdpj.mutate(selectedPackage.id)}
                      data-testid="btn-validate-pdpj"
                    >
                      {validatePdpj.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Validar PDPJ
                    </Button>
                    <Button
                      className="w-full"
                      disabled={submitPdpj.isPending}
                      onClick={() => submitPdpj.mutate(selectedPackage.id)}
                      data-testid="btn-submit-pdpj"
                    >
                      {submitPdpj.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stamp className="w-4 h-4 mr-2" />}
                      Enviar PDPJ
                    </Button>
                    {pdpjResult && (
                      <div className="rounded border bg-slate-50 p-2 text-xs">
                        <div className="font-medium mb-1">Retorno PDPJ</div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                          {JSON.stringify(pdpjResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Marcar protocolo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label htmlFor="protocol-number">Número do protocolo</Label>
                      <Input id="protocol-number" value={protocolNumber} onChange={(e) => setProtocolNumber(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="receipt-url">Link do comprovante</Label>
                      <Input id="receipt-url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} />
                    </div>
                    <Button
                      className="w-full"
                      disabled={markProtocolado.isPending}
                      onClick={() => markProtocolado.mutate({
                        id: selectedPackage.id,
                        data: { status: "protocolado", protocolNumber, receiptUrl },
                      })}
                    >
                      {markProtocolado.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Confirmar como protocolado
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="min-h-0 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Anexos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {attachments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum anexo registrado.</p>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map((att: any, index: number) => (
                          <div key={`${att.name}-${index}`} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                            <span>{att.name}</span>
                            <Badge variant="outline">{att.source || "arquivo"}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Resumo PDPJ</CardTitle>
                    <CardDescription>
                      Conferência rápida do pacote intercorrente antes de abrir o sistema do tribunal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Tipo de peticionamento</Label>
                        <p className="font-medium">{pdpjPayload?.tipoPeticionamento || "INTERCORRENTE"}</p>
                      </div>
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Processo</Label>
                        <p className="font-medium">{pdpjPayload?.numeroProcesso || "-"}</p>
                      </div>
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Documento principal</Label>
                        <p className="font-medium">{pdpjPayload?.documentoPrincipal?.titulo || selectedPackage.title}</p>
                      </div>
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Documentos anexos</Label>
                        <p className="font-medium">{pdpjPayload?.documentos?.length || 0}</p>
                      </div>
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Classe sugerida</Label>
                        <p className="font-medium">{pdpjPayload?.metadados?.classeJudicial || "-"}</p>
                      </div>
                      <div className="border rounded p-3">
                        <Label className="text-xs text-muted-foreground">Assunto sugerido</Label>
                        <p className="font-medium">{pdpjPayload?.metadados?.assuntoSugerido || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="min-h-0">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Peça principal</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => {
                      const w = window.open("", "PecaProtocolo", "width=900,height=800,scrollbars=yes,resizable=yes");
                      if (!w) return;
                      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${selectedPackage.title}</title></head><body>${selectedPackage.mainDocumentHtml}</body></html>`);
                      w.document.close();
                    }}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[420px] border rounded bg-white">
                      <div className="p-5 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedPackage.mainDocumentHtml }} />
                    </ScrollArea>
                  </CardContent>
                </Card>

                {selectedPackage.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Observações</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea readOnly value={selectedPackage.notes} />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
