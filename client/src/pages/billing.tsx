import { useState, useMemo, useRef, type ChangeEvent } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DollarSign,
  FileText,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Search,
  X,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  Receipt,
  ChevronRight,
  Eye,
  ExternalLink,
  Mail,
  Paperclip,
  Upload,
  Download,
  Trash2,
} from "lucide-react";
import { useClients } from "@/hooks/use-clients";
import { useContracts } from "@/hooks/use-contracts";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string | null | undefined) =>
  date ? new Date(date).toLocaleDateString("pt-BR") : "—";

const statusConfig: Record<string, { label: string; color: string }> = {
  emitida: { label: "Emitida", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  pago: { label: "Pago", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  em_atraso: { label: "Em Atraso", color: "bg-red-100 text-red-700 border-red-200" },
  cancelada: { label: "Cancelada", color: "bg-gray-100 text-gray-500 border-gray-200" },
  "Em preparação": { label: "Em Preparação", color: "bg-slate-100 text-slate-600 border-slate-200" },
};

const typeLabels: Record<string, string> = {
  mensal: "Mensal Fixo",
  fixo: "Fixo",
  exito: "Êxito",
  misto: "Misto",
  consultivo: "Consultivo",
  contencioso: "Contencioso",
  honorarios: "Honorários",
};

function useBillingSummary() {
  return useQuery({
    queryKey: ["billing-summary"],
    queryFn: async () => {
      const res = await fetch("/api/billing/summary", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch billing summary");
      return res.json();
    },
  });
}

export default function BillingPage() {
  const { data: summary, isLoading } = useBillingSummary();
  const { data: clients } = useClients();
  const { data: allContracts } = useContracts();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: standaloneNfs } = useQuery({
    queryKey: ["notas-fiscais"],
    queryFn: async () => {
      const res = await fetch("/api/notas-fiscais", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notas fiscais");
      return res.json();
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [isAttachNfOpen, setIsAttachNfOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [attachNf, setAttachNf] = useState({
    invoiceId: "",
    clientId: "",
    nfNumber: "",
    description: "",
    referenceMonth: new Date().toISOString().slice(0, 7),
    file: null as File | null,
  });
  const [attachNfError, setAttachNfError] = useState("");
  const [isAttaching, setIsAttaching] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);

  const [detailNfNumber, setDetailNfNumber] = useState("");
  const [detailNfFile, setDetailNfFile] = useState<File | null>(null);
  const [isUploadingDetailNf, setIsUploadingDetailNf] = useState(false);
  const detailFileRef = useRef<HTMLInputElement>(null);

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update invoice");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });

  const kpis = summary?.kpis || { receitaContratual: 0, totalFaturado: 0, totalRecebido: 0, totalInadimplencia: 0, overdueCount: 0 };
  const aging = summary?.aging || { d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const invoices: any[] = summary?.invoices || [];

  const filteredInvoices = useMemo(() => {
    let result = [...invoices];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((inv: any) =>
        (inv.clientName || "").toLowerCase().includes(q) ||
        (inv.invoiceNumber || "").toLowerCase().includes(q) ||
        (inv.referenceMonth || "").includes(q)
      );
    }
    if (statusFilter !== "todos") {
      result = result.filter((inv: any) => inv.status === statusFilter);
    }
    result.sort((a: any, b: any) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return db - da;
    });
    return result;
  }, [invoices, search, statusFilter]);

  const selectedInvoice = invoices.find((inv: any) => inv.id === selectedInvoiceId);

  const handleAttachNf = async () => {
    setAttachNfError("");
    if (!attachNf.file) { setAttachNfError("Selecione o arquivo da NF."); return; }

    setIsAttaching(true);
    try {
      const formData = new FormData();
      formData.append("file", attachNf.file);
      if (attachNf.nfNumber) formData.append("nfNumber", attachNf.nfNumber);
      if (attachNf.clientId) formData.append("clientId", attachNf.clientId);
      if (attachNf.invoiceId) formData.append("invoiceId", attachNf.invoiceId);
      if (attachNf.description) formData.append("description", attachNf.description);
      if (attachNf.referenceMonth) formData.append("referenceMonth", attachNf.referenceMonth);

      const res = await fetch("/api/notas-fiscais", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao anexar NF");
      }
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
      setIsAttachNfOpen(false);
      setAttachNf({ invoiceId: "", clientId: "", nfNumber: "", description: "", referenceMonth: new Date().toISOString().slice(0, 7), file: null });
      toast({ title: "Nota fiscal anexada com sucesso!" });
    } catch (err: any) {
      setAttachNfError(err?.message || "Erro ao anexar nota fiscal.");
    } finally {
      setIsAttaching(false);
    }
  };

  const handleDeleteNf = async (nfId: number) => {
    try {
      const res = await fetch(`/api/notas-fiscais/${nfId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao excluir NF");
      queryClient.invalidateQueries({ queryKey: ["notas-fiscais"] });
      toast({ title: "Nota fiscal excluída." });
    } catch (err: any) {
      toast({ title: err?.message || "Erro ao excluir NF", variant: "destructive" });
    }
  };

  const handleDetailUploadNf = async () => {
    if (!selectedInvoice) return;
    if (!detailNfFile && !detailNfNumber) {
      toast({ title: "Informe o número da NF ou selecione um arquivo.", variant: "destructive" });
      return;
    }

    setIsUploadingDetailNf(true);
    try {
      if (detailNfFile) {
        const formData = new FormData();
        formData.append("file", detailNfFile);
        if (detailNfNumber) formData.append("nfNumber", detailNfNumber);

        const res = await fetch(`/api/invoices/${selectedInvoice.id}/upload-nf`, {
          method: "POST",
          headers: getAuthHeaders(),
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Erro ao fazer upload");
        }
      } else if (detailNfNumber) {
        await updateInvoiceMutation.mutateAsync({ id: selectedInvoice.id, data: { nfNumber: detailNfNumber } });
      }
      queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      setDetailNfNumber("");
      setDetailNfFile(null);
      toast({ title: "Nota fiscal salva com sucesso!" });
    } catch (err: any) {
      toast({ title: err?.message || "Erro ao salvar NF.", variant: "destructive" });
    } finally {
      setIsUploadingDetailNf(false);
    }
  };

  const handleMarkPaid = (inv: any) => {
    updateInvoiceMutation.mutate({
      id: inv.id,
      data: { status: "pago", paidAt: new Date().toISOString(), paidAmount: inv.amount },
    });
  };

  const sendBillingEmail = async (email: string, invoice: any) => {
    setIsSendingEmail(true);
    try {
      const sigRes = await fetch("/api/email/signature", { headers: getAuthHeaders(), credentials: "include" });
      const sigData = await sigRes.json();
      const signature = sigData?.html || "";

      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
          <p>Prezado(a) <strong>${invoice.clientName}</strong>,</p>
          <p>Informamos que a fatura abaixo encontra-se ${invoice.status === "em_atraso" ? "<strong style='color: #dc2626;'>em atraso</strong>" : "pendente de pagamento"}:</p>
          <table style="border-collapse: collapse; margin: 16px 0; width: 100%; max-width: 500px;">
            <tr style="background: #f8fafc;"><td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600;">Fatura</td><td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600;">Referência</td><td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${invoice.referenceMonth}</td></tr>
            <tr style="background: #f8fafc;"><td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600;">Valor</td><td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${formatCurrency(Number(invoice.amount))}</strong></td></tr>
            <tr><td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600;">Vencimento</td><td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${formatDate(invoice.dueDate)}</td></tr>
          </table>
          <p>Solicitamos a gentileza de providenciar o pagamento na data prevista. Em caso de dúvidas, ficamos à disposição.</p>
          <p>Atenciosamente,</p>
          ${signature}
        </div>
      `;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          to: email,
          subject: `Cobrança - Fatura ${invoice.invoiceNumber} - ${invoice.referenceMonth}`,
          html,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Falha ao enviar e-mail");
      }
      const data = await res.json();
      if (data.success) {
        toast({ title: `Cobrança enviada para ${email}` });
      } else {
        toast({ title: data.error || "Erro ao enviar e-mail", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: err?.message || "Erro ao enviar cobrança por e-mail", variant: "destructive" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedInvoice) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Gere um relatório mensal de atividades jurídicas para o cliente "${selectedInvoice.clientName}" referente ao mês ${selectedInvoice.referenceMonth}. 
Inclua: resumo das atividades realizadas, movimentações processuais, peças elaboradas, reuniões e atendimentos. 
Formato profissional para envio ao cliente como justificativa dos honorários cobrados no valor de ${formatCurrency(Number(selectedInvoice.amount))}.
O relatório deve ser objetivo e demonstrar o valor do trabalho realizado.`
          }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(`<html><head><title>Relatório - ${selectedInvoice.clientName}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}h1{color:#1a365d}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>Relatório de Atividades</h1><h3>${selectedInvoice.clientName} — ${selectedInvoice.referenceMonth}</h3><hr/><pre>${data.content}</pre></body></html>`);
          w.document.close();
        }
      }
    } catch {
      alert("Erro ao gerar relatório.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const getOverdueStatus = (inv: any) => {
    if (inv.status === "pago" || inv.status === "cancelada") return null;
    if (!inv.dueDate) return null;
    const days = Math.floor((new Date().getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return null;
    return days;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-billing-title">Financeiro</h1>
          <p className="text-muted-foreground mt-1">Faturamento integrado à carteira de clientes e contratos.</p>
        </div>
        <Dialog open={isAttachNfOpen} onOpenChange={(open) => { setIsAttachNfOpen(open); if (!open) { setAttachNf({ invoiceId: "", clientId: "", nfNumber: "", description: "", referenceMonth: new Date().toISOString().slice(0, 7), file: null }); setAttachNfError(""); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="btn-anexar-nf">
              <Paperclip className="w-4 h-4" />
              Anexar Nota Fiscal
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Anexar Nota Fiscal</DialogTitle>
              <DialogDescription>Anexe uma NF emitida externamente. Vincular a uma fatura é opcional.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {attachNfError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{attachNfError}</span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={attachNf.clientId}
                  onChange={(e) => setAttachNf({ ...attachNf, clientId: e.target.value, invoiceId: "" })}
                  data-testid="select-attach-nf-client"
                >
                  <option value="">Nenhum (NF avulsa)</option>
                  {(clients || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Vincular a fatura</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={attachNf.invoiceId}
                  onChange={(e) => setAttachNf({ ...attachNf, invoiceId: e.target.value })}
                  data-testid="select-attach-nf-invoice"
                >
                  <option value="">Nenhuma (NF independente)</option>
                  {invoices
                    .filter((inv: any) => !attachNf.clientId || inv.clientId === Number(attachNf.clientId))
                    .map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.clientName} ({inv.referenceMonth})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Número da NF</label>
                  <Input
                    value={attachNf.nfNumber}
                    onChange={(e) => setAttachNf({ ...attachNf, nfNumber: e.target.value })}
                    placeholder="Ex: 000123"
                    data-testid="input-attach-nf-number"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mês Referência</label>
                  <Input
                    type="month"
                    value={attachNf.referenceMonth}
                    onChange={(e) => setAttachNf({ ...attachNf, referenceMonth: e.target.value })}
                    data-testid="input-attach-nf-month"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <Input
                  value={attachNf.description}
                  onChange={(e) => setAttachNf({ ...attachNf, description: e.target.value })}
                  placeholder="Ex: NF referente a honorários mês..."
                  data-testid="input-attach-nf-description"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Arquivo da NF (PDF ou imagem) *</label>
                <div
                  className="border-2 border-dashed border-muted rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => attachFileRef.current?.click()}
                  data-testid="drop-attach-nf-file"
                >
                  <input
                    ref={attachFileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => setAttachNf({ ...attachNf, file: e.target.files?.[0] || null })}
                    data-testid="input-attach-nf-file"
                  />
                  {attachNf.file ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{attachNf.file.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Clique para selecionar o arquivo</p>
                      <p className="text-xs mt-1">PDF, PNG, JPG ou WEBP</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAttachNfOpen(false)}>Cancelar</Button>
              <Button onClick={handleAttachNf} disabled={isAttaching} data-testid="btn-confirm-attach-nf">
                {isAttaching && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Anexar NF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mt-6">
            <Card data-testid="card-kpi-receita">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Receita Contratual</p>
                    <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-receita">{formatCurrency(kpis.receitaContratual)}</h3>
                    <p className="text-xs text-muted-foreground">contratos ativos/mês</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-faturado">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Faturado no Mês</p>
                    <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-faturado">{formatCurrency(kpis.totalFaturado)}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-recebido">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Recebido</p>
                    <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-recebido">{formatCurrency(kpis.totalRecebido)}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-inadimplencia" className={kpis.totalInadimplencia > 0 ? "border-red-200" : ""}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${kpis.totalInadimplencia > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"}`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Inadimplência</p>
                    <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-inadimplencia">{formatCurrency(kpis.totalInadimplencia)}</h3>
                    {kpis.overdueCount > 0 && <p className="text-xs text-red-500">{kpis.overdueCount} fatura(s) em atraso</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aging */}
          {(aging.d30 > 0 || aging.d60 > 0 || aging.d90 > 0 || aging.d90plus > 0) && (
            <Card className="mt-4 border-red-200 bg-red-50/30" data-testid="card-aging">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <CardTitle className="text-base">Aging de Inadimplência</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs font-medium text-amber-700">Até 30 dias</p>
                    <p className="text-lg font-bold text-amber-800">{formatCurrency(aging.d30)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <p className="text-xs font-medium text-orange-700">31-60 dias</p>
                    <p className="text-lg font-bold text-orange-800">{formatCurrency(aging.d60)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-xs font-medium text-red-700">61-90 dias</p>
                    <p className="text-lg font-bold text-red-800">{formatCurrency(aging.d90)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-100 border border-red-300">
                    <p className="text-xs font-medium text-red-800">+90 dias</p>
                    <p className="text-lg font-bold text-red-900">{formatCurrency(aging.d90plus)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, número ou mês..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-invoices"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
              data-testid="select-status-filter"
            >
              <option value="todos">Todos os status</option>
              <option value="emitida">Emitida</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="em_atraso">Em Atraso</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          {/* Main Content: Table + Side Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
            {/* Tabela */}
            <div className="lg:col-span-8">
              <Card data-testid="card-invoices-table">
                <CardContent className="p-0">
                  {filteredInvoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <FileText className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-sm">{search || statusFilter !== "todos" ? "Nenhuma fatura encontrada." : "Nenhuma fatura cadastrada."}</p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Nº</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Cliente</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Tipo</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ref.</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Vencimento</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Valor</th>
                              <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                              <th className="text-right p-3 pr-4 text-xs font-medium text-muted-foreground">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInvoices.map((inv: any) => {
                              const overdueDays = getOverdueStatus(inv);
                              const sc = statusConfig[inv.status] || statusConfig.emitida;
                              const isSelected = selectedInvoiceId === inv.id;
                              return (
                                <tr
                                  key={inv.id}
                                  className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""} ${overdueDays ? "bg-red-50/30" : ""}`}
                                  onClick={() => setSelectedInvoiceId(isSelected ? null : inv.id)}
                                  data-testid={`invoice-row-${inv.id}`}
                                >
                                  <td className="p-3 text-xs font-mono text-muted-foreground">{inv.invoiceNumber}</td>
                                  <td className="p-3">
                                    <p className="text-sm font-medium">{inv.clientName}</p>
                                  </td>
                                  <td className="p-3">
                                    <Badge variant="outline" className="text-xs">{typeLabels[inv.contractType] || inv.contractType}</Badge>
                                  </td>
                                  <td className="p-3 text-sm text-muted-foreground">{inv.referenceMonth}</td>
                                  <td className="p-3 text-sm">
                                    <span className={overdueDays ? "text-red-600 font-medium" : "text-muted-foreground"}>
                                      {formatDate(inv.dueDate)}
                                    </span>
                                    {overdueDays && <span className="text-xs text-red-500 block">{overdueDays}d em atraso</span>}
                                  </td>
                                  <td className="p-3 font-mono text-sm font-medium">{formatCurrency(Number(inv.amount))}</td>
                                  <td className="p-3">
                                    <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                                  </td>
                                  <td className="p-3 text-right pr-4">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={(e) => { e.stopPropagation(); setSelectedInvoiceId(inv.id); }}
                                      data-testid={`btn-detail-${inv.id}`}
                                    >
                                      <Eye className="w-3 h-3 mr-1" /> Detalhes
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile */}
                      <div className="md:hidden divide-y">
                        {filteredInvoices.map((inv: any) => {
                          const overdueDays = getOverdueStatus(inv);
                          const sc = statusConfig[inv.status] || statusConfig.emitida;
                          return (
                            <div
                              key={inv.id}
                              className={`p-4 cursor-pointer ${overdueDays ? "bg-red-50/30" : ""} ${selectedInvoiceId === inv.id ? "bg-primary/5" : ""}`}
                              onClick={() => setSelectedInvoiceId(selectedInvoiceId === inv.id ? null : inv.id)}
                              data-testid={`invoice-card-${inv.id}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold truncate">{inv.clientName}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">{inv.invoiceNumber}</Badge>
                                    <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold font-mono">{formatCurrency(Number(inv.amount))}</p>
                                  <p className="text-[10px] text-muted-foreground">Venc: {formatDate(inv.dueDate)}</p>
                                  {overdueDays && <p className="text-[10px] text-red-500 font-medium">{overdueDays}d atraso</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              {filteredInvoices.length > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2" data-testid="text-invoices-count">
                  {filteredInvoices.length} fatura(s)
                </p>
              )}
            </div>

            {/* Painel Lateral */}
            <div className="lg:col-span-4">
              {selectedInvoice ? (
                <Card className="sticky top-4" data-testid="card-invoice-detail">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Detalhes da Fatura</CardTitle>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedInvoiceId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="text-center pb-4 border-b">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Total da Fatura</p>
                      <h3 className="text-3xl font-bold text-primary" data-testid="text-detail-amount">{formatCurrency(Number(selectedInvoice.amount))}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{selectedInvoice.clientName}</p>
                      <p className="text-xs text-muted-foreground">{selectedInvoice.referenceMonth}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Nº Fatura</span>
                        <span className="font-mono">{selectedInvoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tipo Contrato</span>
                        <span>{typeLabels[selectedInvoice.contractType] || selectedInvoice.contractType}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Vencimento</span>
                        <span className={getOverdueStatus(selectedInvoice) ? "text-red-600 font-medium" : ""}>
                          {formatDate(selectedInvoice.dueDate)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className={`text-xs ${(statusConfig[selectedInvoice.status] || statusConfig.emitida).color}`}>
                          {(statusConfig[selectedInvoice.status] || statusConfig.emitida).label}
                        </Badge>
                      </div>
                      {selectedInvoice.paidAt && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Pago em</span>
                          <span className="text-emerald-600">{formatDate(selectedInvoice.paidAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Checklist Conformidade */}
                    <div className="space-y-2 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checklist de Conformidade</p>
                      <div className="space-y-2">
                        {/* Nota Fiscal Section */}
                        <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium">Nota Fiscal</span>
                            {selectedInvoice.nfPath ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                          </div>
                          {selectedInvoice.nfPath ? (
                            <div className="space-y-2">
                              {selectedInvoice.nfNumber && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Nº:</span>
                                  <span className="text-xs font-mono text-emerald-600">{selectedInvoice.nfNumber}</span>
                                </div>
                              )}
                              <a
                                href={`/api/invoices/${selectedInvoice.id}/nf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                data-testid="link-download-nf"
                              >
                                <Download className="w-3 h-3" />
                                Visualizar / Baixar NF
                              </a>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Input
                                className="h-7 text-xs px-2"
                                placeholder="Nº da NF (opcional)"
                                value={detailNfNumber}
                                onChange={(e) => setDetailNfNumber(e.target.value)}
                                data-testid="input-detail-nf-number"
                              />
                              <div
                                className="border border-dashed border-muted-foreground/40 rounded p-2 text-center cursor-pointer hover:border-primary/50 transition-colors"
                                onClick={() => detailFileRef.current?.click()}
                                data-testid="drop-detail-nf-file"
                              >
                                <input
                                  ref={detailFileRef}
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                                  className="hidden"
                                  onChange={(e) => setDetailNfFile(e.target.files?.[0] || null)}
                                  data-testid="input-detail-nf-file"
                                />
                                {detailNfFile ? (
                                  <span className="text-xs text-emerald-600 truncate block">{detailNfFile.name}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Clique para anexar PDF/imagem</span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1 h-7 text-xs gap-1"
                                  onClick={handleDetailUploadNf}
                                  disabled={isUploadingDetailNf || (!detailNfFile && !detailNfNumber)}
                                  data-testid="btn-save-detail-nf"
                                >
                                  {isUploadingDetailNf ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                                  Salvar NF
                                </Button>
                                <a
                                  href="https://iss.fazenda.df.gov.br/online/Login/Login.aspx?ReturnUrl=%2fonline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Emitir NF-e pelo ISS/DF"
                                >
                                  <Button variant="outline" size="sm" className="h-7 px-2">
                                    <ExternalLink className="w-3 h-3 text-blue-500" />
                                  </Button>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg">
                          <span className="text-xs font-medium">Pagamento Confirmado</span>
                          {selectedInvoice.status === "pago" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="space-y-2 pt-3 border-t">
                      {selectedInvoice.status !== "pago" && selectedInvoice.status !== "cancelada" && (
                        <Button
                          className="w-full gap-2"
                          onClick={() => handleMarkPaid(selectedInvoice)}
                          disabled={updateInvoiceMutation.isPending}
                          data-testid="btn-mark-paid"
                        >
                          {updateInvoiceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Confirmar Pagamento
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleGenerateReport}
                        disabled={isGeneratingReport}
                        data-testid="btn-generate-report"
                      >
                        {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Relatório Mensal IA
                      </Button>
                      {!selectedInvoice.nfNumber && (
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => window.open("https://iss.fazenda.df.gov.br/online/Login/Login.aspx?ReturnUrl=%2fonline", "_blank")}
                          data-testid="btn-emitir-nf"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Emitir NF-e (ISS/DF)
                        </Button>
                      )}
                      {selectedInvoice.status !== "pago" && selectedInvoice.status !== "cancelada" && (
                        <>
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => {
                              const phone = prompt("Número WhatsApp do cliente (ex: 5561999999999):");
                              if (phone) {
                                const msg = encodeURIComponent(
                                  `Prezado(a) ${selectedInvoice.clientName},\n\nInformamos que a fatura nº ${selectedInvoice.invoiceNumber} referente a ${selectedInvoice.referenceMonth} no valor de ${formatCurrency(Number(selectedInvoice.amount))} encontra-se ${selectedInvoice.status === "em_atraso" ? "em atraso" : "pendente de pagamento"}.\n\nVencimento: ${formatDate(selectedInvoice.dueDate)}\n\nFicamos à disposição para esclarecimentos.\n\nAtenciosamente,\nRonald Ferreira Serra\nOAB/DF 23.947`
                                );
                                window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
                              }
                            }}
                            data-testid="btn-enviar-cobranca"
                          >
                            <Send className="w-4 h-4" />
                            Cobrança WhatsApp
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                            disabled={isSendingEmail}
                            onClick={async () => {
                              const clientData = clients?.find((c: any) => c.id === selectedInvoice.clientId);
                              const clientEmail = clientData?.email;
                              if (!clientEmail) {
                                const email = prompt("E-mail do cliente:");
                                if (!email) return;
                                await sendBillingEmail(email, selectedInvoice);
                              } else {
                                await sendBillingEmail(clientEmail, selectedInvoice);
                              }
                            }}
                            data-testid="btn-enviar-cobranca-email"
                          >
                            {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Cobrança E-mail
                          </Button>
                        </>
                      )}
                      <Link href={`/clients/${selectedInvoice.clientId}`}>
                        <Button variant="outline" className="w-full gap-2" data-testid="btn-ver-cliente">
                          <ChevronRight className="w-4 h-4" />
                          Ver Cliente
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="sticky top-4" data-testid="card-no-selection">
                  <CardContent className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
                    <DollarSign className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm font-medium">Selecione uma fatura</p>
                    <p className="text-xs mt-1">Clique em uma fatura para ver detalhes, confirmar pagamento ou gerar relatório.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Notas Fiscais Avulsas */}
          {(standaloneNfs || []).length > 0 && (
            <Card className="mt-6" data-testid="card-notas-fiscais">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-500" />
                  <CardTitle className="text-base">Notas Fiscais Anexadas</CardTitle>
                  <Badge variant="outline" className="text-xs ml-auto">{(standaloneNfs || []).length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(standaloneNfs || []).map((nf: any) => {
                    const client = (clients || []).find((c: any) => c.id === nf.clientId);
                    const linkedInvoice = nf.invoiceId ? invoices.find((inv: any) => inv.id === nf.invoiceId) : null;
                    return (
                      <div key={nf.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors" data-testid={`nf-row-${nf.id}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {nf.nfNumber && <span className="text-sm font-mono font-medium">NF {nf.nfNumber}</span>}
                              <span className="text-xs text-muted-foreground truncate">{nf.fileName}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {client && <span className="text-xs text-muted-foreground">{client.name}</span>}
                              {nf.referenceMonth && <span className="text-xs text-muted-foreground">Ref: {nf.referenceMonth}</span>}
                              {linkedInvoice && (
                                <Badge variant="outline" className="text-[10px]">
                                  Fatura: {linkedInvoice.invoiceNumber}
                                </Badge>
                              )}
                              {!linkedInvoice && !nf.invoiceId && (
                                <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600">Avulsa</Badge>
                              )}
                            </div>
                            {nf.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{nf.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground mr-2">{formatDate(nf.createdAt)}</span>
                          <a
                            href={`/api/notas-fiscais/${nf.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`btn-download-nf-${nf.id}`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Download className="w-3.5 h-3.5 text-blue-500" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={() => handleDeleteNf(nf.id)}
                            data-testid={`btn-delete-nf-${nf.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
