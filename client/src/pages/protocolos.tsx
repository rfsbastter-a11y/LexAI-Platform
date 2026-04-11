import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clipboard, Copy, Download, ExternalLink, FileText, Loader2, Stamp } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { protocolPackagesApi } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  preparando: "Preparando",
  pronto_para_conferencia: "Pronto para conferencia",
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

function buildPayload(pkg: any) {
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

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tribunalUrl(pkg: any) {
  const text = `${pkg?.court || ""} ${pkg?.caseNumber || ""}`.toLowerCase();
  if (text.includes("tjdft") || text.includes("807")) return "https://pje.tjdft.jus.br/pje/login.seam";
  if (text.includes("trf1") || text.includes("401")) return "https://pje1g.trf1.jus.br/pje/login.seam";
  return "https://portal-servicos.pdpj.jus.br/";
}

export default function ProtocolosPage() {
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
  const [protocolNumber, setProtocolNumber] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [validation, setValidation] = useState<any | null>(null);
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
      toast({ title: "Pacote marcado como protocolado." });
    },
  });

  const validatePdpj = useMutation({
    mutationFn: (id: number) => protocolPackagesApi.validatePdpj(id),
    onSuccess: (result) => {
      setValidation(result);
      toast({
        title: result.ok ? "Pacote pronto para conferencia." : "Pacote com pendencias.",
        description: result.errors?.[0] || result.warnings?.[0],
        variant: result.ok ? "default" : "destructive",
      });
    },
  });

  const submitPdpj = useMutation({
    mutationFn: (id: number) => protocolPackagesApi.submitPdpj(id),
    onSuccess: (result) => {
      setValidation(result.validation || result);
      toast({
        title: result.dryRun ? "Dry-run PDPJ concluido." : "Enviado ao PDPJ.",
        description: result.message || "Resultado recebido.",
      });
    },
  });

  const openDetails = async (pkg: any) => {
    try {
      const full = await protocolPackagesApi.getById(pkg.id);
      setSelectedPackage(full);
      setProtocolNumber(full.protocolNumber || "");
      setReceiptUrl(full.receiptUrl || "");
      setValidation(null);
    } catch (err) {
      toast({
        title: "Erro ao abrir pacote",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const payload = selectedPackage ? buildPayload(selectedPackage) : null;
  const attachments = Array.isArray(selectedPackage?.attachments) ? selectedPackage.attachments : [];
  const pendingItems = validation?.errors?.length ? validation.errors : validation?.warnings || payload?.pendencias || [];
  const checklistText = selectedPackage ? [
    `Processo: ${selectedPackage.caseNumber || "nao informado"}`,
    `Tribunal: ${selectedPackage.court || "nao informado"}`,
    `Peca principal: ${selectedPackage.mainDocumentTitle || selectedPackage.title}`,
    "",
    "Anexos:",
    ...attachments.map((a: any, i: number) => `${i + 1}. ${a.name} (${a.type || "tipo nao informado"})`),
    "",
    "Pendencias:",
    ...(pendingItems.length ? pendingItems.map((p: string) => `- ${p}`) : ["- Nenhuma pendencia obrigatoria identificada"]),
  ].join("\n") : "";

  const copy = async (text: string, title: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title });
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
            <p className="text-muted-foreground">Pacotes intercorrentes preparados no Estudio para protocolo conferido.</p>
          </div>
          <Button onClick={() => window.location.href = "/studio"} data-testid="btn-open-studio">
            <FileText className="w-4 h-4 mr-2" />
            Preparar no Estudio
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Peticionamento Intercorrente</CardTitle>
            <CardDescription>Use este painel como piloto: confira, abra o tribunal, copie dados e marque o recibo.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Carregando pacotes...
              </div>
            ) : packages.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                Nenhum pacote preparado ainda. Gere uma peca no Estudio e use Salvar pacote intercorrente.
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map((pkg: any) => (
                  <div key={pkg.id} className="border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{pkg.title}</h3>
                        <Badge className={STATUS_CLASSES[pkg.status] || STATUS_CLASSES.preparando}>{STATUS_LABELS[pkg.status] || pkg.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {pkg.caseNumber ? `Processo ${pkg.caseNumber}` : "Processo nao informado"}{pkg.court ? ` - ${pkg.court}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Preparado em {formatDate(pkg.preparedAt)} - {Array.isArray(pkg.attachments) ? pkg.attachments.length : 0} anexo(s)
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => openDetails(pkg)} data-testid={`btn-open-protocol-${pkg.id}`}>
                      Conferir e protocolar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedPackage} onOpenChange={(open) => !open && setSelectedPackage(null)}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPackage?.title}</DialogTitle>
            <DialogDescription>Fluxo guiado para conferir e protocolar manualmente com menos erro.</DialogDescription>
          </DialogHeader>

          {selectedPackage && (
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Passo a passo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {[
                      ["1", "Validar pacote", validation ? "ok" : "pending"],
                      ["2", "Baixar peca e checklist", "pending"],
                      ["3", "Abrir tribunal/PDPJ", "pending"],
                      ["4", "Protocolar e salvar recibo", selectedPackage.status === "protocolado" ? "ok" : "pending"],
                    ].map(([n, label, state]) => (
                      <div key={n} className="flex items-center gap-2">
                        {state === "ok" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <div className="w-4 h-4 rounded-full border" />}
                        <span>{n}. {label}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Dados rápidos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">Processo</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{selectedPackage.caseNumber || "Nao informado"}</span>
                        {selectedPackage.caseNumber && <Button size="sm" variant="ghost" onClick={() => copy(selectedPackage.caseNumber, "Processo copiado.")}><Copy className="w-3 h-3" /></Button>}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Tribunal</Label>
                      <p className="font-medium">{selectedPackage.court || "Nao informado"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <div><Badge className={STATUS_CLASSES[selectedPackage.status] || STATUS_CLASSES.preparando}>{STATUS_LABELS[selectedPackage.status] || selectedPackage.status}</Badge></div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-2">
                  <Button onClick={() => validatePdpj.mutate(selectedPackage.id)} disabled={validatePdpj.isPending}>
                    {validatePdpj.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                    Validar pendencias
                  </Button>
                  <Button variant="outline" onClick={() => window.open(tribunalUrl(selectedPackage), "_blank")}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir tribunal/PDPJ
                  </Button>
                  <Button variant="outline" onClick={() => submitPdpj.mutate(selectedPackage.id)} disabled={submitPdpj.isPending}>
                    {submitPdpj.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stamp className="w-4 h-4 mr-2" />}
                    Testar envio PDPJ
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Peca principal</CardTitle>
                      <CardDescription>{selectedPackage.mainDocumentTitle || selectedPackage.title}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => copy(selectedPackage.mainDocumentHtml || "", "Peca copiada.")}>
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar HTML
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadText(`${selectedPackage.title || "peticao"}.html`, selectedPackage.mainDocumentHtml || "", "text/html")}>
                          <Download className="w-4 h-4 mr-2" />
                          Baixar HTML
                        </Button>
                      </div>
                      <div className="border rounded-md p-3 text-sm bg-muted/30 max-h-48 overflow-auto" dangerouslySetInnerHTML={{ __html: selectedPackage.mainDocumentHtml || "" }} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Checklist do protocolo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea value={checklistText} readOnly rows={9} />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => copy(checklistText, "Checklist copiado.")}>
                          <Clipboard className="w-4 h-4 mr-2" />
                          Copiar checklist
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadText(`checklist-protocolo-${selectedPackage.id}.txt`, checklistText)}>
                          <Download className="w-4 h-4 mr-2" />
                          Baixar checklist
                        </Button>
                        {payload && (
                          <Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(payload, null, 2), "Payload copiado.")}>
                            Copiar payload PDPJ
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Anexos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {attachments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum anexo registrado neste pacote.</p>
                      ) : (
                        <div className="space-y-2">
                          {attachments.map((attachment: any, index: number) => (
                            <div key={`${attachment.name}-${index}`} className="border rounded-md p-3 text-sm">
                              <p className="font-medium">{index + 1}. {attachment.name}</p>
                              <p className="text-xs text-muted-foreground">{attachment.type || "tipo nao informado"} - {attachment.source || "origem nao informada"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Recibo do protocolo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Numero do protocolo</Label>
                        <Input value={protocolNumber} onChange={(e) => setProtocolNumber(e.target.value)} placeholder="Ex: PJE-2026-..." />
                      </div>
                      <div>
                        <Label>Link do recibo</Label>
                        <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://..." />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => markProtocolado.mutate({ id: selectedPackage.id, data: { status: "protocolado", protocolNumber, receiptUrl } })}
                        disabled={markProtocolado.isPending}
                      >
                        {markProtocolado.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Marcar como protocolado
                      </Button>
                    </CardContent>
                  </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
