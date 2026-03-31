import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit2,
  Download,
  Send,
  Upload,
  Search,
  HandshakeIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  MessageSquare,
  Loader2,
  FileText,
  ClipboardPaste,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";

// Stable empty array to avoid infinite useEffect loops when query data is undefined
const EMPTY: any[] = [];

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  ativo: { label: "Ativo", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  quitado: { label: "Quitado", color: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle2 },
  inadimplente: { label: "Inadimplente", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
};

type AgreementForm = {
  debtorId: number | null;
  debtorName: string;
  clientId: number | null;
  agreementDate: string;
  originalDebtValue: string;
  agreedValue: string;
  isSinglePayment: boolean;
  installmentsCount: string;
  downPaymentValue: string;
  downPaymentDate: string;
  installmentValue: string;
  dueDay: string;
  feePercent: string;
  feeAmount: string;
  feeStatus: string;
  status: string;
  notes: string;
};

const emptyForm = (): AgreementForm => ({
  debtorId: null,
  debtorName: "",
  clientId: null,
  agreementDate: "",
  originalDebtValue: "",
  agreedValue: "",
  isSinglePayment: false,
  installmentsCount: "",
  downPaymentValue: "",
  downPaymentDate: "",
  installmentValue: "",
  dueDay: "",
  feePercent: "10",
  feeAmount: "",
  feeStatus: "pendente",
  status: "ativo",
  notes: "",
});

export default function AcordosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const initializedRef = useRef(false);

  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AgreementForm>(emptyForm());

  const [showReport, setShowReport] = useState(false);
  const [reportMonth, setReportMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [reportYear, setReportYear] = useState<string>(String(new Date().getFullYear()));
  const [reportClientId, setReportClientId] = useState<string>("");
  const [reportRecipients, setReportRecipients] = useState<{ id: string; label: string; email?: string; phone?: string; checked: boolean }[]>([]);
  const [extraEmail, setExtraEmail] = useState("");
  const [extraWhatsapp, setExtraWhatsapp] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importType, setImportType] = useState<"text" | "csv" | "pdf">("text");
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importClientId, setImportClientId] = useState<string>("");
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importSaving, setImportSaving] = useState(false);

  // Queries
  const { data: clients = EMPTY } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { headers: getAuthHeaders() });
      return res.json();
    },
  });

  const { data: socios = EMPTY } = useQuery<any[]>({
    queryKey: ["/api/users/socios"],
    queryFn: async () => {
      const res = await fetch("/api/users/socios", { headers: getAuthHeaders() });
      return res.json();
    },
  });

  // Rebuild recipient list when reportClientId or socios change.
  // Preserves existing checked state for sócios to avoid resetting user choices on data refetch.
  // Client contacts always reset to checked when a new client is selected.
  useEffect(() => {
    setReportRecipients(prev => {
      const list: { id: string; label: string; email?: string; phone?: string; checked: boolean }[] = [];
      for (const s of socios) {
        if (s.email) {
          const id = `socio-email-${s.id}`;
          const existing = prev.find(p => p.id === id);
          list.push({ id, label: `${s.name} (e-mail)`, email: s.email, checked: existing ? existing.checked : true });
        }
        if (s.phone) {
          const id = `socio-wa-${s.id}`;
          const existing = prev.find(p => p.id === id);
          list.push({ id, label: `${s.name} (WhatsApp)`, phone: s.phone, checked: existing ? existing.checked : true });
        }
      }
      if (reportClientId) {
        const client = (clients as any[]).find(c => String(c.id) === reportClientId);
        if (client?.email) list.push({ id: "client-email", label: `${client.name} – cliente (e-mail)`, email: client.email, checked: true });
        if (client?.phone) list.push({ id: "client-wa", label: `${client.name} – cliente (WhatsApp)`, phone: client.phone, checked: true });
      }
      return list;
    });
  }, [socios, reportClientId, clients]);

  const { data: agreements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/debtor-agreements", selectedClientId],
    queryFn: async () => {
      const params = selectedClientId !== "all" ? `?clientId=${selectedClientId}` : "";
      const res = await fetch(`/api/debtor-agreements${params}`, { headers: getAuthHeaders() });
      return res.json();
    },
  });

  const debtorsForClient = useQuery<any[]>({
    queryKey: ["/api/clients", form.clientId, "debtors"],
    enabled: !!form.clientId,
    queryFn: async () => {
      const res = await fetch(`/api/clients/${form.clientId}/debtors`, { headers: getAuthHeaders() });
      return res.json();
    },
  });

  // Handle URL params — pre-select client/debtor and open form when coming from debtor button
  useEffect(() => {
    if (initializedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const urlClientId = params.get("clientId");
    const urlDebtorId = params.get("debtorId");
    if (urlClientId) {
      setSelectedClientId(urlClientId);
      initializedRef.current = true;
      setForm(f => ({ ...f, clientId: parseInt(urlClientId), debtorId: urlDebtorId ? parseInt(urlDebtorId) : null }));
      setShowForm(true);
    }
  }, [location]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/debtor-agreements", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debtor-agreements"] });
      setShowForm(false);
      setForm(emptyForm());
      toast({ title: "Acordo registrado com sucesso!" });
    },
    onError: () => toast({ title: "Erro ao registrar acordo", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/debtor-agreements/${id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debtor-agreements"] });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      toast({ title: "Acordo atualizado!" });
    },
    onError: () => toast({ title: "Erro ao atualizar acordo", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/debtor-agreements/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debtor-agreements"] });
      toast({ title: "Acordo removido" });
    },
    onError: () => toast({ title: "Erro ao remover acordo", variant: "destructive" }),
  });

  const toggleFeeStatusMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/debtor-agreements/${id}/fee-status`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/debtor-agreements"] }),
    onError: () => toast({ title: "Erro ao atualizar status", variant: "destructive" }),
  });

  // Computed
  const monthlyFee = useMemo(() => {
    const inst = parseFloat(form.installmentValue.replace(",", ".")) || 0;
    const pct = parseFloat(form.feePercent.replace(",", ".")) || 0;
    return Math.round(inst * pct / 100 * 100) / 100;
  }, [form.installmentValue, form.feePercent]);

  const filtered = useMemo(() => {
    return agreements.filter((a: any) => {
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      const matchSearch = !search || a.debtorName?.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [agreements, statusFilter, search]);

  const stats = useMemo(() => {
    const ativos = agreements.filter((a: any) => a.status === "ativo");
    const totalHonorarios = ativos.reduce((sum: number, a: any) => {
      const inst = parseFloat(a.installmentValue || "0");
      const pct = parseFloat(a.feePercent || "10");
      return sum + Math.round(inst * pct / 100 * 100) / 100;
    }, 0);
    return { total: agreements.length, ativos: ativos.length, totalHonorarios };
  }, [agreements]);

  function buildPayload() {
    return {
      debtorId: form.debtorId,
      clientId: form.clientId,
      agreementDate: form.agreementDate,
      originalDebtValue: form.originalDebtValue ? parseFloat(form.originalDebtValue.replace(",", ".")) : null,
      agreedValue: form.agreedValue ? parseFloat(form.agreedValue.replace(",", ".")) : null,
      isSinglePayment: form.isSinglePayment,
      installmentsCount: form.isSinglePayment ? null : (form.installmentsCount ? parseInt(form.installmentsCount) : null),
      downPaymentValue: form.downPaymentValue ? parseFloat(form.downPaymentValue.replace(",", ".")) : null,
      downPaymentDate: form.downPaymentDate || null,
      installmentValue: form.installmentValue ? parseFloat(form.installmentValue.replace(",", ".")) : null,
      dueDay: form.isSinglePayment ? null : (form.dueDay ? parseInt(form.dueDay) : null),
      feePercent: form.feePercent ? parseFloat(form.feePercent.replace(",", ".")) : 10,
      feeAmount: form.feeAmount ? parseFloat(form.feeAmount.replace(",", ".")) : null,
      feeStatus: form.feeStatus || "pendente",
      status: form.status,
      notes: form.notes || null,
    };
  }

  function handleSave() {
    if (!form.debtorId) return toast({ title: "Selecione o devedor", variant: "destructive" });
    if (!form.clientId) return toast({ title: "Selecione o cliente", variant: "destructive" });
    if (!form.agreementDate) return toast({ title: "Informe a data do acordo", variant: "destructive" });
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleEdit(a: any) {
    setEditingId(a.id);
    setForm({
      debtorId: a.debtorId,
      debtorName: a.debtorName || "",
      clientId: a.clientId,
      agreementDate: a.agreementDate || "",
      originalDebtValue: a.originalDebtValue?.toString() || "",
      agreedValue: a.agreedValue?.toString() || "",
      isSinglePayment: a.isSinglePayment || false,
      installmentsCount: a.installmentsCount?.toString() || "",
      downPaymentValue: a.downPaymentValue?.toString() || "",
      downPaymentDate: a.downPaymentDate || "",
      installmentValue: a.installmentValue?.toString() || "",
      dueDay: a.dueDay?.toString() || "",
      feePercent: a.feePercent?.toString() || "10",
      feeAmount: a.feeAmount?.toString() || "",
      feeStatus: a.feeStatus || "pendente",
      status: a.status || "ativo",
      notes: a.notes || "",
    });
    setShowForm(true);
  }

  async function handleDownloadReport() {
    if (!reportClientId) return toast({ title: "Selecione um cliente", variant: "destructive" });
    const params = new URLSearchParams({ clientId: reportClientId, month: reportMonth, year: reportYear });
    const res = await fetch(`/api/debtor-agreements/report?${params}`, { headers: getAuthHeaders() });
    if (!res.ok) return toast({ title: "Erro ao gerar relatório", variant: "destructive" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `honorarios_${String(reportMonth).padStart(2, "0")}_${reportYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSendReport() {
    if (!reportClientId) return toast({ title: "Selecione um cliente", variant: "destructive" });
    const checkedRecipients = reportRecipients.filter(r => r.checked);
    const emailTos = [
      ...checkedRecipients.filter(r => r.email).map(r => r.email!),
      ...(extraEmail.trim() ? [extraEmail.trim()] : []),
    ];
    const whatsappTos = [
      ...checkedRecipients.filter(r => r.phone && !r.email).map(r => r.phone!),
      ...(extraWhatsapp.trim() ? [extraWhatsapp.trim()] : []),
    ];
    if (emailTos.length === 0 && whatsappTos.length === 0) {
      return toast({ title: "Selecione ao menos um destinatário", variant: "destructive" });
    }
    setIsSending(true);
    try {
      const res = await fetch("/api/debtor-agreements/report/send", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: parseInt(reportClientId),
          month: parseInt(reportMonth),
          year: parseInt(reportYear),
          emailTos,
          whatsappTos,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({ title: `Relatório enviado via ${data.sent.join(" e ")}!` });
      setShowReport(false);
    } catch {
      toast({ title: "Erro ao enviar relatório", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  async function handleImportParse() {
    setImportPreviewing(true);
    setImportPreview([]);
    try {
      const fd = new FormData();
      fd.append("type", importType);
      if (importType === "text") fd.append("text", importText);
      else if (importFile) fd.append("file", importFile);
      fd.append("clientId", importClientId || "");

      const res = await fetch("/api/debtor-agreements/import/parse", {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setImportPreview(data.records || []);
      toast({ title: `${data.count} acordos detectados` });
    } catch (e: any) {
      toast({ title: "Erro ao processar importação: " + e.message, variant: "destructive" });
    } finally {
      setImportPreviewing(false);
    }
  }

  async function handleImportConfirm() {
    if (!importClientId) return toast({ title: "Selecione um cliente para importar", variant: "destructive" });
    setImportSaving(true);
    try {
      // Map debtorName to debtorId by looking up debtors of the client
      const debtorsRes = await fetch(`/api/clients/${importClientId}/debtors`, { headers: getAuthHeaders() });
      const debtorsList: any[] = await debtorsRes.json();

      const agreements = importPreview.map((r: any) => {
        const normalizedName = r.debtorName?.trim().toUpperCase() || "";
        const match = debtorsList.find((d: any) => d.name.toUpperCase().includes(normalizedName) || normalizedName.includes(d.name.toUpperCase()));
        return {
          debtorId: match?.id || null,
          clientId: parseInt(importClientId),
          agreementDate: r.agreementDate,
          isSinglePayment: r.isSinglePayment || false,
          installmentsCount: r.installmentsCount || null,
          downPaymentValue: r.downPaymentValue || null,
          downPaymentDate: r.downPaymentDate || null,
          installmentValue: r.installmentValue || null,
          dueDay: r.dueDay || null,
          feePercent: r.feePercent || 10,
          status: "ativo",
          notes: r.notes || null,
        };
      }).filter((a: any) => a.debtorId);

      const noMatch = importPreview.length - agreements.length;

      const res = await fetch("/api/debtor-agreements/batch", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ agreements }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/debtor-agreements"] });
      setShowImport(false);
      setImportPreview([]);
      setImportText("");
      setImportFile(null);
      const msg = noMatch > 0 ? ` (${noMatch} ignorados por devedor não encontrado)` : "";
      toast({ title: `${data.created} acordos importados${msg}!` });
    } catch {
      toast({ title: "Erro ao salvar acordos importados", variant: "destructive" });
    } finally {
      setImportSaving(false);
    }
  }

  const months = [
    "1 - Janeiro", "2 - Fevereiro", "3 - Março", "4 - Abril",
    "5 - Maio", "6 - Junho", "7 - Julho", "8 - Agosto",
    "9 - Setembro", "10 - Outubro", "11 - Novembro", "12 - Dezembro",
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <HandshakeIcon className="w-7 h-7 text-emerald-600" />
              Acordos
            </h1>
            <p className="text-muted-foreground mt-1">Gerencie acordos extrajudiciais dos devedores.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-acordos">
              <Upload className="w-4 h-4 mr-2" /> Importar
            </Button>
            <Button variant="outline" onClick={() => { setReportClientId(selectedClientId !== "all" ? selectedClientId : ""); setShowReport(true); }} data-testid="button-report-acordos">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Relatório Mensal
            </Button>
            <Button onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true); }} data-testid="button-new-acordo">
              <Plus className="w-4 h-4 mr-2" /> Novo Acordo
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Total de Acordos</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Acordos Ativos</p>
              <p className="text-3xl font-bold text-emerald-600">{stats.ativos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Honorários/Mês (ativos)</p>
              <p className="text-3xl font-bold text-blue-600">{formatCurrency(stats.totalHonorarios)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar devedor..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-acordos" />
          </div>
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-52" data-testid="select-client-filter">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando acordos...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <HandshakeIcon className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Nenhum acordo encontrado.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Registrar primeiro acordo
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Data Acordo</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Valor Entrada</TableHead>
                    <TableHead>Valor Prestação</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Honorários/Mês</TableHead>
                    <TableHead>Hon. Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a: any) => {
                    const instVal = parseFloat(a.installmentValue || "0");
                    const feePct = parseFloat(a.feePercent || "10");
                    const monthlyFeeVal = Math.round(instVal * feePct / 100 * 100) / 100;
                    const cfg = statusConfig[a.status] || statusConfig.ativo;
                    const StatusIcon = cfg.icon;
                    return (
                      <TableRow key={a.id} data-testid={`row-acordo-${a.id}`}>
                        <TableCell className="font-medium">{a.debtorName || "—"}</TableCell>
                        <TableCell>{formatDate(a.agreementDate)}</TableCell>
                        <TableCell>{a.isSinglePayment ? "ÚNICA" : (a.installmentsCount || "—")}</TableCell>
                        <TableCell>{a.downPaymentValue ? formatCurrency(a.downPaymentValue) : "—"}</TableCell>
                        <TableCell>{a.installmentValue ? formatCurrency(a.installmentValue) : "—"}</TableCell>
                        <TableCell>{a.dueDay ? `Dia ${a.dueDay}` : (a.isSinglePayment ? "—" : "—")}</TableCell>
                        <TableCell className="font-semibold text-blue-700">{formatCurrency(monthlyFeeVal)}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleFeeStatusMutation.mutate(a.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${a.feeStatus === "recebido" ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200" : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"}`}
                            data-testid={`button-fee-status-${a.id}`}
                            title="Clique para alternar"
                          >
                            {a.feeStatus === "recebido" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {a.feeStatus === "recebido" ? "Recebido" : "Pendente"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${cfg.color} border text-xs gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(a)} data-testid={`button-edit-acordo-${a.id}`}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm("Remover este acordo?")) deleteMutation.mutate(a.id); }} data-testid={`button-delete-acordo-${a.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== FORM MODAL ===== */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandshakeIcon className="w-5 h-5 text-emerald-600" />
              {editingId ? "Editar Acordo" : "Registrar Novo Acordo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Cliente + Devedor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={form.clientId?.toString() || ""} onValueChange={v => setForm(f => ({ ...f, clientId: parseInt(v), debtorId: null, debtorName: "" }))}>
                  <SelectTrigger data-testid="select-client-form">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Devedor *</Label>
                {debtorsForClient.data && debtorsForClient.data.length > 0 ? (
                  <Select value={form.debtorId?.toString() || ""} onValueChange={v => {
                    const d = debtorsForClient.data?.find((x: any) => x.id === parseInt(v));
                    setForm(f => ({ ...f, debtorId: parseInt(v), debtorName: d?.name || "" }));
                  }}>
                    <SelectTrigger data-testid="select-debtor-form">
                      <SelectValue placeholder="Selecione o devedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {debtorsForClient.data.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input placeholder={form.clientId ? "Nenhum devedor cadastrado" : "Selecione o cliente primeiro"} disabled />
                )}
              </div>
            </div>

            {/* Data do Acordo + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Data do Acordo *</Label>
                <Input type="date" value={form.agreementDate} onChange={e => setForm(f => ({ ...f, agreementDate: e.target.value }))} data-testid="input-agreement-date" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status-form">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="quitado">Quitado</SelectItem>
                    <SelectItem value="inadimplente">Inadimplente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Valores originais */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Dívida Original (R$)</Label>
                <Input placeholder="0,00" value={form.originalDebtValue} onChange={e => setForm(f => ({ ...f, originalDebtValue: e.target.value }))} data-testid="input-original-debt-value" />
              </div>
              <div className="space-y-1">
                <Label>Valor Acordado (R$)</Label>
                <Input placeholder="0,00" value={form.agreedValue} onChange={e => setForm(f => ({ ...f, agreedValue: e.target.value }))} data-testid="input-agreed-value" />
              </div>
            </div>

            {/* Tipo de pagamento */}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="single-payment" checked={form.isSinglePayment} onChange={e => setForm(f => ({ ...f, isSinglePayment: e.target.checked }))} className="w-4 h-4" data-testid="checkbox-single-payment" />
              <Label htmlFor="single-payment">Pagamento único (parcela única)</Label>
            </div>

            {/* Entrada */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Valor da Entrada (R$)</Label>
                <Input placeholder="0,00" value={form.downPaymentValue} onChange={e => setForm(f => ({ ...f, downPaymentValue: e.target.value }))} data-testid="input-down-payment-value" />
              </div>
              <div className="space-y-1">
                <Label>Data da Entrada</Label>
                <Input type="date" value={form.downPaymentDate} onChange={e => setForm(f => ({ ...f, downPaymentDate: e.target.value }))} data-testid="input-down-payment-date" />
              </div>
            </div>

            {/* Parcelas */}
            {!form.isSinglePayment && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Nº de Parcelas</Label>
                  <Input type="number" placeholder="Ex: 24" value={form.installmentsCount} onChange={e => setForm(f => ({ ...f, installmentsCount: e.target.value }))} data-testid="input-installments-count" />
                </div>
                <div className="space-y-1">
                  <Label>Valor da Parcela (R$)</Label>
                  <Input placeholder="0,00" value={form.installmentValue} onChange={e => setForm(f => ({ ...f, installmentValue: e.target.value }))} data-testid="input-installment-value" />
                </div>
                <div className="space-y-1">
                  <Label>Dia do Vencimento</Label>
                  <Input type="number" min="1" max="31" placeholder="Ex: 10" value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} data-testid="input-due-day" />
                </div>
              </div>
            )}

            {form.isSinglePayment && (
              <div className="space-y-1">
                <Label>Valor do Pagamento Único (R$)</Label>
                <Input placeholder="0,00" value={form.installmentValue} onChange={e => setForm(f => ({ ...f, installmentValue: e.target.value }))} data-testid="input-single-payment-value" />
              </div>
            )}

            {/* Honorários */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="space-y-1">
                <Label className="text-blue-800">% Honorários do Escritório</Label>
                <Input placeholder="10" value={form.feePercent} onChange={e => setForm(f => ({ ...f, feePercent: e.target.value }))} data-testid="input-fee-percent" />
              </div>
              <div className="space-y-1">
                <Label className="text-blue-800">Honorários/Mês (calculado)</Label>
                <div className="flex items-center h-9 px-3 bg-white border rounded-md text-blue-700 font-semibold">
                  {formatCurrency(monthlyFee)}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-blue-800">Valor Honorários (R$)</Label>
                <Input placeholder="Deixar vazio para calcular automaticamente" value={form.feeAmount} onChange={e => setForm(f => ({ ...f, feeAmount: e.target.value }))} data-testid="input-fee-amount" />
              </div>
              <div className="space-y-1">
                <Label className="text-blue-800">Status Honorários</Label>
                <Select value={form.feeStatus} onValueChange={v => setForm(f => ({ ...f, feeStatus: v }))}>
                  <SelectTrigger data-testid="select-fee-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="recebido">Recebido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea placeholder="Ex: A partir de julho, parcela reduz para R$ 345,00" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="textarea-notes" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-acordo">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Salvar Alterações" : "Registrar Acordo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== REPORT MODAL ===== */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Relatório Mensal de Honorários
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={reportClientId} onValueChange={setReportClientId}>
                <SelectTrigger data-testid="select-report-client">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Mês</Label>
                <Select value={reportMonth} onValueChange={setReportMonth}>
                  <SelectTrigger data-testid="select-report-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ano</Label>
                <Input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} data-testid="input-report-year" />
              </div>
            </div>

            <div className="space-y-2 p-3 bg-gray-50 rounded-lg border">
              <p className="text-sm font-medium text-gray-700">Enviar relatório para:</p>
              {reportRecipients.length > 0 ? (
                <div className="space-y-2">
                  {reportRecipients.map(r => (
                    <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <Checkbox
                        checked={r.checked}
                        onCheckedChange={checked =>
                          setReportRecipients(prev => prev.map(x => x.id === r.id ? { ...x, checked: !!checked } : x))
                        }
                        data-testid={`checkbox-recipient-${r.id}`}
                      />
                      <span className="flex items-center gap-1">
                        {r.email ? <Mail className="w-3 h-3 text-blue-500" /> : <MessageSquare className="w-3 h-3 text-green-500" />}
                        {r.label}
                        <span className="text-xs text-muted-foreground ml-1">{r.email || r.phone}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Selecione um cliente para ver os destinatários disponíveis.</p>
              )}
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs font-medium text-gray-600">Destinatário avulso (opcional):</p>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> E-mail</Label>
                  <Input type="email" placeholder="email@exemplo.com.br" value={extraEmail} onChange={e => setExtraEmail(e.target.value)} data-testid="input-report-extra-email" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> WhatsApp</Label>
                  <Input placeholder="(61) 99999-9999" value={extraWhatsapp} onChange={e => setExtraWhatsapp(e.target.value)} data-testid="input-report-extra-whatsapp" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleDownloadReport} data-testid="button-download-report">
              <Download className="w-4 h-4 mr-2" /> Baixar Excel
            </Button>
            <Button onClick={handleSendReport} disabled={isSending || !reportClientId} data-testid="button-send-report">
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== IMPORT MODAL ===== */}
      <Dialog open={showImport} onOpenChange={open => { if (!open) { setShowImport(false); setImportPreview([]); setImportText(""); setImportFile(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Importar Acordos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Cliente de destino *</Label>
              <Select value={importClientId} onValueChange={setImportClientId}>
                <SelectTrigger data-testid="select-import-client">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={importType} onValueChange={(v: any) => { setImportType(v); setImportPreview([]); }}>
              <TabsList className="w-full">
                <TabsTrigger value="text" className="flex-1 gap-1"><ClipboardPaste className="w-4 h-4" />Colar Texto</TabsTrigger>
                <TabsTrigger value="csv" className="flex-1 gap-1"><FileSpreadsheet className="w-4 h-4" />CSV / Excel</TabsTrigger>
                <TabsTrigger value="pdf" className="flex-1 gap-1"><FileText className="w-4 h-4" />PDF</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-2 mt-3">
                <Label className="text-sm text-muted-foreground">Cole o conteúdo da planilha (copiada do Excel/Google Sheets):</Label>
                <Textarea
                  placeholder="Cole aqui a planilha copiada..."
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                  data-testid="textarea-import-text"
                />
              </TabsContent>

              <TabsContent value="csv" className="space-y-2 mt-3">
                <Label className="text-sm text-muted-foreground">Selecione um arquivo CSV ou Excel (.xlsx, .xls):</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={e => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="import-file-input"
                    data-testid="input-import-file"
                  />
                  <label htmlFor="import-file-input" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{importFile ? importFile.name : "Clique para selecionar arquivo"}</p>
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="pdf" className="space-y-2 mt-3">
                <Label className="text-sm text-muted-foreground">Selecione um arquivo PDF com a planilha:</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setImportFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="import-pdf-input"
                    data-testid="input-import-pdf"
                  />
                  <label htmlFor="import-pdf-input" className="cursor-pointer">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{importFile ? importFile.name : "Clique para selecionar PDF"}</p>
                  </label>
                </div>
              </TabsContent>
            </Tabs>

            <Button variant="outline" onClick={handleImportParse} disabled={importPreviewing} className="w-full" data-testid="button-import-parse">
              {importPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {importPreviewing ? "Processando com IA..." : "Extrair e Visualizar"}
            </Button>

            {/* Preview table */}
            {importPreview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">{importPreview.length} acordos detectados — revise antes de confirmar:</p>
                  <Button size="sm" variant="ghost" onClick={() => setImportPreview([])}><X className="w-4 h-4" /></Button>
                </div>
                <div className="overflow-auto max-h-72 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Devedor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Parcelas</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Prestação</TableHead>
                        <TableHead>Dia</TableHead>
                        <TableHead>%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{r.debtorName}</TableCell>
                          <TableCell className="text-xs">{r.agreementDate}</TableCell>
                          <TableCell className="text-xs">{r.isSinglePayment ? "ÚNICA" : r.installmentsCount}</TableCell>
                          <TableCell className="text-xs">{r.downPaymentValue ? formatCurrency(r.downPaymentValue) : "—"}</TableCell>
                          <TableCell className="text-xs">{r.installmentValue ? formatCurrency(r.installmentValue) : "—"}</TableCell>
                          <TableCell className="text-xs">{r.dueDay ? `Dia ${r.dueDay}` : "—"}</TableCell>
                          <TableCell className="text-xs">{r.feePercent}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-amber-600">Os devedores serão vinculados pelo nome. Certifique-se que os devedores já estão cadastrados no sistema para este cliente.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowImport(false); setImportPreview([]); }}>Cancelar</Button>
            {importPreview.length > 0 && (
              <Button onClick={handleImportConfirm} disabled={importSaving || !importClientId} data-testid="button-import-confirm">
                {importSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirmar Importação ({importPreview.length})
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
