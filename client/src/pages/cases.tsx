import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Filter, Download, MoreVertical, RefreshCw, CheckCircle2, FileText, Scale, Bot, Loader2, Sparkles, ChevronDown, ChevronUp, Pen, Trash2, Bell, BellDot, Eye, EyeOff, Clock, AlertTriangle, Gavel, Calendar as CalendarIcon, X, Globe, User, Hash, Building2, Upload, Brain, FileSearch, Monitor, ArrowUpCircle, ExternalLink, ShieldCheck, ArrowUpDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCases, useCaseMovements } from "@/hooks/use-cases";
import { useGeneratePiece, useAnalyzeIntimacao } from "@/hooks/use-ai";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { intimacoesApi } from "@/lib/api";
import { getAuthHeaders } from "@/lib/queryClient";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function MonitoringPanel() {
  const [activeMonTab, setActiveMonTab] = useState("processos");
  const [processMonitorings, setProcessMonitorings] = useState<any>(null);
  const [newProcessMonitorings, setNewProcessMonitorings] = useState<any>(null);
  const [diarioMonitorings, setDiarioMonitorings] = useState<any>(null);
  const [tribunalMonitorings, setTribunalMonitorings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newMonForm, setNewMonForm] = useState({ tipo: "process", caseNumber: "", tipoPessoa: "FISICA", valor: "", nome: "", termo: "" });
  const [creating, setCreating] = useState(false);
  const [balance, setBalance] = useState<any>(null);
  const { toast } = useToast();

  const fetchData = async (tab: string) => {
    setLoading(true);
    try {
      const headers = { ...getAuthHeaders() };
      if (tab === "processos") {
        const res = await fetch("/api/escavador/monitoring/processes", { headers, credentials: "include" });
        if (res.ok) setProcessMonitorings(await res.json());
      } else if (tab === "novos") {
        const res = await fetch("/api/escavador/monitoring/new-processes", { headers, credentials: "include" });
        if (res.ok) setNewProcessMonitorings(await res.json());
      } else if (tab === "diarios") {
        const res = await fetch("/api/escavador/monitoring/diarios", { headers, credentials: "include" });
        if (res.ok) setDiarioMonitorings(await res.json());
      } else if (tab === "tribunal") {
        const res = await fetch("/api/escavador/monitoring/tribunais", { headers, credentials: "include" });
        if (res.ok) setTribunalMonitorings(await res.json());
      }
      const balRes = await fetch("/api/escavador/status", { headers, credentials: "include" });
      if (balRes.ok) {
        const d = await balRes.json();
        setBalance(d.balance);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData("processos"); }, []);

  const handleCreate = async () => {
    if ((newMonForm.tipo === "process" || newMonForm.tipo === "tribunal") && !newMonForm.caseNumber.trim()) {
      toast({ title: "Preencha o número do processo", variant: "destructive" });
      return;
    }
    if (newMonForm.tipo === "new-process" && !newMonForm.valor.trim()) {
      toast({ title: "Preencha o CPF ou CNPJ", variant: "destructive" });
      return;
    }
    if (newMonForm.tipo === "diario" && !newMonForm.termo.trim()) {
      toast({ title: "Preencha o termo a monitorar", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      let url = "";
      let body: any = {};
      if (newMonForm.tipo === "process") {
        url = "/api/escavador/monitoring/process";
        body = { caseNumber: newMonForm.caseNumber.trim() };
      } else if (newMonForm.tipo === "new-process") {
        url = "/api/escavador/monitoring/new-process";
        body = { tipoPessoa: newMonForm.tipoPessoa, valor: newMonForm.valor.trim(), nome: newMonForm.nome.trim() };
      } else if (newMonForm.tipo === "tribunal") {
        url = "/api/escavador/monitoring/tribunal";
        body = { caseNumber: newMonForm.caseNumber.trim() };
      } else if (newMonForm.tipo === "diario") {
        url = "/api/escavador/monitoring/diario";
        body = { termo: newMonForm.termo.trim() };
      }
      const res = await fetch(url, { method: "POST", headers, credentials: "include", body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Monitoramento criado com sucesso!" });
        const tabMap: Record<string, string> = { "process": "processos", "new-process": "novos", "tribunal": "tribunal", "diario": "diarios" };
        fetchData(tabMap[newMonForm.tipo] || activeMonTab);
        setNewMonForm({ tipo: newMonForm.tipo, caseNumber: "", tipoPessoa: "FISICA", valor: "", nome: "", termo: "" });
      } else {
        toast({ title: "Erro ao criar monitoramento", description: data.error || "Falha ao criar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao criar monitoramento", variant: "destructive" });
    }
    setCreating(false);
  };

  const handleRemove = async (type: string, id: number) => {
    try {
      const headers = { ...getAuthHeaders() };
      const urlMap: Record<string, string> = {
        process: `/api/escavador/monitoring/process/${id}`,
        "new-process": `/api/escavador/monitoring/new-process/${id}`,
        tribunal: `/api/escavador/monitoring/tribunal/${id}`,
        diario: `/api/escavador/monitoring/diario/${id}`,
      };
      const res = await fetch(urlMap[type], { method: "DELETE", headers, credentials: "include" });
      if (res.ok) {
        toast({ title: "Monitoramento removido" });
        fetchData(activeMonTab);
      }
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const renderMonitoringList = (items: any[] | null, type: string) => {
    if (!items || items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p>Nenhum monitoramento ativo nesta categoria.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {item.numero_cnj || item.termo_monitorado || item.valor || item.nome || `#${item.id}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.criado_em ? `Criado: ${new Date(item.criado_em).toLocaleDateString("pt-BR")}` : ""}
                {item.status ? ` • Status: ${item.status}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemove(type, item.id)} data-testid={`btn-remove-mon-${item.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {balance && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          <ShieldCheck className="w-4 h-4" />
          Saldo Escavador: <strong>R$ {(balance.saldo / 100).toFixed(2)}</strong>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Novo Monitoramento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "process", label: "Processo (Movimentações)" },
                { value: "new-process", label: "Novos Processos (CPF/CNPJ)" },
                { value: "tribunal", label: "Tribunal (Site)" },
                { value: "diario", label: "Diário Oficial" },
              ].map((opt) => (
                <Button key={opt.value} variant={newMonForm.tipo === opt.value ? "default" : "outline"} size="sm" onClick={() => setNewMonForm(f => ({ ...f, tipo: opt.value }))} data-testid={`btn-mon-type-${opt.value}`}>
                  {opt.label}
                </Button>
              ))}
            </div>

            {(newMonForm.tipo === "process" || newMonForm.tipo === "tribunal") && (
              <Input placeholder="Número CNJ (ex: 0000000-00.0000.0.00.0000)" value={newMonForm.caseNumber} onChange={(e) => setNewMonForm(f => ({ ...f, caseNumber: e.target.value }))} data-testid="input-mon-case-number" />
            )}

            {newMonForm.tipo === "new-process" && (
              <div className="grid grid-cols-3 gap-2">
                <Select value={newMonForm.tipoPessoa} onValueChange={(v) => setNewMonForm(f => ({ ...f, tipoPessoa: v }))}>
                  <SelectTrigger data-testid="select-mon-tipo-pessoa"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FISICA">Pessoa Física</SelectItem>
                    <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="CPF ou CNPJ" value={newMonForm.valor} onChange={(e) => setNewMonForm(f => ({ ...f, valor: e.target.value }))} data-testid="input-mon-valor" />
                <Input placeholder="Nome (opcional)" value={newMonForm.nome} onChange={(e) => setNewMonForm(f => ({ ...f, nome: e.target.value }))} data-testid="input-mon-nome" />
              </div>
            )}

            {newMonForm.tipo === "diario" && (
              <Input placeholder="Termo a monitorar (ex: nome do escritório)" value={newMonForm.termo} onChange={(e) => setNewMonForm(f => ({ ...f, termo: e.target.value }))} data-testid="input-mon-termo" />
            )}

            <Button onClick={handleCreate} disabled={creating} className="w-fit gap-2" data-testid="btn-create-monitoring">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Monitoramento
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeMonTab} onValueChange={(v) => { setActiveMonTab(v); fetchData(v); }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="processos" data-testid="mon-tab-processos">Processos</TabsTrigger>
          <TabsTrigger value="novos" data-testid="mon-tab-novos">Novos Proc.</TabsTrigger>
          <TabsTrigger value="tribunal" data-testid="mon-tab-tribunal">Tribunal</TabsTrigger>
          <TabsTrigger value="diarios" data-testid="mon-tab-diarios">Diários</TabsTrigger>
        </TabsList>
        <TabsContent value="processos">{loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderMonitoringList(processMonitorings?.items || processMonitorings, "process")}</TabsContent>
        <TabsContent value="novos">{loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderMonitoringList(newProcessMonitorings?.items || newProcessMonitorings, "new-process")}</TabsContent>
        <TabsContent value="tribunal">{loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderMonitoringList(tribunalMonitorings?.items || tribunalMonitorings, "tribunal")}</TabsContent>
        <TabsContent value="diarios">{loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : renderMonitoringList(diarioMonitorings?.items || diarioMonitorings, "diario")}</TabsContent>
      </Tabs>
    </div>
  );
}

export default function CasesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState<"input" | "loading" | "review" | "success">("input");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [importNumber, setImportNumber] = useState("");
  const [escavadorImportResult, setEscavadorImportResult] = useState<any>(null);
  const [generatePieceOpen, setGeneratePieceOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [pieceType, setPieceType] = useState("Manifestação");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [generatedPiece, setGeneratedPiece] = useState<any>(null);
  const [mainTab, setMainTab] = useState("intimacoes");
  const [intimacoesFilter, setIntimacoesFilter] = useState<"all" | "unread" | "intimacao" | "decisao" | "sentenca">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "Escavador">("all");
  const [intimacoesSearch, setIntimacoesSearch] = useState("");
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 7);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(defaultStartDate);
  const [dateTo, setDateTo] = useState<Date | undefined>(defaultEndDate);
  const [customDateMode, setCustomDateMode] = useState(false);
  const [caseFilter, setCaseFilter] = useState<string>("all");

  const { data: cases, isLoading } = useCases();
  const { data: movements, isLoading: movementsLoading } = useCaseMovements(selectedCase?.id);
  const generatePiece = useGeneratePiece();
  const analyzeIntimacao = useAnalyzeIntimacao();
  const [intimacaoAnalysis, setIntimacaoAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [deadlineAnalyses, setDeadlineAnalyses] = useState<Record<number, any>>({});
  const [analyzingDeadlines, setAnalyzingDeadlines] = useState<Record<number, boolean>>({});
  const [intimacoesView, setIntimacoesView] = useState<"pendentes" | "vencidos" | "criticos" | "estrategicos" | "semana" | "historico" | "hoje">("pendentes");
  const [deadlineFilter, setDeadlineFilter] = useState<"todos" | "hoje" | "semana" | "mes">("todos");
  const [intimacoesSort, setIntimacoesSort] = useState<"urgencia" | "data">("data");
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [escavadorForceSync, setEscavadorForceSync] = useState(false);
  const [escavadorSyncProgress, setEscavadorSyncProgress] = useState<{ running: boolean; total: number; current: number; synced: number; errors: number; newMovements: number; currentCase: string } | null>(null);
  const [escavadorOpen, setEscavadorOpen] = useState(false);
  const [escavadorSearchType, setEscavadorSearchType] = useState<"nome" | "cpf_cnpj" | "oab" | "numero">("nome");
  const [escavadorQuery, setEscavadorQuery] = useState("");
  const [escavadorOabState, setEscavadorOabState] = useState("DF");
  const [escavadorResults, setEscavadorResults] = useState<any>(null);
  const [escavadorLoading, setEscavadorLoading] = useState(false);
  const [escavadorError, setEscavadorError] = useState("");
  const [escavadorImporting, setEscavadorImporting] = useState<string | null>(null);
  const [escavadorAISummary, setEscavadorAISummary] = useState<any>(null);
  const [escavadorAILoading, setEscavadorAILoading] = useState(false);
  const [escavadorDocs, setEscavadorDocs] = useState<any>(null);
  const [escavadorDocsLoading, setEscavadorDocsLoading] = useState(false);
  const [escavadorUpdateStatus, setEscavadorUpdateStatus] = useState<any>(null);
  const [escavadorUpdating, setEscavadorUpdating] = useState(false);
  const [importSource, setImportSource] = useState<"escavador">("escavador");
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [batchTab, setBatchTab] = useState<"processos" | "clientes" | "escavador">("processos");
  const [batchCasesData, setBatchCasesData] = useState<any[]>([]);
  const [batchClientsData, setBatchClientsData] = useState<any[]>([]);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [escavadorCnjList, setEscavadorCnjList] = useState("");
  const [escavadorBulkImporting, setEscavadorBulkImporting] = useState(false);
  const [manualCaseOpen, setManualCaseOpen] = useState(false);
  const [manualCaseForm, setManualCaseForm] = useState({
    caseNumber: "",
    title: "",
    caseType: "civil",
    court: "",
    clientId: "",
    status: "ativo",
    autor: "",
    reu: "",
    vara: "",
  });
  const [manualCaseSubmitting, setManualCaseSubmitting] = useState(false);

  const { data: clientsList } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const toggleOwnCaseMutation = useMutation({
    mutationFn: async ({ id, isOwnCase }: { id: number; isOwnCase: boolean }) => {
      const res = await fetch(`/api/cases/${id}/own-case`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ isOwnCase }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
    },
  });

  const toggleStrategicMutation = useMutation({
    mutationFn: async ({ id, isStrategic }: { id: number; isStrategic: boolean }) => {
      const res = await fetch(`/api/cases/${id}/strategic`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ isStrategic }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
    },
  });

  const intimacoesStartDate = dateFrom ? formatLocalDate(dateFrom) : undefined;
  const intimacoesEndDate = dateTo ? formatLocalDate(dateTo) : undefined;
  const hasValidDates = !!intimacoesStartDate && !!intimacoesEndDate;
  const { data: intimacoes, isLoading: intimacoesLoading, refetch: refetchIntimacoes } = useQuery({
    queryKey: ["intimacoes", intimacoesStartDate, intimacoesEndDate],
    queryFn: () => intimacoesApi.getAll(intimacoesStartDate, intimacoesEndDate),
    staleTime: 0,
    enabled: hasValidDates,
  });

  const { data: unreadCountData } = useQuery({
    queryKey: ["intimacoes", "unread-count"],
    queryFn: intimacoesApi.getUnreadCount,
    refetchInterval: 60000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: intimacoesApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes", "unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: intimacoesApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes", "unread-count"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: intimacoesApi.acknowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes", "unread-count"] });
      toast({ title: "Intimação marcada como ciente." });
    },
    onError: () => {
      toast({ title: "Erro ao marcar como ciente. Tente novamente.", variant: "destructive" });
    },
  });

  const batchAnalyzeRef = useRef(false);
  useEffect(() => {
    if (mainTab === "intimacoes" && intimacoes && intimacoes.length > 0 && !batchAnalyzeRef.current) {
      const unanalyzed = intimacoes.filter((i: any) => !i.aiAnalyzedAt);
      if (unanalyzed.length > 0 && !batchAnalyzing) {
        batchAnalyzeRef.current = true;
        setBatchAnalyzing(true);
        intimacoesApi.batchAnalyze()
          .then((result) => {
            if (result.analyzed > 0) {
              queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
              if (result.analyzed < result.total) {
                batchAnalyzeRef.current = false;
              }
            }
          })
          .catch(() => { batchAnalyzeRef.current = false; })
          .finally(() => setBatchAnalyzing(false));
      }
    }
  }, [mainTab, intimacoes]);

  const handleManualCaseSubmit = async () => {
    if (!manualCaseForm.caseNumber) {
      toast({ title: "Preencha o número do processo", variant: "destructive" });
      return;
    }
    setManualCaseSubmitting(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          caseNumber: manualCaseForm.caseNumber,
          title: manualCaseForm.title || `Processo ${manualCaseForm.caseNumber}`,
          caseType: manualCaseForm.caseType,
          court: manualCaseForm.court || "A definir",
          clientId: manualCaseForm.clientId ? parseInt(manualCaseForm.clientId) : null,
          status: manualCaseForm.status,
          autor: manualCaseForm.autor || null,
          reu: manualCaseForm.reu || null,
          vara: manualCaseForm.vara || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar processo");
      }
      toast({ title: "Processo criado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      setManualCaseOpen(false);
      setManualCaseForm({
        caseNumber: "", title: "", caseType: "civil", court: "",
        clientId: "", status: "ativo", autor: "", reu: "", vara: "",
      });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setManualCaseSubmitting(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const result = await intimacoesApi.syncAll();
      toast({ title: `Sincronização concluída: ${result.synced} processos, ${result.newMovements} novas movimentações (Escavador)` });
      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
      queryClient.invalidateQueries({ queryKey: ["intimacoes", "unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    } catch (error) {
      toast({ title: "Erro na sincronização", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const escavadorPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (escavadorPollRef.current) {
        clearInterval(escavadorPollRef.current);
        escavadorPollRef.current = null;
      }
    };
  }, []);

  const handleEscavadorForceSync = async () => {
    if (escavadorPollRef.current) {
      clearInterval(escavadorPollRef.current);
      escavadorPollRef.current = null;
    }

    try {
      setEscavadorForceSync(true);
      const res = await fetch("/api/escavador/force-sync", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start sync");
      toast({ title: "Sincronização Escavador iniciada em background" });

      escavadorPollRef.current = setInterval(async () => {
        try {
          const progressRes = await fetch("/api/escavador/force-sync/progress", {
            headers: getAuthHeaders(),
            credentials: "include",
          });
          const progress = await progressRes.json();
          setEscavadorSyncProgress(progress);

          if (progress.done || (!progress.running)) {
            if (escavadorPollRef.current) {
              clearInterval(escavadorPollRef.current);
              escavadorPollRef.current = null;
            }
            setEscavadorForceSync(false);
            if (progress.synced > 0 || progress.newMovements > 0) {
              toast({ title: `Escavador sync concluído: ${progress.synced} processos, ${progress.newMovements} novas movimentações` });
            } else {
              toast({ title: "Sincronização Escavador concluída (sem novas movimentações)" });
            }
            queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
            queryClient.invalidateQueries({ queryKey: ["intimacoes", "unread-count"] });
            queryClient.invalidateQueries({ queryKey: ["cases"] });
            setTimeout(() => setEscavadorSyncProgress(null), 5000);
          }
        } catch {
          if (escavadorPollRef.current) {
            clearInterval(escavadorPollRef.current);
            escavadorPollRef.current = null;
          }
          setEscavadorForceSync(false);
        }
      }, 3000);
    } catch (error) {
      toast({ title: "Erro ao iniciar sincronização Escavador", variant: "destructive" });
      setEscavadorForceSync(false);
    }
  };

  const { data: escavadorStatus } = useQuery({
    queryKey: ["escavador-status"],
    queryFn: async () => {
      const res = await fetch("/api/escavador/status", { headers: getAuthHeaders(), credentials: "include" });
      return res.json();
    },
  });

  const escavadorConfigured = escavadorStatus?.configured === true;

  const handleEscavadorSearch = async () => {
    if (!escavadorQuery.trim()) return;
    setEscavadorLoading(true);
    setEscavadorError("");
    setEscavadorResults(null);

    try {
      let url = "";
      let body: any = {};

      if (escavadorSearchType === "numero") {
        url = "/api/escavador/search-process";
        body = { caseNumber: escavadorQuery };
      } else if (escavadorSearchType === "oab") {
        url = "/api/escavador/search-oab";
        body = { oabNumber: escavadorQuery, oabState: escavadorOabState };
      } else {
        url = "/api/escavador/search-person";
        body = { query: escavadorQuery };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setEscavadorError(data.error || "Erro na consulta");
        return;
      }

      if (escavadorSearchType === "numero") {
        setEscavadorResults({ items: [data], total: 1 });
      } else {
        setEscavadorResults({
          items: data.processos || [],
          total: data.quantidade_processos || data.processos?.length || 0,
          nome: data.nome,
        });
      }
    } catch (error) {
      setEscavadorError("Erro ao consultar o Escavador. Verifique sua conexão.");
    } finally {
      setEscavadorLoading(false);
    }
  };

  const handleEscavadorImport = async (processo: any) => {
    setEscavadorImporting(processo.numero_cnj);
    try {
      const response = await fetch("/api/escavador/create-from-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ escavadorData: processo }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast({ title: "Este processo já existe no sistema", variant: "destructive" });
        } else {
          toast({ title: result.error || "Erro ao importar", variant: "destructive" });
        }
        return;
      }

      toast({
        title: "Processo importado com sucesso!",
        description: `${result.movementsImported} movimentações importadas via Escavador.`,
      });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    } catch (error) {
      toast({ title: "Erro ao importar processo", variant: "destructive" });
    } finally {
      setEscavadorImporting(null);
    }
  };

  const unreadCount = unreadCountData?.count ?? 0;

  const filteredIntimacoes = (intimacoes || []).filter((item: any) => {
    if (intimacoesFilter === "unread" && item.isRead) return false;
    const typeLC = (item.type || "").toLowerCase();
    if (intimacoesFilter === "intimacao" && typeLC !== "intimação" && typeLC !== "intimacao") return false;
    if (intimacoesFilter === "decisao" && typeLC !== "decisão" && typeLC !== "decisao") return false;
    if (intimacoesFilter === "sentenca" && typeLC !== "sentença" && typeLC !== "sentenca") return false;
    const itemSource = item.source || "Escavador";
    if (sourceFilter !== "all" && itemSource !== sourceFilter) return false;
    if (caseFilter && caseFilter !== "all") {
      if (String(item.caseId) !== caseFilter) return false;
    }
    if (intimacoesSearch) {
      const search = intimacoesSearch.toLowerCase();
      return (
        item.description?.toLowerCase().includes(search) ||
        item.caseNumber?.toLowerCase().includes(search) ||
        item.caseTitle?.toLowerCase().includes(search) ||
        item.court?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const getBrazilDateStr = (d: Date): string => {
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const brazil = new Date(utc - 3 * 3600000);
    return brazil.toISOString().split('T')[0];
  };
  const toYMD = (dateInput: string | Date | null): string | null => {
    if (!dateInput) return null;
    const s = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
    return s.substring(0, 10);
  };
  const todayStr = getBrazilDateStr(new Date());

  const viewFilteredIntimacoes = filteredIntimacoes.filter((item: any) => {
    if (intimacoesView === "historico") return !!item.acknowledgedAt;
    if (item.acknowledgedAt) return false;
    const status = item.aiDeadlineStatus;
    if (intimacoesView === "hoje") {
      const itemDate = toYMD(item.date);
      return itemDate === todayStr;
    }
    if (intimacoesView === "vencidos") return status === "vencido";
    if (intimacoesView === "criticos") return status === "vencido" || status === "critico";
    if (intimacoesView === "estrategicos") return !!item.isStrategic;
    if (intimacoesView === "semana") {
      if (!item.aiDeadlineDate) return true;
      const deadlineYMD = toYMD(item.aiDeadlineDate);
      if (!deadlineYMD) return true;
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekStr = getBrazilDateStr(weekFromNow);
      return deadlineYMD <= weekStr;
    }
    return true;
  }).filter((item: any) => {
    if (deadlineFilter === "todos") return true;
    const deadlineYMD = toYMD(item.aiDeadlineDate);
    if (!deadlineYMD) return false;
    if (deadlineFilter === "hoje") return deadlineYMD === todayStr;
    if (deadlineFilter === "semana") {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekStr = getBrazilDateStr(weekFromNow);
      return deadlineYMD >= todayStr && deadlineYMD <= weekStr;
    }
    if (deadlineFilter === "mes") {
      const now = new Date();
      const monthFromNow = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const monthStr = getBrazilDateStr(monthFromNow);
      return deadlineYMD >= todayStr && deadlineYMD <= monthStr;
    }
    return true;
  });

  const urgencySortedIntimacoes = [...viewFilteredIntimacoes].sort((a: any, b: any) => {
    if (intimacoesSort === "data") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    const order: Record<string, number> = { vencido: 0, critico: 1, urgente: 2, normal: 3 };
    const aOrder = a.aiDeadlineStatus ? (order[a.aiDeadlineStatus] ?? 4) : 5;
    const bOrder = b.aiDeadlineStatus ? (order[b.aiDeadlineStatus] ?? 4) : 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.aiDeadlineDate && b.aiDeadlineDate) return a.aiDeadlineDate.localeCompare(b.aiDeadlineDate);
    if (a.aiDeadlineDate) return -1;
    if (b.aiDeadlineDate) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const intimacoesCounts = {
    hoje: filteredIntimacoes.filter((i: any) => {
      if (i.acknowledgedAt) return false;
      const itemDate = toYMD(i.date);
      return itemDate === todayStr;
    }).length,
    pendentes: filteredIntimacoes.filter((i: any) => !i.acknowledgedAt).length,
    vencidos: filteredIntimacoes.filter((i: any) => !i.acknowledgedAt && i.aiDeadlineStatus === "vencido").length,
    criticos: filteredIntimacoes.filter((i: any) => !i.acknowledgedAt && (i.aiDeadlineStatus === "vencido" || i.aiDeadlineStatus === "critico")).length,
    estrategicos: filteredIntimacoes.filter((i: any) => !i.acknowledgedAt && !!i.isStrategic).length,
    historico: filteredIntimacoes.filter((i: any) => !!i.acknowledgedAt).length,
  };

  const uniqueCases = (intimacoes || []).reduce((acc: { id: string; label: string }[], item: any) => {
    if (item.caseId && !acc.find((c) => c.id === String(item.caseId))) {
      acc.push({ id: String(item.caseId), label: item.caseNumber || item.caseTitle || `Processo #${item.caseId}` });
    }
    return acc;
  }, []);

  const hasActiveFilters = customDateMode || caseFilter !== "all" || sourceFilter !== "all";

  const clearAllFilters = () => {
    const resetEnd = new Date();
    const resetStart = new Date();
    resetStart.setDate(resetStart.getDate() - 7);
    setDateFrom(resetStart);
    setDateTo(resetEnd);
    setCustomDateMode(false);
    setCaseFilter("all");
    setSourceFilter("all");
    setIntimacoesSearch("");
    setIntimacoesFilter("all");
  };

  const calcDaysRemaining = (dateStr: string, type: string = "uteis") => {
    const target = new Date(dateStr + "T23:59:59");
    const now = new Date();
    if (target < now) return 0;
    if (type === "corridos") {
      const diffMs = target.getTime() - now.getTime();
      return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
    let count = 0;
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    while (current <= target) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const toBusinessDateKey = (dateStr: string) => {
    const d = new Date(dateStr);
    let day = d.getUTCDate();
    let month = d.getUTCMonth();
    let year = d.getUTCFullYear();
    const dow = d.getUTCDay();
    if (dow === 0) { day -= 2; }
    else if (dow === 6) { day -= 1; }
    const adjusted = new Date(Date.UTC(year, month, day));
    return `${String(adjusted.getUTCDate()).padStart(2, '0')}/${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}/${adjusted.getUTCFullYear()}`;
  };

  const toBrazilDate = (dateStr: string) => toBusinessDateKey(dateStr);

  const getBrazilNow = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year')!.value);
    const month = parseInt(parts.find(p => p.type === 'month')!.value);
    const day = parseInt(parts.find(p => p.type === 'day')!.value);
    return new Date(Date.UTC(year, month - 1, day));
  };

  const isWeekday = () => {
    const d = getBrazilNow();
    const dow = d.getUTCDay();
    return dow >= 1 && dow <= 5;
  };

  const formatDateKey = (d: Date) => {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };

  const getTodayKey = () => formatDateKey(getBrazilNow());

  const getYesterdayKey = () => {
    const d = getBrazilNow();
    d.setUTCDate(d.getUTCDate() - 1);
    let dow = d.getUTCDay();
    while (dow === 0 || dow === 6) {
      d.setUTCDate(d.getUTCDate() - 1);
      dow = d.getUTCDay();
    }
    return formatDateKey(d);
  };


  const getMovementIcon = (type: string) => {
    switch (type) {
      case "Intimação": return <Bell className="w-4 h-4 text-orange-600" />;
      case "Decisão": return <Gavel className="w-4 h-4 text-blue-600" />;
      case "Sentença": return <Scale className="w-4 h-4 text-red-600" />;
      case "Audiência": return <CalendarIcon className="w-4 h-4 text-purple-600" />;
      case "Juntada": return <FileText className="w-4 h-4 text-green-600" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMovementBadgeVariant = (type: string) => {
    switch (type) {
      case "Intimação": return "bg-orange-100 text-orange-700 border-orange-200";
      case "Decisão":
      case "Decisão Interlocutória": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Sentença": return "bg-red-100 text-red-700 border-red-200";
      case "Audiência": return "bg-purple-100 text-purple-700 border-purple-200";
      case "Juntada":
      case "Juntada de Petição": return "bg-green-100 text-green-700 border-green-200";
      case "Despacho": return "bg-sky-100 text-sky-700 border-sky-200";
      case "Citação": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "Certidão": return "bg-slate-100 text-slate-600 border-slate-200";
      case "Ato Ordinatório": return "bg-zinc-100 text-zinc-600 border-zinc-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const handleDeleteCase = async () => {
    if (!caseToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/cases/${caseToDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "Processo excluído com sucesso!" });
        queryClient.invalidateQueries({ queryKey: ["cases"] });
        setDeleteDialogOpen(false);
        setCaseToDelete(null);
        if (selectedCase?.id === caseToDelete.id) {
          setSelectedCase(null);
        }
      } else {
        const error = await response.json();
        toast({ title: error.error || "Erro ao excluir processo", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting case:", error);
      toast({ title: "Erro ao excluir processo", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleCaseSelection = (id: number) => {
    setSelectedCaseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCaseIds.size === filteredCases.length) {
      setSelectedCaseIds(new Set());
    } else {
      setSelectedCaseIds(new Set(filteredCases.map((c: any) => c.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedCaseIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const response = await fetch("/api/cases/batch", {
        method: "DELETE",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caseIds: Array.from(selectedCaseIds) }),
      });
      if (response.ok) {
        const result = await response.json();
        toast({ title: `${result.deleted} processo(s) excluído(s) com sucesso!` });
        queryClient.invalidateQueries({ queryKey: ["cases"] });
        setSelectedCaseIds(new Set());
        setBatchDeleteDialogOpen(false);
        setSelectedCase(null);
      } else {
        const error = await response.json();
        toast({ title: error.error || "Erro ao excluir processos", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao excluir processos", variant: "destructive" });
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleImportDialogChange = (open: boolean) => {
    setIsImporting(open);
    if (open) {
      setImportStep("input");
      setImportNumber("");
      setEscavadorImportResult(null);
    }
  };

  const handleImport = async () => {
    setImportStep("loading");
    try {
      const response = await fetch("/api/escavador/search-process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ caseNumber: importNumber }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Processo não encontrado");
      }
      const result = await response.json();
      setEscavadorImportResult(result);
      setImportStep("review");
    } catch (error: any) {
      console.error("Error searching Escavador:", error);
      toast({ title: error.message || "Processo não encontrado no Escavador", variant: "destructive" });
      setImportStep("input");
    }
  };

  const confirmImport = async () => {
    if (!escavadorImportResult) return;
    
    setIsConfirming(true);
    try {
      const response = await fetch("/api/escavador/import-process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ escavadorData: escavadorImportResult }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        if (response.status === 409) {
          toast({ title: "Este processo já existe no sistema", variant: "destructive" });
        } else {
          toast({ title: result.error || "Erro ao importar processo", variant: "destructive" });
        }
        setIsConfirming(false);
        return;
      }
      
      toast({ 
        title: "Processo importado com sucesso!", 
        description: `${result.movementsImported} movimentações importadas.` 
      });
      setImportStep("success");
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      
      setTimeout(() => {
        setImportStep("input");
        setIsImporting(false);
        setEscavadorImportResult(null);
        setImportNumber("");
        setIsConfirming(false);
      }, 1500);
    } catch (error) {
      console.error("Error importing case:", error);
      toast({ title: "Erro ao importar processo", variant: "destructive" });
      setIsConfirming(false);
    }
  };

  const handleAnalyzeDeadline = async (item: any) => {
    if (analyzingDeadlines[item.id]) return;
    setAnalyzingDeadlines(prev => ({ ...prev, [item.id]: true }));
    const caseItem = cases?.find((c: any) => c.id === item.caseId);
    try {
      const analysis = await analyzeIntimacao.mutateAsync({
        description: item.description,
        teor: item.teor,
        type: item.type,
        caseNumber: item.caseNumber || caseItem?.caseNumber,
        court: item.court || caseItem?.court,
        caseClass: caseItem?.caseClass,
        classeNome: caseItem?.classeNome,
        vara: caseItem?.vara,
        intimationDate: item.date,
      });
      setDeadlineAnalyses(prev => ({ ...prev, [item.id]: analysis }));
    } catch {
      toast({ title: "Não foi possível analisar o prazo desta intimação.", variant: "destructive" });
    } finally {
      setAnalyzingDeadlines(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleOpenGeneratePieceFromIntimacao = async (item: any, preAnalysis?: any) => {
    const caseItem = cases?.find((c: any) => c.id === item.caseId);
    if (caseItem) setSelectedCase(caseItem);
    setSelectedMovement(item);
    setGeneratedPiece(null);
    setGeneratePieceOpen(true);

    if (preAnalysis) {
      setIntimacaoAnalysis(preAnalysis);
      if (preAnalysis.suggestedPieceType) {
        setPieceType(preAnalysis.suggestedPieceType);
      }
      setIsAnalyzing(false);
      return;
    }

    setIntimacaoAnalysis(null);
    setIsAnalyzing(true);

    try {
      const analysis = await analyzeIntimacao.mutateAsync({
        description: item.description,
        teor: item.teor,
        type: item.type,
        caseNumber: item.caseNumber || caseItem?.caseNumber,
        court: item.court || caseItem?.court,
        caseClass: caseItem?.caseClass,
        classeNome: caseItem?.classeNome,
        vara: caseItem?.vara,
        intimationDate: item.date,
      });
      setIntimacaoAnalysis(analysis);
      if (analysis.suggestedPieceType) {
        setPieceType(analysis.suggestedPieceType);
      }
    } catch {
      setIntimacaoAnalysis(null);
      toast({ title: "Não foi possível analisar a intimação automaticamente. Selecione o tipo de peça manualmente.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGeneratePiece = async () => {
    const caseCtx = selectedCase || (selectedMovement ? cases?.find((c: any) => c.id === selectedMovement.caseId) : null);
    if (!caseCtx || !selectedMovement) return;
    
    try {
      const result = await generatePiece.mutateAsync({
        pieceType,
        caseContext: {
          caseNumber: caseCtx.caseNumber,
          court: caseCtx.court,
          caseClass: caseCtx.caseClass || "Procedimento Comum",
          subject: caseCtx.subject || "Não especificado",
        },
        intimationText: selectedMovement.description + (selectedMovement.teor ? `\n\nTeor: ${selectedMovement.teor}` : ""),
        additionalInstructions,
      });
      setGeneratedPiece(result);
    } catch (error) {
      console.error("Error generating piece:", error);
    }
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let current = "";
    let inQuotes = false;
    let row: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(current.trim());
          current = "";
        } else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(current.trim());
          if (row.some(cell => cell !== "")) rows.push(row);
          row = [];
          current = "";
        } else {
          current += ch;
        }
      }
    }
    row.push(current.trim());
    if (row.some(cell => cell !== "")) rows.push(row);
    return rows;
  };

  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "processos" | "clientes") => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    
    if (isExcel && type === "processos") {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/cases/parse-excel", {
          method: "POST",
          credentials: "include",
          headers: getAuthHeaders(),
          body: formData,
        });
        const result = await res.json();
        if (!res.ok) {
          toast({ title: result.error || "Erro ao processar arquivo", variant: "destructive" });
          return;
        }
        if (!result.cases || result.cases.length === 0) {
          toast({ title: "Nenhum processo encontrado no arquivo", variant: "destructive" });
          return;
        }
        setBatchCasesData(result.cases);
        toast({ title: `${result.cases.length} processo(s) encontrado(s) no Excel` });
      } catch (error) {
        toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
      }
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast({ title: "Arquivo vazio ou sem dados", variant: "destructive" });
        return;
      }
      const dataRows = rows.slice(1);
      if (type === "processos") {
        setBatchCasesData(dataRows.map(r => ({
          caseNumber: r[0] || "",
          title: r[1] || "",
          caseType: r[2] || "civil",
          court: r[3] || "",
          clientName: r[4] || "",
          status: r[5] || "ativo",
          autor: r[6] || "",
          reu: r[7] || "",
          vara: r[8] || "",
        })));
      } else {
        setBatchClientsData(dataRows.map(r => ({
          name: r[0] || "",
          document: r[1] || "",
          type: r[2] || "fisica",
          email: r[3] || "",
          phone: r[4] || "",
          address: r[5] || "",
        })));
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleBatchImport = async () => {
    setBatchImporting(true);
    setBatchResult(null);
    try {
      if (batchTab === "processos" && batchCasesData.length > 0) {
        const res = await fetch("/api/cases/batch-import", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ cases: batchCasesData }),
        });
        const result = await res.json();
        setBatchResult(result);
        queryClient.invalidateQueries({ queryKey: ["cases"] });
      } else if (batchTab === "clientes" && batchClientsData.length > 0) {
        const res = await fetch("/api/clients/batch-import", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ clients: batchClientsData }),
        });
        const result = await res.json();
        setBatchResult(result);
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      }
    } catch (err) {
      toast({ title: "Erro na importação", variant: "destructive" });
    } finally {
      setBatchImporting(false);
    }
  };

  const handleEscavadorBulkImport = async () => {
    const lines = escavadorCnjList.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length >= 15);
    if (lines.length === 0) {
      toast({ title: "Nenhum número CNJ válido encontrado", variant: "destructive" });
      return;
    }
    if (lines.length > 200) {
      toast({ title: "Máximo de 200 processos por importação", variant: "destructive" });
      return;
    }
    setEscavadorBulkImporting(true);
    setEscavadorImportResult(null);
    try {
      const res = await fetch("/api/escavador/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ cnjNumbers: lines }),
      });
      const result = await res.json();
      setEscavadorImportResult(result);
      if (result.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["cases"] });
        toast({ title: `${result.imported} processo(s) importado(s) do Escavador` });
      }
    } catch (err) {
      toast({ title: "Erro na importação do Escavador", variant: "destructive" });
    } finally {
      setEscavadorBulkImporting(false);
    }
  };

  const filteredCases = cases?.filter((c: any) =>
    c.caseNumber.includes(searchTerm) ||
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.court.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-page-title">Processos</h1>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="intimacoes" className="gap-2 relative" data-testid="tab-intimacoes">
            {unreadCount > 0 ? <BellDot className="w-4 h-4 text-orange-600" /> : <Bell className="w-4 h-4" />}
            Intimações
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">{unreadCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="monitoramento" className="gap-2" data-testid="tab-monitoramento">
            <Monitor className="w-4 h-4" />
            Monitoramento
          </TabsTrigger>
          <TabsTrigger value="processos" className="gap-2" data-testid="tab-processos">
            <Scale className="w-4 h-4" />
            Processos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="processos" className="space-y-4">
      <div className="flex gap-2 button-group-responsive">
          <Button className="gap-2 btn-responsive" variant="outline" onClick={() => { setBatchImportOpen(true); setBatchResult(null); setBatchCasesData([]); setBatchClientsData([]); }} data-testid="btn-importar-lote">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar em Lote</span>
            <span className="sm:hidden">Lote</span>
          </Button>
          
          <Dialog open={escavadorOpen} onOpenChange={(open) => {
            setEscavadorOpen(open);
            if (!open) {
              setEscavadorResults(null);
              setEscavadorError("");
              setEscavadorQuery("");
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className={`gap-2 btn-responsive ${escavadorConfigured ? "border-green-200 hover:border-green-300" : "border-orange-200 hover:border-orange-300"}`} data-testid="btn-buscar-escavador">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Buscar Escavador</span>
                <span className="sm:hidden">Escavador</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-green-600" />
                  Busca Avançada - Escavador
                </DialogTitle>
                <DialogDescription>
                  Busque processos por nome, CPF/CNPJ, OAB ou número CNJ nos tribunais de todo o Brasil.
                </DialogDescription>
              </DialogHeader>

              {!escavadorConfigured ? (
                <div className="py-6">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
                    <h4 className="font-medium text-orange-800">API do Escavador não configurada</h4>
                    <p className="text-sm text-orange-700">
                      Para usar a busca avançada, adicione sua chave de API do Escavador nas configurações (ESCAVADOR_API_KEY).
                    </p>
                    <p className="text-xs text-orange-600">
                      Crie sua chave em: api.escavador.com/tokens
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex gap-1">
                      <Button
                        variant={escavadorSearchType === "nome" ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setEscavadorSearchType("nome"); setEscavadorQuery(""); setEscavadorResults(null); }}
                        className="gap-1 text-xs"
                        data-testid="btn-search-type-nome"
                      >
                        <User className="w-3 h-3" />
                        Nome/CPF/CNPJ
                      </Button>
                      <Button
                        variant={escavadorSearchType === "oab" ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setEscavadorSearchType("oab"); setEscavadorQuery(""); setEscavadorResults(null); }}
                        className="gap-1 text-xs"
                        data-testid="btn-search-type-oab"
                      >
                        <Building2 className="w-3 h-3" />
                        OAB
                      </Button>
                      <Button
                        variant={escavadorSearchType === "numero" ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setEscavadorSearchType("numero"); setEscavadorQuery(""); setEscavadorResults(null); }}
                        className="gap-1 text-xs"
                        data-testid="btn-search-type-numero"
                      >
                        <Hash className="w-3 h-3" />
                        N. CNJ
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      {escavadorSearchType === "oab" && (
                        <Select value={escavadorOabState} onValueChange={setEscavadorOabState}>
                          <SelectTrigger className="w-[80px]" data-testid="select-oab-state">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        placeholder={
                          escavadorSearchType === "nome" ? "Nome completo, CPF ou CNPJ..." :
                          escavadorSearchType === "oab" ? "Número da OAB..." :
                          "0000000-00.0000.0.00.0000"
                        }
                        value={escavadorQuery}
                        onChange={(e) => {
                          if (escavadorSearchType === "numero") {
                            const digits = e.target.value.replace(/\D/g, "").substring(0, 20);
                            let masked = "";
                            for (let i = 0; i < digits.length; i++) {
                              if (i === 7) masked += "-";
                              if (i === 9) masked += ".";
                              if (i === 13) masked += ".";
                              if (i === 14) masked += ".";
                              if (i === 16) masked += ".";
                              masked += digits[i];
                            }
                            setEscavadorQuery(masked);
                          } else {
                            setEscavadorQuery(e.target.value);
                          }
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleEscavadorSearch()}
                        className="flex-1"
                        data-testid="input-escavador-query"
                      />
                      <Button onClick={handleEscavadorSearch} disabled={escavadorLoading || !escavadorQuery.trim()} data-testid="btn-escavador-search">
                        {escavadorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>

                    <div className="bg-blue-50 p-2 rounded text-xs text-blue-700 flex items-center gap-2">
                      <Scale className="w-4 h-4 flex-shrink-0" />
                      Cada consulta consome créditos da API do Escavador.
                    </div>
                  </div>

                  {escavadorError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                      {escavadorError}
                    </div>
                  )}

                  {escavadorResults && (
                    <div className="flex-1 overflow-y-auto space-y-2 mt-2 min-h-0">
                      {escavadorResults.nome && (
                        <div className="text-sm text-muted-foreground">
                          Resultados para <strong>{escavadorResults.nome}</strong> - {escavadorResults.total} processo(s) encontrado(s)
                        </div>
                      )}
                      {!escavadorResults.nome && (
                        <div className="text-sm text-muted-foreground">
                          {escavadorResults.total} processo(s) encontrado(s)
                        </div>
                      )}

                      {escavadorResults.items?.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Search className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p>Nenhum processo encontrado.</p>
                        </div>
                      )}

                      {escavadorResults.items?.map((processo: any, idx: number) => {
                        const fonte = processo.fontes?.[0];
                        const capa = fonte?.capa;
                        return (
                          <Card key={idx} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-sm font-medium">{processo.numero_cnj}</span>
                                    {fonte && (
                                      <Badge variant="outline" className="text-xs">{fonte.sigla || fonte.nome}</Badge>
                                    )}
                                    {fonte?.grau_formatado && (
                                      <Badge variant="secondary" className="text-xs">{fonte.grau_formatado}</Badge>
                                    )}
                                  </div>
                                  <div className="text-sm">
                                    {processo.titulo_polo_ativo && (
                                      <span className="text-foreground">{processo.titulo_polo_ativo}</span>
                                    )}
                                    {processo.titulo_polo_ativo && processo.titulo_polo_passivo && (
                                      <span className="text-muted-foreground"> x </span>
                                    )}
                                    {processo.titulo_polo_passivo && (
                                      <span className="text-foreground">{processo.titulo_polo_passivo}</span>
                                    )}
                                  </div>
                                  {capa && (
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                      {capa.classe && <span>Classe: {capa.classe}</span>}
                                      {capa.assunto && <span>Assunto: {capa.assunto}</span>}
                                      {capa.orgao_julgador && <span>Vara: {capa.orgao_julgador}</span>}
                                    </div>
                                  )}
                                  {processo.data_inicio && (
                                    <span className="text-xs text-muted-foreground">
                                      Distribuído em: {new Date(processo.data_inicio).toLocaleDateString("pt-BR")}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  className="gap-1 shrink-0"
                                  onClick={() => handleEscavadorImport(processo)}
                                  disabled={escavadorImporting === processo.numero_cnj}
                                  data-testid={`btn-import-escavador-${idx}`}
                                >
                                  {escavadorImporting === processo.numero_cnj ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Download className="w-3 h-3" />
                                  )}
                                  Importar
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="gap-2 btn-responsive" data-testid="btn-novo-manual" onClick={() => setManualCaseOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Manual</span>
            <span className="sm:hidden">Novo</span>
          </Button>

          <Dialog open={manualCaseOpen} onOpenChange={setManualCaseOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Processo Manual</DialogTitle>
                <DialogDescription>Cadastre um processo provisório. Dados serão complementados ao sincronizar com o Escavador.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium">Número do Processo *</label>
                  <Input
                    placeholder="0000000-00.0000.0.00.0000"
                    value={manualCaseForm.caseNumber}
                    onChange={(e) => setManualCaseForm(f => ({ ...f, caseNumber: e.target.value }))}
                    data-testid="input-manual-case-number"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cliente</label>
                  <Select value={manualCaseForm.clientId} onValueChange={(v) => setManualCaseForm(f => ({ ...f, clientId: v }))}>
                    <SelectTrigger data-testid="select-manual-client">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {(clientsList || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Título</label>
                  <Input
                    placeholder="Ex: João x Maria - Ação de Cobrança"
                    value={manualCaseForm.title}
                    onChange={(e) => setManualCaseForm(f => ({ ...f, title: e.target.value }))}
                    data-testid="input-manual-title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Tipo</label>
                    <Select value={manualCaseForm.caseType} onValueChange={(v) => setManualCaseForm(f => ({ ...f, caseType: v }))}>
                      <SelectTrigger data-testid="select-manual-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="civil">Civil</SelectItem>
                        <SelectItem value="trabalhista">Trabalhista</SelectItem>
                        <SelectItem value="federal">Federal</SelectItem>
                        <SelectItem value="criminal">Criminal</SelectItem>
                        <SelectItem value="tributario">Tributário</SelectItem>
                        <SelectItem value="administrativo">Administrativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <Select value={manualCaseForm.status} onValueChange={(v) => setManualCaseForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger data-testid="select-manual-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="Em andamento">Em andamento</SelectItem>
                        <SelectItem value="arquivado">Arquivado</SelectItem>
                        <SelectItem value="suspenso">Suspenso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Tribunal / Vara</label>
                  <Input
                    placeholder="Ex: TJDFT - 1ª Vara Cível de Brasília"
                    value={manualCaseForm.court}
                    onChange={(e) => setManualCaseForm(f => ({ ...f, court: e.target.value }))}
                    data-testid="input-manual-court"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Autor</label>
                    <Input
                      placeholder="Nome do autor"
                      value={manualCaseForm.autor}
                      onChange={(e) => setManualCaseForm(f => ({ ...f, autor: e.target.value }))}
                      data-testid="input-manual-autor"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Réu</label>
                    <Input
                      placeholder="Nome do réu"
                      value={manualCaseForm.reu}
                      onChange={(e) => setManualCaseForm(f => ({ ...f, reu: e.target.value }))}
                      data-testid="input-manual-reu"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setManualCaseOpen(false)} data-testid="btn-cancel-manual">Cancelar</Button>
                <Button onClick={handleManualCaseSubmit} disabled={manualCaseSubmitting} data-testid="btn-submit-manual">
                  {manualCaseSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Cadastrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

      {selectedCaseIds.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 p-3 rounded-lg">
          <span className="text-sm font-medium">{selectedCaseIds.size} processo(s) selecionado(s)</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBatchDeleteDialogOpen(true)}
            data-testid="btn-batch-delete"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Excluir Selecionados
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedCaseIds(new Set())}
            data-testid="btn-clear-selection"
          >
            Limpar Seleção
          </Button>
        </div>
      )}

      <div className="rounded-md border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={filteredCases.length > 0 && selectedCaseIds.size === filteredCases.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Réu</TableHead>
                <TableHead>Vara</TableHead>
                <TableHead>Última Sync</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((item: any) => (
                <>
                  <TableRow key={item.id} className={`cursor-pointer hover:bg-muted/50 ${selectedCaseIds.has(item.id) ? 'bg-primary/5' : ''}`}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedCaseIds.has(item.id)}
                        onCheckedChange={() => toggleCaseSelection(item.id)}
                        data-testid={`checkbox-case-${item.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCaseId(expandedCaseId === item.id ? null : item.id);
                        }}
                        data-testid={`btn-expand-case-${item.id}`}
                      >
                        {expandedCaseId === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => setSelectedCase(item)}>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">{item.caseNumber}</span>
                        <span className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{item.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px]" onClick={() => setSelectedCase(item)}>
                      <span className="truncate block" title={item.autor || "Não informado"}>
                        {item.autor || <span className="text-muted-foreground">Não informado</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px]" onClick={() => setSelectedCase(item)}>
                      <span className="truncate block" title={item.reu || "Não informado"}>
                        {item.reu || <span className="text-muted-foreground">Não informado</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[150px]" onClick={() => setSelectedCase(item)}>
                      <span className="truncate block" title={item.vara || item.court}>
                        {item.vara || item.court}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]" onClick={() => setSelectedCase(item)}>
                      <span className="text-muted-foreground text-xs">
                        {item.datajudLastSync 
                          ? new Date(item.datajudLastSync).toLocaleDateString('pt-BR')
                          : new Date(item.createdAt).toLocaleDateString('pt-BR')
                        }
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="h-8 text-xs gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/studio?processo=${encodeURIComponent(item.caseNumber)}&caseId=${item.id}`);
                          }}
                          data-testid={`btn-peticao-studio-${item.id}`}
                        >
                          <Pen className="w-3 h-3" />
                          Petição
                        </Button>
                        <Badge
                          className={`cursor-pointer text-xs select-none ${
                            item.isOwnCase
                              ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
                              : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                          }`}
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOwnCaseMutation.mutate({ id: item.id, isOwnCase: !item.isOwnCase });
                          }}
                          data-testid={`badge-own-case-${item.id}`}
                        >
                          {item.isOwnCase ? "Próprio" : "Acompanhamento"}
                        </Badge>
                        <Badge
                          className={`cursor-pointer text-xs select-none ${
                            item.isStrategic
                              ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                              : "bg-transparent text-gray-300 border-dashed border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                          }`}
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStrategicMutation.mutate({ id: item.id, isStrategic: !item.isStrategic });
                          }}
                          data-testid={`badge-strategic-${item.id}`}
                        >
                          {item.isStrategic ? "⭐ Estratégico" : "☆"}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedCase(item)}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCaseToDelete(item);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`btn-delete-case-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedCaseId === item.id && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={8}>
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground text-xs block mb-1">Valor da Causa</span>
                              <span className="font-medium">
                                {item.valorCausa 
                                  ? `R$ ${Number(item.valorCausa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                  : "Não informado"
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs block mb-1">Classe Processual</span>
                              <span className="font-medium">{item.classeNome || item.caseClass || "Não informada"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs block mb-1">Tipo</span>
                              <Badge variant="outline" className="capitalize">{item.caseType}</Badge>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs block mb-1">Status</span>
                              <Badge variant={item.status === "ativo" ? "default" : "secondary"} className="capitalize">
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                          {item.assuntos && item.assuntos.length > 0 && (
                            <div>
                              <span className="text-muted-foreground text-xs block mb-1">Assuntos</span>
                              <div className="flex flex-wrap gap-1">
                                {item.assuntos.map((assunto: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">{assunto}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex justify-end">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2"
                              onClick={() => setSelectedCase(item)}
                            >
                              <FileText className="w-4 h-4" />
                              Ver Movimentações
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Case Detail Dialog */}
      {selectedCase && (
        <Dialog open={!!selectedCase} onOpenChange={(open) => {
            if (!open) {
              setSelectedCase(null);
              setEscavadorAISummary(null);
              setEscavadorDocs(null);
              setEscavadorUpdateStatus(null);
              setEscavadorAILoading(false);
              setEscavadorDocsLoading(false);
              setEscavadorUpdating(false);
            }
          }}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="p-6 border-b">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize">{selectedCase.caseType}</Badge>
                {selectedCase.datajudLastSync && (
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none">Escavador Sync</Badge>
                )}
              </div>
              <DialogTitle className="text-xl">{selectedCase.title}</DialogTitle>
              <DialogDescription className="font-mono text-sm mt-1">
                {selectedCase.caseNumber} • {selectedCase.court}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex">
              <div className="w-72 bg-muted/30 border-r p-4 space-y-5 hidden md:block overflow-y-auto">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Autor</h4>
                  <p className="text-sm font-medium">{selectedCase.autor || "Não informado"}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Réu</h4>
                  <p className="text-sm font-medium">{selectedCase.reu || "Não informado"}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Vara</h4>
                  <p className="text-sm font-medium">{selectedCase.vara || selectedCase.court}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Valor da Causa</h4>
                  <p className="text-sm font-medium">
                    {selectedCase.valorCausa 
                      ? `R$ ${Number(selectedCase.valorCausa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : selectedCase.estimatedValue 
                        ? `R$ ${Number(selectedCase.estimatedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : "Não informado"
                    }
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Classe</h4>
                  <p className="text-sm font-medium">{selectedCase.classeNome || selectedCase.caseClass || "Não informada"}</p>
                </div>
                {selectedCase.assuntos && selectedCase.assuntos.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Assuntos</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedCase.assuntos.map((assunto: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{assunto}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Risco</h4>
                  <Badge variant={selectedCase.riskLevel === "alto" ? "destructive" : "secondary"} className="capitalize">
                    {selectedCase.riskLevel || "Não avaliado"}
                  </Badge>
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
                {escavadorConfigured && (
                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Escavador</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                      disabled={escavadorUpdating}
                      data-testid="btn-escavador-update"
                      onClick={async () => {
                        setEscavadorUpdating(true);
                        try {
                          const res = await fetch(`/api/escavador/request-update/${encodeURIComponent(selectedCase.caseNumber)}`, {
                            method: "POST",
                            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ baixarDocumentosPublicos: true }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Erro ao atualizar");
                          setEscavadorUpdateStatus(data);
                          toast({ title: "Atualização solicitada!", description: data.message || "O processo será atualizado em breve." });
                        } catch (err: any) {
                          toast({ title: err.message || "Erro ao solicitar atualização", variant: "destructive" });
                        } finally {
                          setEscavadorUpdating(false);
                        }
                      }}
                    >
                      {escavadorUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                      Atualizar Processo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                      disabled={escavadorAILoading}
                      data-testid="btn-escavador-ai-summary"
                      onClick={async () => {
                        setEscavadorAILoading(true);
                        try {
                          const reqRes = await fetch(`/api/escavador/ai-summary/request/${encodeURIComponent(selectedCase.caseNumber)}`, {
                            method: "POST",
                            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                            credentials: "include",
                          });
                          if (!reqRes.ok) {
                            const err = await reqRes.json();
                            throw new Error(err.error || "Erro ao solicitar resumo");
                          }
                          await new Promise(resolve => setTimeout(resolve, 3000));
                          const summaryRes = await fetch(`/api/escavador/ai-summary/${encodeURIComponent(selectedCase.caseNumber)}`, {
                            headers: { ...getAuthHeaders() },
                            credentials: "include",
                          });
                          const summaryData = await summaryRes.json();
                          if (!summaryRes.ok) throw new Error(summaryData.error || "Erro ao buscar resumo");
                          setEscavadorAISummary(summaryData);
                          toast({ title: "Resumo IA gerado com sucesso!" });
                        } catch (err: any) {
                          toast({ title: err.message || "Erro ao gerar resumo IA", variant: "destructive" });
                        } finally {
                          setEscavadorAILoading(false);
                        }
                      }}
                    >
                      {escavadorAILoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                      Resumo Inteligente IA
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                      data-testid="btn-escavador-monitor"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/escavador/monitoring/process", {
                            method: "POST",
                            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ caseNumber: selectedCase.caseNumber }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Erro ao monitorar");
                          toast({ title: "Monitoramento ativado!", description: "Você será notificado sobre novas movimentações." });
                        } catch (err: any) {
                          toast({ title: err.message || "Erro ao ativar monitoramento", variant: "destructive" });
                        }
                      }}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Monitorar Processo
                    </Button>
                  </div>
                )}
                <div className="pt-4 border-t">
                  <Button 
                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    onClick={() => navigate(`/studio?processo=${encodeURIComponent(selectedCase.caseNumber)}&caseId=${selectedCase.id}`)}
                  >
                    <Pen className="w-4 h-4" />
                    Fazer Petição no Estúdio
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="timeline" className="w-full">
                  <div className="border-b px-6 sticky top-0 bg-background z-10">
                    <TabsList className="h-12 bg-transparent space-x-6 overflow-x-auto flex-nowrap">
                      <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Movimentações
                      </TabsTrigger>
                      <TabsTrigger value="docs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Documentos
                      </TabsTrigger>
                      <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0">
                        Dados
                      </TabsTrigger>
                      {escavadorConfigured && (
                        <TabsTrigger value="escavai" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-0 gap-1">
                          <Brain className="w-3.5 h-3.5" />
                          EscavAI
                        </TabsTrigger>
                      )}
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
                                {toBrazilDate(event.date)}
                              </span>
                            </div>
                            <div className="text-sm text-foreground/80 bg-muted/30 p-3 rounded-md border border-border/50">
                              <p>{event.description}</p>
                              {event.teor && (
                                <p className="mt-2 text-xs text-muted-foreground border-t pt-2">{event.teor}</p>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 items-center justify-between">
                              <Badge variant="outline" className="text-[10px] h-5">{event.source}</Badge>
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="h-9 text-xs gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white btn-responsive shadow-md"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const params = new URLSearchParams();
                                  if (selectedCase) {
                                    params.set("caseId", String(selectedCase.id));
                                    params.set("processo", selectedCase.caseNumber || "");
                                    if (selectedCase.clientId) params.set("clientId", String(selectedCase.clientId));
                                  }
                                  const teor = event.teor || event.description || "";
                                  if (teor) params.set("movimentacao", teor);
                                  if (event.type) params.set("tipoMov", event.type);
                                  if (event.date) params.set("dataMov", toBrazilDate(event.date));
                                  navigate(`/studio?${params.toString()}`);
                                }}
                                data-testid={`btn-gerar-peca-${event.id}`}
                              >
                                <Sparkles className="w-4 h-4" />
                                Gerar Peça com IA
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Nenhuma movimentação registrada.</p>
                        <p className="text-sm mt-2">Importe dados do Escavador para ver o histórico.</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="docs" className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <FileSearch className="w-4 h-4" />
                          Documentos do Processo
                        </h3>
                        <div className="flex items-center gap-2">
                          {escavadorConfigured && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={escavadorDocsLoading}
                                data-testid="btn-fetch-docs-publicos"
                                onClick={async () => {
                                  setEscavadorDocsLoading(true);
                                  try {
                                    const res = await fetch(`/api/escavador/documents/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                      headers: { ...getAuthHeaders() },
                                      credentials: "include",
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || "Erro ao buscar documentos");
                                    const docs = data.documents || [];
                                    setEscavadorDocs(docs);
                                    if (docs.length > 0) {
                                      toast({ title: `${docs.length} documento(s) público(s) encontrado(s)` });
                                    } else {
                                      toast({ title: data.message || "Nenhum documento público disponível. Solicite uma atualização.", description: "Clique em 'Solicitar Atualização c/ Docs' para buscar documentos do tribunal." });
                                    }
                                  } catch (err: any) {
                                    toast({ title: err.message || "Erro ao buscar documentos", variant: "destructive" });
                                    setEscavadorDocs([]);
                                  } finally {
                                    setEscavadorDocsLoading(false);
                                  }
                                }}
                              >
                                {escavadorDocsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />}
                                Buscar Docs Públicos
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={escavadorUpdating}
                                data-testid="btn-docs-request-update"
                                onClick={async () => {
                                  setEscavadorUpdating(true);
                                  try {
                                    const res = await fetch(`/api/escavador/request-update/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                      method: "POST",
                                      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                      credentials: "include",
                                      body: JSON.stringify({ baixarDocumentosPublicos: true }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || "Erro ao atualizar");
                                    if (data.alreadyUpdating) {
                                      toast({ title: "Atualização já em andamento", description: `Status: ${data.status}. Solicitado em ${data.requestedAt ? new Date(data.requestedAt).toLocaleString('pt-BR') : 'momento anterior'}. Aguarde e clique em 'Buscar Docs Públicos'.` });
                                    } else {
                                      toast({ title: "Atualização solicitada!", description: "Aguarde alguns minutos e clique em 'Buscar Docs Públicos' novamente." });
                                    }
                                  } catch (err: any) {
                                    toast({ title: err.message || "Erro ao solicitar atualização", variant: "destructive" });
                                  } finally {
                                    setEscavadorUpdating(false);
                                  }
                                }}
                              >
                                {escavadorUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                                Solicitar Atualização c/ Docs
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {escavadorDocsLoading && (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" />
                          <span className="text-sm text-muted-foreground">Buscando documentos públicos...</span>
                        </div>
                      )}

                      {escavadorDocs && escavadorDocs.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">{escavadorDocs.length} documento(s) público(s) encontrado(s) via Escavador</p>
                          {escavadorDocs.map((doc: any, idx: number) => (
                            <div key={doc.id || idx} className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800" data-testid={`doc-card-${doc.id || idx}`}>
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm font-medium">{doc.nome || doc.titulo || doc.title || `Documento ${idx + 1}`}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {(doc.tipo || doc.type) && <Badge variant="secondary" className="text-[10px]">{doc.tipo || doc.type}</Badge>}
                                  <Badge variant="outline" className="text-[10px]">Escavador</Badge>
                                  {(doc.data || doc.date) && (
                                    <span className="text-xs text-muted-foreground">
                                      {toBrazilDate(doc.data || doc.date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {(doc.id || doc.links?.api) && (
                                <Button variant="default" size="sm" className="gap-1.5 shrink-0" data-testid={`btn-download-doc-${doc.id || idx}`}
                                  onClick={() => {
                                    if (doc.links?.api) {
                                      window.open(doc.links.api, '_blank');
                                    } else {
                                      window.open(`/api/escavador/document-download/${doc.id}`, '_blank');
                                    }
                                  }}>
                                  <Download className="w-3.5 h-3.5" />
                                  Baixar PDF
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {escavadorDocs && escavadorDocs.length === 0 && !escavadorDocsLoading && (
                        <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                          <FileSearch className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nenhum documento público encontrado no Escavador.</p>
                          <p className="text-xs mt-1">Clique em "Solicitar Atualização c/ Docs" para pedir ao tribunal.</p>
                        </div>
                      )}

                      {!escavadorDocs && !escavadorDocsLoading && escavadorConfigured && (
                        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                          <FileSearch className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Clique em "Buscar Docs Públicos" para carregar documentos do tribunal via Escavador.</p>
                        </div>
                      )}

                      {!escavadorConfigured && (
                        <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                          <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Configure a API do Escavador para acessar documentos públicos do tribunal.</p>
                        </div>
                      )}

                      {(() => {
                        const docsWithTeor = (movements || []).filter((m: any) => 
                          m.teor && m.teor.length > 50 && 
                          m.teor !== m.description &&
                          !['tipo_de_documento', 'tipo_de_peticao', 'tipo_de_conclusao', 'tipo_de_distribuicao_redistribuicao', 'resultado'].includes(m.teor)
                        );
                        return docsWithTeor.length > 0 ? (
                          <div className="space-y-3 mt-6">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Teor das Movimentações ({docsWithTeor.length})
                            </h3>
                            {docsWithTeor.map((event: any, idx: number) => (
                              <div key={event.id || idx} className="border border-border/50 rounded-lg overflow-hidden" data-testid={`doc-teor-${event.id || idx}`}>
                                <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/50">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={event.type === 'Intimação' ? 'destructive' : event.type === 'Decisão' ? 'default' : 'secondary'} className="text-[10px]">
                                      {event.type}
                                    </Badge>
                                    <span className="text-xs font-medium">{event.description?.substring(0, 80)}{event.description?.length > 80 ? '...' : ''}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">{event.source}</Badge>
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {toBrazilDate(event.date)}
                                    </span>
                                  </div>
                                </div>
                                <div className="p-4 text-sm text-foreground/85 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                                  {event.teor}
                                </div>
                                <div className="px-4 py-2 border-t border-border/50 flex justify-end">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const params = new URLSearchParams();
                                      if (selectedCase) {
                                        params.set("caseId", String(selectedCase.id));
                                        params.set("processo", selectedCase.caseNumber || "");
                                        if (selectedCase.clientId) params.set("clientId", String(selectedCase.clientId));
                                      }
                                      const teor = event.teor || event.description || "";
                                      if (teor) params.set("movimentacao", teor);
                                      if (event.type) params.set("tipoMov", event.type);
                                      if (event.date) params.set("dataMov", toBrazilDate(event.date));
                                      navigate(`/studio?${params.toString()}`);
                                    }}
                                    data-testid={`btn-doc-gerar-peca-${event.id}`}
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Gerar Peça com IA
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </TabsContent>

                  {escavadorConfigured && (
                    <TabsContent value="escavai" className="p-6">
                      {escavadorAILoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Gerando resumo inteligente...</p>
                        </div>
                      ) : escavadorAISummary ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <Brain className="w-4 h-4 text-purple-600" />
                              Resumo Inteligente
                            </h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs"
                              disabled={escavadorAILoading}
                              data-testid="btn-refresh-ai-summary"
                              onClick={async () => {
                                setEscavadorAILoading(true);
                                try {
                                  const reqRes = await fetch(`/api/escavador/ai-summary/request/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                    method: "POST",
                                    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                    credentials: "include",
                                  });
                                  if (!reqRes.ok) {
                                    const err = await reqRes.json();
                                    throw new Error(err.error || "Erro ao solicitar resumo");
                                  }
                                  await new Promise(resolve => setTimeout(resolve, 3000));
                                  const summaryRes = await fetch(`/api/escavador/ai-summary/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                    headers: { ...getAuthHeaders() },
                                    credentials: "include",
                                  });
                                  const summaryData = await summaryRes.json();
                                  if (!summaryRes.ok) throw new Error(summaryData.error || "Erro ao buscar resumo");
                                  setEscavadorAISummary(summaryData);
                                  toast({ title: "Resumo atualizado!" });
                                } catch (err: any) {
                                  toast({ title: err.message || "Erro ao atualizar resumo", variant: "destructive" });
                                } finally {
                                  setEscavadorAILoading(false);
                                }
                              }}
                            >
                              <RefreshCw className="w-3 h-3" />
                              Regenerar
                            </Button>
                          </div>

                          {escavadorAISummary.status && (
                            <Badge variant="outline" className="text-xs">
                              Status: {escavadorAISummary.status}
                            </Badge>
                          )}

                          {(escavadorAISummary.resumo || escavadorAISummary.summary) && (
                            <div className="bg-muted/30 p-4 rounded-md border border-border/50">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {escavadorAISummary.resumo || escavadorAISummary.summary}
                              </p>
                            </div>
                          )}

                          {(escavadorAISummary.pontos_chave || escavadorAISummary.keyPoints || escavadorAISummary.key_points) && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Pontos-Chave</h4>
                              <ul className="space-y-1.5">
                                {(escavadorAISummary.pontos_chave || escavadorAISummary.keyPoints || escavadorAISummary.key_points || []).map((point: string, idx: number) => (
                                  <li key={idx} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                                    <span>{point}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-muted-foreground">
                          <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p>Resumo inteligente do processo via Escavador IA.</p>
                          <p className="text-sm mt-2">Gere um resumo automático com análise de pontos-chave.</p>
                          <Button
                            variant="default"
                            size="sm"
                            className="mt-4 gap-2"
                            disabled={escavadorAILoading}
                            data-testid="btn-generate-ai-summary"
                            onClick={async () => {
                              setEscavadorAILoading(true);
                              try {
                                const reqRes = await fetch(`/api/escavador/ai-summary/request/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                  method: "POST",
                                  headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                  credentials: "include",
                                });
                                if (!reqRes.ok) {
                                  const err = await reqRes.json();
                                  throw new Error(err.error || "Erro ao solicitar resumo");
                                }
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                const summaryRes = await fetch(`/api/escavador/ai-summary/${encodeURIComponent(selectedCase.caseNumber)}`, {
                                  headers: { ...getAuthHeaders() },
                                  credentials: "include",
                                });
                                const summaryData = await summaryRes.json();
                                if (!summaryRes.ok) throw new Error(summaryData.error || "Erro ao buscar resumo");
                                setEscavadorAISummary(summaryData);
                                toast({ title: "Resumo IA gerado com sucesso!" });
                              } catch (err: any) {
                                toast({ title: err.message || "Erro ao gerar resumo IA", variant: "destructive" });
                              } finally {
                                setEscavadorAILoading(false);
                              }
                            }}
                          >
                            <Brain className="w-4 h-4" />
                            Gerar Resumo Inteligente
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  )}

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
      <Dialog open={generatePieceOpen} onOpenChange={(open) => {
        setGeneratePieceOpen(open);
        if (!open) {
          setIntimacaoAnalysis(null);
          setIsAnalyzing(false);
        }
      }}>
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
              {isAnalyzing && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analisando a intimação com IA para sugerir a peça adequada...
                </div>
              )}

              {intimacaoAnalysis && (
                <div className={`rounded-md p-3 text-sm border space-y-2 ${
                  intimacaoAnalysis.urgency === "alta" ? "bg-red-50 border-red-200" :
                  intimacaoAnalysis.urgency === "media" ? "bg-amber-50 border-amber-200" :
                  "bg-green-50 border-green-200"
                }`}>
                  <div className="flex items-center gap-2 font-medium">
                    <Bot className="w-4 h-4" />
                    Análise da IA
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Peça Sugerida:</span>
                      <span className="ml-1 font-medium">{intimacaoAnalysis.suggestedPieceType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Urgência:</span>
                      <Badge variant="outline" className={`ml-1 text-xs ${
                        intimacaoAnalysis.urgency === "alta" ? "bg-red-100 text-red-700 border-red-200" :
                        intimacaoAnalysis.urgency === "media" ? "bg-amber-100 text-amber-700 border-amber-200" :
                        "bg-green-100 text-green-700 border-green-200"
                      }`}>
                        {intimacaoAnalysis.urgency}
                      </Badge>
                    </div>
                    {intimacaoAnalysis.deadline && (
                      <div>
                        <span className="text-muted-foreground">Prazo:</span>
                        <span className="ml-1 font-medium">{intimacaoAnalysis.deadline}</span>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Justificativa:</span>
                      <span className="ml-1">{intimacaoAnalysis.justification}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium block mb-2">Tipo de Peça</label>
                <select 
                  className="w-full border rounded-md p-2"
                  value={pieceType}
                  onChange={(e) => setPieceType(e.target.value)}
                  data-testid="select-piece-type"
                >
                  <option value="Manifestação">Manifestação</option>
                  <option value="Contestação">Contestação</option>
                  <option value="Réplica">Réplica</option>
                  <option value="Petição Simples">Petição Simples</option>
                  <option value="Embargos de Declaração">Embargos de Declaração</option>
                  <option value="Recurso">Recurso</option>
                  <option value="Agravo de Instrumento">Agravo de Instrumento</option>
                  <option value="Apelação">Apelação</option>
                  <option value="Impugnação">Impugnação</option>
                  <option value="Contrarrazões">Contrarrazões</option>
                  {intimacaoAnalysis?.suggestedPieceType && 
                    !["Manifestação", "Contestação", "Réplica", "Petição Simples", "Embargos de Declaração", "Recurso", "Agravo de Instrumento", "Apelação", "Impugnação", "Contrarrazões"].includes(intimacaoAnalysis.suggestedPieceType) && (
                    <option value={intimacaoAnalysis.suggestedPieceType}>{intimacaoAnalysis.suggestedPieceType}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Intimação de Origem</label>
                <div className="bg-muted/50 p-3 rounded-md text-sm max-h-[120px] overflow-y-auto">
                  <p className="font-medium">{selectedMovement?.description}</p>
                  {selectedMovement?.teor && (
                    <p className="mt-2 text-muted-foreground text-xs border-t pt-2">{selectedMovement.teor}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Instruções Adicionais (opcional)</label>
                <Textarea 
                  placeholder="Ex: Focar na questão da prescrição, incluir jurisprudência do STJ..."
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  data-testid="textarea-instructions"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>Importante:</strong> Este é um rascunho assistido por IA. Toda produção jurídica deve ser revisada e validada por advogado antes do protocolo.
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Processo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o processo{" "}
              <span className="font-mono font-semibold">{caseToDelete?.caseNumber}</span>?
              <br /><br />
              Esta ação é irreversível e irá remover todas as movimentações associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCase}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Processos em Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold text-destructive">{selectedCaseIds.size} processo(s)</span>?
              <br /><br />
              Esta ação é irreversível e irá remover todos os processos selecionados junto com suas movimentações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatchDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={isBatchDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-batch-delete"
            >
              {isBatchDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir {selectedCaseIds.size} Processo(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="intimacoes" className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={intimacoesView === "hoje" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("hoje")}
                  className="gap-1"
                  data-testid="btn-view-hoje"
                >
                  <CalendarIcon className="w-3 h-3" />
                  {format(new Date(), "dd.MM.yyyy", { locale: ptBR })}
                  {intimacoesCounts.hoje > 0 && (
                    <Badge className="ml-1 h-4 text-[10px] px-1.5 bg-blue-600 text-white">{intimacoesCounts.hoje}</Badge>
                  )}
                </Button>
                <Button
                  variant={intimacoesView === "pendentes" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("pendentes")}
                  className="gap-1"
                  data-testid="btn-view-pendentes"
                >
                  <Bell className="w-3 h-3" />
                  Todas Pendentes
                  {intimacoesCounts.pendentes > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1.5">{intimacoesCounts.pendentes}</Badge>
                  )}
                </Button>
                <Button
                  variant={intimacoesView === "vencidos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("vencidos")}
                  className="gap-1"
                  data-testid="btn-view-vencidos"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Vencidos
                  {intimacoesCounts.vencidos > 0 && (
                    <Badge className="ml-1 h-4 text-[10px] px-1.5 bg-red-600 text-white">{intimacoesCounts.vencidos}</Badge>
                  )}
                </Button>
                <Button
                  variant={intimacoesView === "criticos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("criticos")}
                  className="gap-1"
                  data-testid="btn-view-criticos"
                >
                  <Clock className="w-3 h-3" />
                  Críticos
                  {intimacoesCounts.criticos > 0 && (
                    <Badge className="ml-1 h-4 text-[10px] px-1.5 bg-amber-600 text-white">{intimacoesCounts.criticos}</Badge>
                  )}
                </Button>
                <Button
                  variant={intimacoesView === "estrategicos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("estrategicos")}
                  className="gap-1"
                  data-testid="btn-view-estrategicos"
                >
                  <Sparkles className="w-3 h-3" />
                  Estratégicos
                  {intimacoesCounts.estrategicos > 0 && (
                    <Badge className="ml-1 h-4 text-[10px] px-1.5 bg-yellow-600 text-white">{intimacoesCounts.estrategicos}</Badge>
                  )}
                </Button>
                <Button
                  variant={intimacoesView === "semana" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("semana")}
                  className="gap-1"
                  data-testid="btn-view-semana"
                >
                  <CalendarIcon className="w-3 h-3" />
                  Esta Semana
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
                <Button
                  variant={intimacoesView === "historico" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntimacoesView("historico")}
                  className="gap-1"
                  data-testid="btn-view-historico"
                >
                  <Eye className="w-3 h-3" />
                  Histórico
                  {intimacoesCounts.historico > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1.5">{intimacoesCounts.historico}</Badge>
                  )}
                </Button>
                <Button
                  variant={customDateMode ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    if (customDateMode) {
                      const resetEnd = new Date();
                      const resetStart = new Date();
                      resetStart.setDate(resetStart.getDate() - 7);
                      setDateFrom(resetStart);
                      setDateTo(resetEnd);
                      setCustomDateMode(false);
                    } else {
                      setCustomDateMode(true);
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }
                  }}
                  data-testid="btn-custom-date"
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Período personalizado
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    className="gap-1 text-muted-foreground"
                    data-testid="btn-mark-all-read"
                  >
                    <Eye className="w-3 h-3" />
                    Marcar todas como lidas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await intimacoesApi.resetAnalysis();
                      batchAnalyzeRef.current = false;
                      queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
                      toast({ title: "Análise resetada. Os itens serão reanalisados automaticamente." });
                    } catch {
                      toast({ title: "Erro ao resetar análise.", variant: "destructive" });
                    }
                  }}
                  className="gap-1 text-xs text-muted-foreground"
                  data-testid="btn-reset-analysis"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-analisar IA
                </Button>
              </div>
            </div>
          </div>

          {batchAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Analisando prazos com IA...</span>
            </div>
          )}

          <div className="bg-card p-3 rounded-lg border shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nº processo, descrição, tribunal..."
                  className="pl-9 border-none bg-muted/50 focus:bg-background transition-colors"
                  value={intimacoesSearch}
                  onChange={(e) => setIntimacoesSearch(e.target.value)}
                  data-testid="input-search-intimacoes"
                />
              </div>
              <Button
                variant={intimacoesSort === "data" ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs h-9 shrink-0"
                onClick={() => setIntimacoesSort(intimacoesSort === "urgencia" ? "data" : "urgencia")}
                data-testid="btn-sort-intimacoes"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {intimacoesSort === "urgencia" ? "Urgência" : "Data"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9 shrink-0"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["intimacoes"] });
                  refetchIntimacoes();
                  toast({ title: "Atualizando movimentações..." });
                }}
                disabled={intimacoesLoading}
                data-testid="btn-refresh-intimacoes"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${intimacoesLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
              {customDateMode && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 text-xs h-8 ${dateFrom ? "border-primary text-primary" : ""}`}
                        data-testid="btn-date-from"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "Data início"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={(d) => {
                          setDateFrom(d);
                          if (d && !dateTo) setDateTo(d);
                        }}
                        locale={ptBR}
                        disabled={(date) => dateTo ? date > dateTo : false}
                        data-testid="calendar-date-from"
                      />
                    </PopoverContent>
                  </Popover>

                  <span className="text-xs text-muted-foreground">até</span>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 text-xs h-8 ${dateTo ? "border-primary text-primary" : ""}`}
                        data-testid="btn-date-to"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Data fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        locale={ptBR}
                        disabled={(date) => dateFrom ? date < dateFrom : false}
                        data-testid="calendar-date-to"
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="gap-1 text-xs h-8 text-muted-foreground hover:text-destructive"
                  data-testid="btn-clear-filters"
                >
                  <X className="w-3 h-3" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          {customDateMode && !hasValidDates ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Selecione o período</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Escolha a data de início e fim acima para buscar as movimentações.
                </p>
              </CardContent>
            </Card>
          ) : intimacoesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : urgencySortedIntimacoes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">Nenhuma movimentação encontrada</h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {intimacoesView === "historico"
                    ? "Nenhuma intimação marcada como ciente."
                    : intimacoesView === "vencidos"
                      ? "Nenhuma intimação com prazo vencido."
                      : intimacoesView === "hoje"
                        ? "Nenhuma intimação recebida hoje."
                        : customDateMode
                          ? "Nenhuma movimentação no período selecionado. Escolha outras datas."
                          : "Nenhuma movimentação nos últimos 7 dias. Use Período personalizado para buscar datas anteriores."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <TooltipProvider>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Status</TableHead>
                          <TableHead className="w-[180px]">Processo</TableHead>
                          <TableHead className="w-[100px]">Tipo</TableHead>
                          <TableHead className="w-[100px]">Data</TableHead>
                          <TableHead className="min-w-[250px]">Descrição</TableHead>
                          <TableHead className="w-[140px]">
                            <Select value={deadlineFilter} onValueChange={(v: any) => setDeadlineFilter(v)}>
                              <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none p-0 gap-1 font-medium">
                                <SelectValue placeholder="Prazo Final" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todos">Prazo Final (Todos)</SelectItem>
                                <SelectItem value="hoje">Vence Hoje</SelectItem>
                                <SelectItem value="semana">Vence Esta Semana</SelectItem>
                                <SelectItem value="mes">Vence Este Mês</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableHead>
                          <TableHead className="w-[70px]">Restam</TableHead>
                          <TableHead className="w-[150px]">Base Legal</TableHead>
                          <TableHead className="w-[180px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {urgencySortedIntimacoes.map((item: any) => {
                          const statusColor = item.aiDeadlineStatus === "vencido"
                            ? "bg-red-500" : item.aiDeadlineStatus === "critico"
                            ? "bg-red-400" : item.aiDeadlineStatus === "urgente"
                            ? "bg-amber-500" : item.aiDeadlineStatus === "normal"
                            ? "bg-green-500" : "bg-gray-300";
                          const borderColor = item.aiDeadlineStatus === "vencido"
                            ? "border-l-red-500" : item.aiDeadlineStatus === "critico"
                            ? "border-l-red-400" : item.aiDeadlineStatus === "urgente"
                            ? "border-l-amber-500" : item.aiDeadlineStatus === "normal"
                            ? "border-l-green-500" : !item.isRead
                            ? "border-l-orange-500" : "border-l-transparent";
                          const remainingDays = item.aiDeadlineDate ? calcDaysRemaining(item.aiDeadlineDate, item.aiDeadlineType || "uteis") : null;
                          const remainingColor = remainingDays === null
                            ? "" : remainingDays === 0
                            ? "text-red-600 font-bold" : remainingDays <= 2
                            ? "text-red-500 font-semibold" : remainingDays <= 5
                            ? "text-amber-600 font-medium" : "text-green-600";

                          return (
                            <TableRow
                              key={item.id}
                              className={`border-l-4 ${borderColor} ${!item.isRead ? "bg-orange-50/30" : ""}`}
                              data-testid={`row-intimacao-${item.id}`}
                            >
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`w-3 h-3 rounded-full ${statusColor} mx-auto`} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {item.aiDeadlineStatus === "vencido" ? "Prazo Vencido"
                                      : item.aiDeadlineStatus === "critico" ? "Prazo Crítico"
                                      : item.aiDeadlineStatus === "urgente" ? "Prazo Urgente"
                                      : item.aiDeadlineStatus === "normal" ? "No Prazo"
                                      : "Não analisado"}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                <button
                                  className="font-mono text-xs text-primary hover:underline text-left"
                                  onClick={() => {
                                    setMainTab("processos");
                                    const caseItem = cases?.find((c: any) => c.id === item.caseId);
                                    if (caseItem) setSelectedCase(caseItem);
                                  }}
                                  data-testid={`btn-ver-processo-${item.id}`}
                                >
                                  {item.caseNumber}
                                </button>
                              </TableCell>
                              <TableCell>
                                {item.aiClassification ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className={`text-[10px] ${getMovementBadgeVariant(item.aiClassification)}`}>
                                        {item.aiClassification}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="text-xs">
                                      <p>Classificação IA (baseada no conteúdo)</p>
                                      <p className="text-muted-foreground">Original: {item.type}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Badge variant="outline" className={`text-[10px] ${getMovementBadgeVariant(item.type)}`}>
                                    {item.type}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {toBrazilDate(item.date)}
                              </TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="max-w-[350px]">
                                      <p className="text-xs line-clamp-1">{item.description}</p>
                                      {item.aiDeadlineSummary && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{item.aiDeadlineSummary}</p>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-md text-xs">
                                    <p className="font-medium mb-1">{item.description}</p>
                                    {item.teor && <p className="text-muted-foreground">{item.teor}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {item.aiDeadlineDate ? (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        className="text-xs font-medium text-primary hover:underline cursor-pointer flex items-center gap-1"
                                        data-testid={`btn-prazo-detail-${item.id}`}
                                      >
                                        {new Date(item.aiDeadlineDate + "T12:00:00").toLocaleDateString("pt-BR")}
                                        <Scale className="w-3 h-3 text-muted-foreground" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3" side="left" data-testid={`popover-prazo-${item.id}`}>
                                      <div className="space-y-2">
                                        <div className="font-semibold text-sm flex items-center gap-1.5 border-b pb-1.5 mb-1">
                                          <Scale className="w-4 h-4 text-blue-600" />
                                          Contagem CPC do Prazo
                                        </div>
                                        <div className="space-y-1.5 text-xs">
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">1. Disponibilização:</span>
                                            <span className="font-medium">{item.date ? new Date(new Date(item.date).toISOString().split('T')[0] + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">2. Publicação:</span>
                                            <span className="font-medium">{item.aiPublicacaoDate ? new Date(item.aiPublicacaoDate + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">3. Início do prazo:</span>
                                            <span className="font-medium">{item.aiInicioPrazoDate ? new Date(item.aiInicioPrazoDate + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">4. Prazo:</span>
                                            <span className="font-medium">{item.aiDeadlineDays || "-"} dias {item.aiDeadlineType === "corridos" ? "corridos" : "úteis"}</span>
                                          </div>
                                          <div className="flex justify-between items-center bg-green-50 rounded px-1.5 py-1 border border-green-200">
                                            <span className="text-green-800 font-medium">5. Vencimento:</span>
                                            <span className="font-bold text-green-700">{new Date(item.aiDeadlineDate + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                                          </div>
                                        </div>
                                        <div className="border-t pt-1.5 mt-1.5">
                                          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Fundamentação Legal:</p>
                                          <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc list-inside">
                                            <li>Art. 4º, §3º, Lei 11.419/2006 (publicação)</li>
                                            <li>Art. 224, §1º, CPC (exclusão do dia inicial)</li>
                                            <li>{item.aiDeadlineType === "corridos" ? "Art. 12-A, Lei 9.099/95 (dias corridos)" : "Art. 219, CPC (dias úteis)"}</li>
                                            {item.aiLegalBasis && <li>{item.aiLegalBasis} (prazo específico)</li>}
                                          </ul>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                ) : batchAnalyzing && !item.aiAnalyzedAt
                                    ? <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Analisando...</span>
                                    : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell className={`text-xs whitespace-nowrap ${remainingColor}`}>
                                {remainingDays !== null ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>{remainingDays}d {item.aiDeadlineType === "corridos" ? "©" : "ú"}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {item.aiDeadlineType === "corridos" 
                                        ? "Dias corridos (Juizado Especial - Art. 12-A, Lei 9.099/95)" 
                                        : "Dias úteis (Art. 219, CPC)"}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-[10px] text-muted-foreground max-w-[150px] truncate">
                                {item.aiLegalBasis || "-"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-[10px] gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                                    onClick={() => {
                                      const caseItem = cases?.find((c: any) => c.id === item.caseId);
                                      const params = new URLSearchParams();
                                      if (caseItem) {
                                        params.set("caseId", String(caseItem.id));
                                        params.set("processo", caseItem.caseNumber || "");
                                        if (caseItem.clientId) params.set("clientId", String(caseItem.clientId));
                                      }
                                      const teor = item.teor || item.description || "";
                                      if (teor) params.set("movimentacao", teor);
                                      if (item.type) params.set("tipoMov", item.type);
                                      if (item.date) params.set("dataMov", toBrazilDate(item.date));
                                      navigate(`/studio?${params.toString()}`);
                                    }}
                                    data-testid={`btn-gerar-peca-intimacao-${item.id}`}
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Gerar Peça
                                  </Button>
                                  {intimacoesView === "historico" ? (
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      Ciente em: {item.acknowledgedAt ? new Date(item.acknowledgedAt).toLocaleDateString("pt-BR") : "-"}
                                    </span>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-[10px] gap-1"
                                      onClick={() => acknowledgeMutation.mutate(item.id)}
                                      disabled={acknowledgeMutation.isPending}
                                      data-testid={`btn-ciente-${item.id}`}
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Ciente
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TooltipProvider>
          )}
        </TabsContent>

        <TabsContent value="monitoramento" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  Central de Monitoramento - Escavador
                </CardTitle>
                <CardDescription>
                  Gerencie monitoramentos automáticos de processos, novos processos e diários oficiais via Escavador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!escavadorConfigured ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-4 text-sm text-orange-800">
                    <p className="font-medium">API do Escavador não configurada</p>
                    <p>Para usar o monitoramento, adicione sua chave ESCAVADOR_API_KEY nos secrets.</p>
                  </div>
                ) : (
                  <MonitoringPanel />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={batchImportOpen} onOpenChange={(open) => { setBatchImportOpen(open); if (!open) { setBatchResult(null); setBatchCasesData([]); setBatchClientsData([]); setEscavadorCnjList(""); setEscavadorImportResult(null); } }}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-batch-import-title">Importação em Lote</DialogTitle>
            <DialogDescription>Importe processos e clientes a partir de arquivos Excel (.xlsx) ou CSV.</DialogDescription>
          </DialogHeader>

          <Tabs value={batchTab} onValueChange={(v) => { setBatchTab(v as any); setBatchResult(null); setEscavadorImportResult(null); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="processos" data-testid="batch-tab-processos">Excel/CSV</TabsTrigger>
              <TabsTrigger value="escavador" data-testid="batch-tab-escavador">Escavador</TabsTrigger>
              <TabsTrigger value="clientes" data-testid="batch-tab-clientes">Clientes</TabsTrigger>
            </TabsList>

            <TabsContent value="processos" className="space-y-4">
              <div className="flex items-center gap-4">
                <a href="/api/templates/cases-csv" download className="text-sm text-primary underline" data-testid="link-download-cases-template">
                  <Download className="w-4 h-4 inline mr-1" />Baixar modelo CSV
                </a>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">Selecione um arquivo Excel (.xlsx) ou CSV com os processos</p>
                <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => handleBatchFileUpload(e, "processos")} data-testid="input-upload-cases-csv" className="max-w-xs mx-auto" />
              </div>
              {batchCasesData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium" data-testid="text-cases-preview-count">{batchCasesData.length} processo(s) encontrado(s)</p>
                  <div className="max-h-48 overflow-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Tribunal</TableHead>
                          <TableHead>Autor</TableHead>
                          <TableHead>Réu</TableHead>
                          <TableHead>Cliente</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batchCasesData.map((row, i) => (
                          <TableRow key={i} data-testid={`row-case-preview-${i}`}>
                            <TableCell className="text-xs">{row.caseNumber}</TableCell>
                            <TableCell className="text-xs">{row.title}</TableCell>
                            <TableCell className="text-xs">{row.caseType}</TableCell>
                            <TableCell className="text-xs">{row.court}</TableCell>
                            <TableCell className="text-xs">{row.autor}</TableCell>
                            <TableCell className="text-xs">{row.reu}</TableCell>
                            <TableCell className="text-xs">{row.clientName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="escavador" className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Importação via Escavador V2</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Cole os números CNJ dos processos (um por linha). O sistema buscará dados completos: autor, réu, tribunal, vara, classe, valor da causa e movimentações.</p>
              </div>
              <textarea
                className="w-full h-48 p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-primary focus:outline-none"
                placeholder={"0000000-00.0000.0.00.0000\n0000000-00.0000.0.00.0000\n0000000-00.0000.0.00.0000\n\nCole um número CNJ por linha, separados por vírgula ou ponto-e-vírgula"}
                value={escavadorCnjList}
                onChange={(e) => setEscavadorCnjList(e.target.value)}
                data-testid="textarea-escavador-cnj-list"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{escavadorCnjList.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length >= 15).length} número(s) CNJ detectado(s)</span>
                <span>Máx. 200 por importação</span>
              </div>
              {escavadorImportResult && (
                <div className="p-4 rounded-lg bg-muted space-y-2" data-testid="escavador-import-result">
                  <p className="text-sm font-medium">Resultado da importação Escavador:</p>
                  {escavadorImportResult.imported > 0 && <p className="text-sm text-green-600">Importados: {escavadorImportResult.imported}</p>}
                  {escavadorImportResult.skipped > 0 && <p className="text-sm text-yellow-600">Já existentes (ignorados): {escavadorImportResult.skipped}</p>}
                  {escavadorImportResult.errors > 0 && <p className="text-sm text-red-600">Erros/Não encontrados: {escavadorImportResult.errors}</p>}
                  {escavadorImportResult.results && (
                    <div className="max-h-48 overflow-auto border rounded text-xs">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">CNJ</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Movimentações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {escavadorImportResult.results.map((r: any, i: number) => (
                            <TableRow key={i} data-testid={`row-escavador-result-${i}`}>
                              <TableCell className="text-xs font-mono">{r.cnj}</TableCell>
                              <TableCell className="text-xs">
                                {r.status === "imported" && <span className="text-green-600">Importado</span>}
                                {r.status === "skipped" && <span className="text-yellow-600">Já existe</span>}
                                {r.status === "not_found" && <span className="text-red-600">Não encontrado</span>}
                                {r.status === "error" && <span className="text-red-600" title={r.error}>Erro</span>}
                              </TableCell>
                              <TableCell className="text-xs">{r.movements ?? "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBatchImportOpen(false)} data-testid="btn-escavador-cancel">Cancelar</Button>
                <Button
                  onClick={handleEscavadorBulkImport}
                  disabled={escavadorBulkImporting || escavadorCnjList.split(/[\n,;]+/).map(l => l.trim()).filter(l => l.length >= 15).length === 0}
                  data-testid="btn-escavador-import"
                >
                  {escavadorBulkImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {escavadorBulkImporting ? "Importando do Escavador..." : "Importar do Escavador"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="clientes" className="space-y-4">
              <div className="flex items-center gap-4">
                <a href="/api/templates/clients-csv" download className="text-sm text-primary underline" data-testid="link-download-clients-template">
                  <Download className="w-4 h-4 inline mr-1" />Baixar modelo CSV
                </a>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">Selecione um arquivo CSV com os clientes</p>
                <Input type="file" accept=".csv" onChange={(e) => handleBatchFileUpload(e, "clientes")} data-testid="input-upload-clients-csv" className="max-w-xs mx-auto" />
              </div>
              {batchClientsData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium" data-testid="text-clients-preview-count">{batchClientsData.length} cliente(s) encontrado(s)</p>
                  <div className="max-h-48 overflow-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>CPF/CNPJ</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Telefone</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batchClientsData.map((row, i) => (
                          <TableRow key={i} data-testid={`row-client-preview-${i}`}>
                            <TableCell className="text-xs">{row.name}</TableCell>
                            <TableCell className="text-xs">{row.document}</TableCell>
                            <TableCell className="text-xs">{row.type}</TableCell>
                            <TableCell className="text-xs">{row.email}</TableCell>
                            <TableCell className="text-xs">{row.phone}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {batchTab !== "escavador" && batchResult && (
            <div className="p-4 rounded-lg bg-muted space-y-1" data-testid="batch-import-result">
              <p className="text-sm font-medium">Resultado da importação:</p>
              {batchResult.imported !== undefined && <p className="text-sm text-green-600" data-testid="text-batch-imported">Importados: {batchResult.imported}</p>}
              {batchResult.skipped !== undefined && batchResult.skipped > 0 && <p className="text-sm text-yellow-600" data-testid="text-batch-skipped">Duplicados ignorados: {batchResult.skipped}</p>}
              {batchResult.errors !== undefined && batchResult.errors > 0 && <p className="text-sm text-red-600" data-testid="text-batch-errors">Erros: {batchResult.errors}</p>}
              {batchResult.details?.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2 max-h-24 overflow-auto">
                  {batchResult.details.map((d: string, i: number) => <p key={i}>{d}</p>)}
                </div>
              )}
            </div>
          )}

          {batchTab !== "escavador" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setBatchImportOpen(false)} data-testid="btn-batch-cancel">Cancelar</Button>
              <Button
                onClick={handleBatchImport}
                disabled={batchImporting || (batchTab === "processos" ? batchCasesData.length === 0 : batchClientsData.length === 0)}
                data-testid="btn-batch-confirm"
              >
                {batchImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {batchImporting ? "Importando..." : "Importar"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
