import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Handshake,
  Plus,
  Trash2,
  Eye,
  Send,
  Brain,
  FileText,
  Users,
  ArrowRight,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Mail,
  MessageSquare,
  BarChart3,
  Phone,
  MapPin,
  User,
  Edit2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const formatDate = (date: string | null | undefined) =>
  date ? new Date(date).toLocaleDateString("pt-BR") : "—";

const statusConfig: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-700 border-gray-200" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-100 text-blue-700 border-blue-200" },
  proposta_enviada: { label: "Proposta Enviada", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  contraproposta: { label: "Contraproposta", color: "bg-orange-100 text-orange-700 border-orange-200" },
  acordo_fechado: { label: "Acordo Fechado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  finalizado: { label: "Finalizado", color: "bg-green-100 text-green-800 border-green-300" },
  recusado: { label: "Recusado", color: "bg-red-100 text-red-700 border-red-200" },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-500 border-gray-200" },
};

const riskColor = (score: number | string | null | undefined) => {
  const num = typeof score === "string" ? parseFloat(score) : score;
  if (num == null || isNaN(num)) return "bg-gray-100 text-gray-600 border-gray-200";
  if (num <= 3) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (num <= 6) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-red-100 text-red-700 border-red-200";
};

const phoneMask = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export default function NegotiationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNegotiation, setSelectedNegotiation] = useState<any>(null);
  const [sheetTab, setSheetTab] = useState("devedor");
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);

  const [newForm, setNewForm] = useState({
    clientId: "",
    caseId: "",
    debtorId: "",
    debtorName: "",
    debtorDocument: "",
    debtorWhatsapp: "",
    debtorEmail: "",
    debtorAddress: "",
    debtorCity: "",
    debtorState: "",
    minValue: "",
    maxValue: "",
    minDownPaymentPercent: "",
    maxInstallments: "",
    maxInstallmentMonths: "",
    mandatoryConditions: "",
    strategy: "moderada",
    conditions: "",
    deadline: "",
    notes: "",
    negotiationMode: "semi_automatico",
  });

  const [newRoundForm, setNewRoundForm] = useState({ type: "proposta", proposedValue: "", conditions: "", message: "" });
  const [isAddRoundOpen, setIsAddRoundOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ name: "", document: "", whatsapp: "", email: "", address: "", city: "", state: "" });
  const [isEditDebtorOpen, setIsEditDebtorOpen] = useState(false);
  const [editDebtorForm, setEditDebtorForm] = useState<any>({});
  const [isWhatsAppDialogOpen, setIsWhatsAppDialogOpen] = useState(false);
  const [whatsappContactId, setWhatsappContactId] = useState<number | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [isGeneratingWhatsapp, setIsGeneratingWhatsapp] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementHtml, setAgreementHtml] = useState("");
  const [agreementFilename, setAgreementFilename] = useState("");
  const [isGeneratingAgreement, setIsGeneratingAgreement] = useState(false);
  const [isSendingAgreement, setIsSendingAgreement] = useState(false);

  const { data: negotiations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/negotiations"],
    queryFn: async () => {
      const res = await fetch("/api/negotiations", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch negotiations");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const { data: allCases = [] } = useQuery<any[]>({
    queryKey: ["/api/cases"],
    queryFn: async () => {
      const res = await fetch("/api/cases", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cases");
      return res.json();
    },
  });

  const { data: contacts = [] } = useQuery<any[]>({
    queryKey: ["/api/negotiations", selectedNegotiation?.id, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/contacts`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
    enabled: !!selectedNegotiation?.id,
    refetchInterval: 15000,
  });

  const { data: rounds = [] } = useQuery<any[]>({
    queryKey: ["/api/negotiations", selectedNegotiation?.id, "rounds"],
    queryFn: async () => {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/rounds`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rounds");
      return res.json();
    },
    enabled: !!selectedNegotiation?.id,
    refetchInterval: 10000,
  });

  const { data: allNegContacts = [] } = useQuery<any[]>({
    queryKey: ["/api/negotiations/all-contacts"],
    queryFn: async () => {
      const contactsMap: any[] = [];
      for (const neg of negotiations) {
        try {
          const res = await fetch(`/api/negotiations/${neg.id}/contacts`, { headers: getAuthHeaders(), credentials: "include" });
          if (res.ok) {
            const c = await res.json();
            if (c.length > 0) contactsMap.push({ negId: neg.id, contact: c[0] });
          }
        } catch {}
      }
      return contactsMap;
    },
    enabled: negotiations.length > 0,
  });

  const { data: clientDebtors = [] } = useQuery<any[]>({
    queryKey: ["/api/clients", newForm.clientId, "debtors"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${newForm.clientId}/debtors`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!newForm.clientId,
  });

  useEffect(() => {
    if (urlParamsProcessed) return;
    const params = new URLSearchParams(window.location.search);
    const pClientId = params.get("clientId");
    const pDebtorId = params.get("debtorId");
    if (pClientId) {
      setNewForm(prev => ({ ...prev, clientId: pClientId, debtorId: pDebtorId || "" }));
      setIsCreateOpen(true);
      setUrlParamsProcessed(true);
      window.history.replaceState({}, "", window.location.pathname);
      if (pDebtorId) {
        fetch(`/api/debtors/${pDebtorId}`, { headers: getAuthHeaders(), credentials: "include" })
          .then(r => r.json())
          .then(d => {
            if (d && d.name) {
              setNewForm(prev => ({
                ...prev,
                debtorId: String(d.id),
                debtorName: d.name || "",
                debtorDocument: d.document || "",
                debtorWhatsapp: d.whatsapp ? phoneMask(d.whatsapp) : (d.phone ? phoneMask(d.phone) : ""),
                debtorEmail: d.email || "",
                debtorAddress: d.address || "",
                debtorCity: d.city || "",
                debtorState: d.state || "",
              }));
            }
          })
          .catch(() => {});
      }
    }
  }, [urlParamsProcessed]);

  const filteredCases = useMemo(() => {
    if (!newForm.clientId) return [];
    return allCases.filter((c: any) => c.clientId === Number(newForm.clientId));
  }, [newForm.clientId, allCases]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/negotiations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data.negotiation),
      });
      if (!res.ok) throw new Error("Erro ao criar negociação");
      const neg = await res.json();
      const contactRes = await fetch(`/api/negotiations/${neg.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data.debtor),
      });
      if (!contactRes.ok) throw new Error("Erro ao criar devedor");
      return neg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations/all-contacts"] });
      setIsCreateOpen(false);
      setNewForm({ clientId: "", caseId: "", debtorId: "", debtorName: "", debtorDocument: "", debtorWhatsapp: "", debtorEmail: "", debtorAddress: "", debtorCity: "", debtorState: "", minValue: "", maxValue: "", minDownPaymentPercent: "", maxInstallments: "", maxInstallmentMonths: "", mandatoryConditions: "", strategy: "moderada", conditions: "", deadline: "", notes: "", negotiationMode: "semi_automatico" });
      toast({ title: "Negociação criada com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao criar negociação", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/negotiations/${id}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro ao excluir negociação");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations/all-contacts"] });
      if (selectedNegotiation) setSelectedNegotiation(null);
      toast({ title: "Negociação excluída" });
    },
    onError: () => { toast({ title: "Erro ao excluir negociação", variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/negotiations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao atualizar negociação");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      if (selectedNegotiation) setSelectedNegotiation(data);
      toast({ title: "Negociação atualizada" });
    },
    onError: () => { toast({ title: "Erro ao atualizar", variant: "destructive" }); },
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao adicionar devedor");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations/all-contacts"] });
      setAddContactForm({ name: "", document: "", whatsapp: "", email: "", address: "", city: "", state: "" });
      setIsAddContactOpen(false);
      toast({ title: "Devedor adicionado" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await fetch(`/api/negotiations/contacts/${contactId}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro ao remover devedor");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations/all-contacts"] });
      toast({ title: "Devedor removido" });
    },
  });

  const addRoundMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao adicionar rodada");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      setNewRoundForm({ type: "proposta", proposedValue: "", conditions: "", message: "" });
      setIsAddRoundOpen(false);
      toast({ title: "Proposta adicionada" });
    },
  });

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiProposing, setAiProposing] = useState(false);

  const handleAiAnalyze = async () => {
    if (!selectedNegotiation) return;
    setAiAnalyzing(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro na análise IA");
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      toast({ title: "Análise IA concluída" });
    } catch {
      toast({ title: "Erro ao analisar com IA", variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleAiProposal = async () => {
    if (!selectedNegotiation) return;
    setAiProposing(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/ai-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao gerar proposta IA");
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "rounds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations"] });
      toast({ title: "Proposta IA gerada com sucesso" });
    } catch {
      toast({ title: "Erro ao gerar proposta IA", variant: "destructive" });
    } finally {
      setAiProposing(false);
    }
  };

  const handleGenerateAgreement = async () => {
    if (!selectedNegotiation) return;
    setIsGeneratingAgreement(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/generate-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ value: selectedNegotiation.currentProposalValue }),
      });
      if (!res.ok) throw new Error("Erro ao gerar acordo");
      const data = await res.json();
      setAgreementHtml(data.html);
      setAgreementFilename(data.filename);
      setIsAgreementOpen(true);
      toast({ title: "Termo de Acordo gerado com sucesso" });
    } catch {
      toast({ title: "Erro ao gerar Termo de Acordo", variant: "destructive" });
    } finally {
      setIsGeneratingAgreement(false);
    }
  };

  const handleSendAgreement = async (sendWhatsapp: boolean, sendEmail: boolean) => {
    if (!selectedNegotiation || !agreementHtml) return;
    setIsSendingAgreement(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/send-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          sendWhatsapp,
          sendEmail,
          contactId: contacts[0]?.id,
        }),
      });
      if (!res.ok) throw new Error("Erro ao enviar acordo");
      const data = await res.json();
      const msgs: string[] = [];
      if (data.results?.whatsapp) msgs.push("WhatsApp");
      if (data.results?.email) msgs.push("Email");
      toast({ title: `Acordo enviado via ${msgs.join(" e ") || "canal selecionado"}` });
    } catch {
      toast({ title: "Erro ao enviar Termo de Acordo", variant: "destructive" });
    } finally {
      setIsSendingAgreement(false);
    }
  };

  const handleSendEmail = async (roundId: number) => {
    try {
      const res = await fetch(`/api/negotiations/rounds/${roundId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao enviar email");
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "rounds"] });
      toast({ title: "Email enviado com sucesso" });
    } catch {
      toast({ title: "Erro ao enviar email", variant: "destructive" });
    }
  };

  const handleOpenWhatsApp = async (contactId: number) => {
    setWhatsappContactId(contactId);
    setWhatsappMessage("");
    setIsWhatsAppDialogOpen(true);
    setIsGeneratingWhatsapp(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/ai-whatsapp-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ contactId }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhatsappMessage(data.message || data.content || "");
      }
    } catch {
      toast({ title: "Erro ao gerar mensagem WhatsApp", variant: "destructive" });
    } finally {
      setIsGeneratingWhatsapp(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappContactId || !whatsappMessage) return;
    setIsSendingWhatsapp(true);
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ contactId: whatsappContactId, message: whatsappMessage }),
      });
      if (!res.ok) throw new Error("Erro ao enviar WhatsApp");
      toast({ title: "Mensagem WhatsApp enviada!" });
      setIsWhatsAppDialogOpen(false);
    } catch {
      toast({ title: "Erro ao enviar WhatsApp", variant: "destructive" });
    } finally {
      setIsSendingWhatsapp(false);
    }
  };

  const handleCreate = () => {
    if (!newForm.clientId) { toast({ title: "Selecione um cliente (credor)", variant: "destructive" }); return; }
    if (!newForm.debtorName) { toast({ title: "Informe o nome do devedor", variant: "destructive" }); return; }
    if (!newForm.debtorWhatsapp || newForm.debtorWhatsapp.replace(/\D/g, "").length < 10) { toast({ title: "Informe o celular do devedor (obrigatório para WhatsApp)", variant: "destructive" }); return; }

    createMutation.mutate({
      negotiation: {
        clientId: Number(newForm.clientId),
        caseId: newForm.caseId ? Number(newForm.caseId) : null,
        debtorId: newForm.debtorId ? Number(newForm.debtorId) : null,
        minValue: newForm.minValue || null,
        maxValue: newForm.maxValue || null,
        minDownPaymentPercent: newForm.minDownPaymentPercent ? Number(newForm.minDownPaymentPercent) : null,
        maxInstallments: newForm.maxInstallments ? Number(newForm.maxInstallments) : null,
        maxInstallmentMonths: newForm.maxInstallmentMonths ? Number(newForm.maxInstallmentMonths) : null,
        mandatoryConditions: newForm.mandatoryConditions || null,
        strategy: newForm.strategy,
        conditions: newForm.conditions || null,
        deadline: newForm.deadline ? new Date(newForm.deadline).toISOString() : null,
        notes: newForm.notes || null,
        negotiationMode: newForm.negotiationMode,
      },
      debtor: {
        name: newForm.debtorName,
        role: "devedor",
        document: newForm.debtorDocument || null,
        whatsapp: newForm.debtorWhatsapp.replace(/\D/g, "") || null,
        email: newForm.debtorEmail || null,
        address: newForm.debtorAddress || null,
        city: newForm.debtorCity || null,
        state: newForm.debtorState || null,
      },
    });
  };

  const handleUpdateDebtor = async () => {
    if (!editDebtorForm.id) return;
    try {
      const res = await fetch(`/api/negotiations/${selectedNegotiation.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(editDebtorForm),
      });
      await fetch(`/api/negotiations/contacts/${editDebtorForm.id}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations", selectedNegotiation.id, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/negotiations/all-contacts"] });
      setIsEditDebtorOpen(false);
      toast({ title: "Devedor atualizado" });
    } catch {
      toast({ title: "Erro ao atualizar devedor", variant: "destructive" });
    }
  };

  const clientMap = useMemo(() => {
    const map: Record<number, string> = {};
    clients.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const caseMap = useMemo(() => {
    const map: Record<number, string> = {};
    allCases.forEach((c: any) => { map[c.id] = c.caseNumber; });
    return map;
  }, [allCases]);

  const negContactMap = useMemo(() => {
    const map: Record<number, any> = {};
    allNegContacts.forEach((item: any) => { map[item.negId] = item.contact; });
    return map;
  }, [allNegContacts]);

  const kpis = useMemo(() => {
    const total = negotiations.length;
    const emAndamento = negotiations.filter((n: any) => n.status === "em_andamento").length;
    const acordosFechados = negotiations.filter((n: any) => n.status === "acordo_fechado").length;
    const valorAcordado = negotiations
      .filter((n: any) => n.status === "acordo_fechado")
      .reduce((sum: number, n: any) => sum + (parseFloat(n.currentProposalValue) || 0), 0);
    return { total, emAndamento, acordosFechados, valorAcordado };
  }, [negotiations]);

  const primaryDebtor = contacts.length > 0 ? contacts[0] : null;

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-negotiations-title">
            <Handshake className="inline w-8 h-8 mr-2 -mt-1" />
            Negociações
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie negociações com devedores dos seus clientes.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="btn-nova-negociacao">
              <Plus className="w-4 h-4" />
              Nova Negociação
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Negociação</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Cliente (Credor)
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select value={newForm.clientId} onValueChange={(v) => setNewForm({ ...newForm, clientId: v, caseId: "" })}>
                      <SelectTrigger data-testid="select-neg-client">
                        <SelectValue placeholder="Selecione o cliente credor" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Processo (opcional)</Label>
                    <Select value={newForm.caseId} onValueChange={(v) => setNewForm({ ...newForm, caseId: v })}>
                      <SelectTrigger data-testid="select-neg-case">
                        <SelectValue placeholder="Vincular a um processo" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredCases.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.caseNumber} - {c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Dados do Devedor
                </h3>
                <div className="space-y-3">
                  {clientDebtors.length > 0 && (
                    <div className="space-y-2">
                      <Label>Selecionar devedor cadastrado</Label>
                      <Select
                        value=""
                        onValueChange={(v) => {
                          const d = clientDebtors.find((d: any) => String(d.id) === v);
                          if (d) {
                            setNewForm({
                              ...newForm,
                              debtorId: String(d.id),
                              debtorName: d.name || "",
                              debtorDocument: d.document || "",
                              debtorWhatsapp: d.whatsapp ? phoneMask(d.whatsapp) : (d.phone ? phoneMask(d.phone) : ""),
                              debtorEmail: d.email || "",
                              debtorAddress: d.address || "",
                              debtorCity: d.city || "",
                              debtorState: d.state || "",
                            });
                          }
                        }}
                        data-testid="select-neg-existing-debtor"
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um devedor já cadastrado ou preencha abaixo" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientDebtors.map((d: any) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name} {d.document ? `(${d.document})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Nome completo do devedor *</Label>
                    <Input
                      value={newForm.debtorName}
                      onChange={(e) => setNewForm({ ...newForm, debtorName: e.target.value })}
                      placeholder="Nome completo"
                      data-testid="input-neg-debtor-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>CPF/CNPJ</Label>
                      <Input
                        value={newForm.debtorDocument}
                        onChange={(e) => setNewForm({ ...newForm, debtorDocument: e.target.value })}
                        placeholder="000.000.000-00"
                        data-testid="input-neg-debtor-document"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Celular (WhatsApp)</Label>
                      <Input
                        value={newForm.debtorWhatsapp}
                        onChange={(e) => setNewForm({ ...newForm, debtorWhatsapp: phoneMask(e.target.value) })}
                        placeholder="(61) 98371-7842"
                        data-testid="input-neg-debtor-whatsapp"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={newForm.debtorEmail}
                      onChange={(e) => setNewForm({ ...newForm, debtorEmail: e.target.value })}
                      placeholder="email@exemplo.com"
                      data-testid="input-neg-debtor-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço</Label>
                    <Input
                      value={newForm.debtorAddress}
                      onChange={(e) => setNewForm({ ...newForm, debtorAddress: e.target.value })}
                      placeholder="Rua, número, bairro"
                      data-testid="input-neg-debtor-address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Input
                        value={newForm.debtorCity}
                        onChange={(e) => setNewForm({ ...newForm, debtorCity: e.target.value })}
                        placeholder="Cidade"
                        data-testid="input-neg-debtor-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Input
                        value={newForm.debtorState}
                        onChange={(e) => setNewForm({ ...newForm, debtorState: e.target.value })}
                        placeholder="UF"
                        maxLength={2}
                        data-testid="input-neg-debtor-state"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Termos da Negociação
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor Mínimo (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newForm.minValue}
                        onChange={(e) => setNewForm({ ...newForm, minValue: e.target.value })}
                        placeholder="10000.00"
                        data-testid="input-neg-min-value"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor Máximo (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newForm.maxValue}
                        onChange={(e) => setNewForm({ ...newForm, maxValue: e.target.value })}
                        placeholder="50000.00"
                        data-testid="input-neg-max-value"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Estratégia de Negociação</Label>
                    <Select value={newForm.strategy} onValueChange={(v) => setNewForm({ ...newForm, strategy: v })}>
                      <SelectTrigger data-testid="select-neg-strategy">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agressiva">Agressiva — Pressão máxima, poucas concessões</SelectItem>
                        <SelectItem value="moderada">Moderada — Equilíbrio entre firmeza e flexibilidade</SelectItem>
                        <SelectItem value="conservadora">Conservadora — Prioriza fechar acordo, mais flexível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Entrada Mínima (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={newForm.minDownPaymentPercent}
                        onChange={(e) => setNewForm({ ...newForm, minDownPaymentPercent: e.target.value })}
                        placeholder="30"
                        data-testid="input-neg-down-payment"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Máx. Parcelas</Label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        value={newForm.maxInstallments}
                        onChange={(e) => setNewForm({ ...newForm, maxInstallments: e.target.value })}
                        placeholder="12"
                        data-testid="input-neg-max-installments"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Máx. Meses</Label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        value={newForm.maxInstallmentMonths}
                        onChange={(e) => setNewForm({ ...newForm, maxInstallmentMonths: e.target.value })}
                        placeholder="12"
                        data-testid="input-neg-max-months"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Condições Obrigatórias (inegociáveis)</Label>
                    <Textarea
                      value={newForm.mandatoryConditions}
                      onChange={(e) => setNewForm({ ...newForm, mandatoryConditions: e.target.value })}
                      placeholder="Ex: Quitação integral da dívida, baixa de negativação, encerramento processual..."
                      rows={2}
                      data-testid="input-neg-mandatory"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instruções Adicionais</Label>
                    <Textarea
                      value={newForm.conditions}
                      onChange={(e) => setNewForm({ ...newForm, conditions: e.target.value })}
                      placeholder="Instruções específicas para o negociador..."
                      data-testid="input-neg-conditions"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo Limite</Label>
                    <Input
                      type="date"
                      value={newForm.deadline}
                      onChange={(e) => setNewForm({ ...newForm, deadline: e.target.value })}
                      data-testid="input-neg-deadline"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações / Notas para a IA</Label>
                    <Textarea
                      value={newForm.notes}
                      onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                      placeholder="Ex: Devedor tem histórico de inadimplência. Empresa está passando por dificuldades..."
                      data-testid="input-neg-notes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Modo da IA Negociadora</Label>
                    <Select value={newForm.negotiationMode} onValueChange={(v) => setNewForm({ ...newForm, negotiationMode: v })}>
                      <SelectTrigger data-testid="select-neg-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatico">Automático - IA negocia sozinha dentro dos limites</SelectItem>
                        <SelectItem value="semi_automatico">Semi-automático - IA gera rascunho para sua aprovação</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {newForm.negotiationMode === "automatico"
                        ? "A IA responderá automaticamente ao devedor quando ele mandar mensagem no WhatsApp, usando as condições e limites definidos acima."
                        : "A IA gerará um rascunho de resposta que aparecerá no painel da Secretária para sua aprovação antes de enviar."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} data-testid="btn-cancel-neg">Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="btn-save-neg">
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Criar Negociação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20" data-testid="loading-negotiations">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mt-6">
            <Card data-testid="card-kpi-total">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Handshake className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Total de Negociações</p>
                    <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-kpi-total">{kpis.total}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-andamento">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Em Andamento</p>
                    <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-kpi-andamento">{kpis.emAndamento}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-acordos">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Acordos Fechados</p>
                    <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-kpi-acordos">{kpis.acordosFechados}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-kpi-valor">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Valor Total Acordado</p>
                    <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-kpi-valor">{formatCurrency(kpis.valorAcordado)}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Pipeline de Negociações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {negotiations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-negotiations">
                  <Handshake className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Nenhuma negociação encontrada</p>
                  <p className="text-sm mt-1">Crie sua primeira negociação para começar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Devedor</th>
                        <th className="pb-3 font-medium">CPF/CNPJ</th>
                        <th className="pb-3 font-medium">Celular</th>
                        <th className="pb-3 font-medium">Cliente (Credor)</th>
                        <th className="pb-3 font-medium">Processo</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Valor Proposta</th>
                        <th className="pb-3 font-medium">Risco IA</th>
                        <th className="pb-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {negotiations.map((neg: any) => {
                        const st = statusConfig[neg.status] || statusConfig.rascunho;
                        const contact = negContactMap[neg.id];
                        return (
                          <tr key={neg.id} className="border-b hover:bg-muted/50 transition-colors" data-testid={`row-negotiation-${neg.id}`}>
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                  <User className="w-4 h-4 text-slate-600" />
                                </div>
                                <span className="font-medium truncate max-w-[140px]" data-testid={`text-debtor-name-${neg.id}`}>
                                  {contact?.name || "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-muted-foreground" data-testid={`text-debtor-doc-${neg.id}`}>
                              {contact?.document || "—"}
                            </td>
                            <td className="py-3 pr-3 text-muted-foreground" data-testid={`text-debtor-phone-${neg.id}`}>
                              {contact?.whatsapp ? phoneMask(contact.whatsapp) : contact?.phone ? phoneMask(contact.phone) : "—"}
                            </td>
                            <td className="py-3 pr-3 font-medium" data-testid={`text-client-name-${neg.id}`}>
                              {clientMap[neg.clientId] || "—"}
                            </td>
                            <td className="py-3 pr-3 text-muted-foreground" data-testid={`text-case-number-${neg.id}`}>
                              {neg.caseId ? caseMap[neg.caseId] || "—" : "—"}
                            </td>
                            <td className="py-3 pr-3">
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className={`${st.color} text-xs w-fit`} data-testid={`badge-status-${neg.id}`}>
                                  {st.label}
                                </Badge>
                                <span className={`text-[10px] font-medium ${neg.negotiationMode === "automatico" ? "text-green-600" : "text-amber-600"}`} data-testid={`text-mode-${neg.id}`}>
                                  {neg.negotiationMode === "automatico" ? "IA Auto" : "Semi-auto"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 pr-3 font-medium" data-testid={`text-proposal-value-${neg.id}`}>
                              {formatCurrency(neg.currentProposalValue)}
                            </td>
                            <td className="py-3 pr-3">
                              {neg.aiRiskScore ? (
                                <Badge variant="outline" className={`${riskColor(neg.aiRiskScore)} text-xs`} data-testid={`badge-risk-${neg.id}`}>
                                  {neg.aiRiskScore}/10
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setSelectedNegotiation(neg); setSheetTab("devedor"); }}
                                data-testid={`btn-view-${neg.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Sheet open={!!selectedNegotiation} onOpenChange={(open) => { if (!open) setSelectedNegotiation(null); }}>
        <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
          {selectedNegotiation && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Handshake className="w-5 h-5" />
                    Negociação #{selectedNegotiation.id}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(selectedNegotiation.id)}
                    data-testid="btn-delete-negotiation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </SheetTitle>
              </SheetHeader>

              <Tabs value={sheetTab} onValueChange={setSheetTab} className="mt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="devedor" className="flex-1" data-testid="tab-devedor">Devedor</TabsTrigger>
                  <TabsTrigger value="propostas" className="flex-1" data-testid="tab-propostas">Propostas</TabsTrigger>
                  <TabsTrigger value="resumo" className="flex-1" data-testid="tab-resumo">Resumo</TabsTrigger>
                </TabsList>

                <TabsContent value="devedor" className="mt-4 space-y-4">
                  {contacts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Nenhum devedor vinculado</p>
                    </div>
                  ) : (
                    contacts.map((c: any) => (
                      <Card key={c.id} data-testid={`card-debtor-${c.id}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                <User className="w-5 h-5 text-slate-600" />
                              </div>
                              <div>
                                <p className="font-semibold" data-testid={`text-debtor-detail-name-${c.id}`}>{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.role || "devedor"}</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditDebtorForm(c); setIsEditDebtorOpen(true); }}
                                data-testid={`btn-edit-debtor-${c.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                onClick={() => deleteContactMutation.mutate(c.id)}
                                data-testid={`btn-delete-debtor-${c.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <Separator />
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {c.document && (
                              <div>
                                <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
                                <p className="font-medium" data-testid={`text-debtor-detail-doc-${c.id}`}>{c.document}</p>
                              </div>
                            )}
                            {(c.whatsapp || c.phone) && (
                              <div>
                                <p className="text-xs text-muted-foreground">Celular</p>
                                <p className="font-medium flex items-center gap-1" data-testid={`text-debtor-detail-phone-${c.id}`}>
                                  <Phone className="w-3 h-3" />
                                  {phoneMask(c.whatsapp || c.phone)}
                                </p>
                              </div>
                            )}
                            {c.email && (
                              <div>
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="font-medium flex items-center gap-1" data-testid={`text-debtor-detail-email-${c.id}`}>
                                  <Mail className="w-3 h-3" />
                                  {c.email}
                                </p>
                              </div>
                            )}
                            {c.address && (
                              <div>
                                <p className="text-xs text-muted-foreground">Endereço</p>
                                <p className="font-medium flex items-center gap-1" data-testid={`text-debtor-detail-address-${c.id}`}>
                                  <MapPin className="w-3 h-3" />
                                  {c.address}
                                </p>
                              </div>
                            )}
                            {(c.city || c.state) && (
                              <div>
                                <p className="text-xs text-muted-foreground">Cidade/Estado</p>
                                <p className="font-medium" data-testid={`text-debtor-detail-city-${c.id}`}>
                                  {[c.city, c.state].filter(Boolean).join(" / ")}
                                </p>
                              </div>
                            )}
                          </div>
                          <Button
                            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 mt-2"
                            onClick={() => handleOpenWhatsApp(c.id)}
                            data-testid={`btn-whatsapp-${c.id}`}
                          >
                            <MessageSquare className="w-4 h-4" />
                            Negociar via WhatsApp
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )}
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setIsAddContactOpen(true)}
                    data-testid="btn-add-debtor"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Devedor
                  </Button>

                  <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
                    <DialogContent className="sm:max-w-[480px]">
                      <DialogHeader>
                        <DialogTitle>Adicionar Devedor</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-3">
                        <div className="space-y-2">
                          <Label>Nome *</Label>
                          <Input value={addContactForm.name} onChange={(e) => setAddContactForm({ ...addContactForm, name: e.target.value })} data-testid="input-add-debtor-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>CPF/CNPJ</Label>
                            <Input value={addContactForm.document} onChange={(e) => setAddContactForm({ ...addContactForm, document: e.target.value })} data-testid="input-add-debtor-doc" />
                          </div>
                          <div className="space-y-2">
                            <Label>Celular (WhatsApp)</Label>
                            <Input value={addContactForm.whatsapp} onChange={(e) => setAddContactForm({ ...addContactForm, whatsapp: phoneMask(e.target.value) })} data-testid="input-add-debtor-whatsapp" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" value={addContactForm.email} onChange={(e) => setAddContactForm({ ...addContactForm, email: e.target.value })} data-testid="input-add-debtor-email" />
                        </div>
                        <div className="space-y-2">
                          <Label>Endereço</Label>
                          <Input value={addContactForm.address} onChange={(e) => setAddContactForm({ ...addContactForm, address: e.target.value })} data-testid="input-add-debtor-address" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Cidade</Label>
                            <Input value={addContactForm.city} onChange={(e) => setAddContactForm({ ...addContactForm, city: e.target.value })} data-testid="input-add-debtor-city" />
                          </div>
                          <div className="space-y-2">
                            <Label>Estado</Label>
                            <Input value={addContactForm.state} onChange={(e) => setAddContactForm({ ...addContactForm, state: e.target.value })} maxLength={2} data-testid="input-add-debtor-state" />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>Cancelar</Button>
                        <Button
                          onClick={() => addContactMutation.mutate({ ...addContactForm, role: "devedor", whatsapp: addContactForm.whatsapp.replace(/\D/g, "") || null })}
                          disabled={!addContactForm.name || addContactMutation.isPending}
                          data-testid="btn-save-debtor"
                        >
                          {addContactMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                          Salvar
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isEditDebtorOpen} onOpenChange={setIsEditDebtorOpen}>
                    <DialogContent className="sm:max-w-[480px]">
                      <DialogHeader>
                        <DialogTitle>Editar Devedor</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-3">
                        <div className="space-y-2">
                          <Label>Nome *</Label>
                          <Input value={editDebtorForm.name || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, name: e.target.value })} data-testid="input-edit-debtor-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>CPF/CNPJ</Label>
                            <Input value={editDebtorForm.document || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, document: e.target.value })} data-testid="input-edit-debtor-doc" />
                          </div>
                          <div className="space-y-2">
                            <Label>Celular</Label>
                            <Input value={editDebtorForm.whatsapp ? phoneMask(editDebtorForm.whatsapp) : ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, whatsapp: e.target.value.replace(/\D/g, "") })} data-testid="input-edit-debtor-whatsapp" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" value={editDebtorForm.email || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, email: e.target.value })} data-testid="input-edit-debtor-email" />
                        </div>
                        <div className="space-y-2">
                          <Label>Endereço</Label>
                          <Input value={editDebtorForm.address || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, address: e.target.value })} data-testid="input-edit-debtor-address" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Cidade</Label>
                            <Input value={editDebtorForm.city || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, city: e.target.value })} data-testid="input-edit-debtor-city" />
                          </div>
                          <div className="space-y-2">
                            <Label>Estado</Label>
                            <Input value={editDebtorForm.state || ""} onChange={(e) => setEditDebtorForm({ ...editDebtorForm, state: e.target.value })} maxLength={2} data-testid="input-edit-debtor-state" />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEditDebtorOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdateDebtor} data-testid="btn-save-edit-debtor">Salvar</Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isWhatsAppDialogOpen} onOpenChange={setIsWhatsAppDialogOpen}>
                    <DialogContent className="sm:max-w-[520px]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-green-600" />
                          Negociar via WhatsApp
                        </DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        {isGeneratingWhatsapp ? (
                          <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                            <p className="text-sm text-muted-foreground">Gerando mensagem com IA...</p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label>Mensagem</Label>
                              <Textarea
                                value={whatsappMessage}
                                onChange={(e) => setWhatsappMessage(e.target.value)}
                                rows={8}
                                placeholder="Mensagem para o devedor..."
                                data-testid="textarea-whatsapp-message"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Edite a mensagem acima antes de enviar. A IA gerou uma sugestão baseada nos dados da negociação.
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsWhatsAppDialogOpen(false)}>Cancelar</Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white gap-2"
                          onClick={handleSendWhatsApp}
                          disabled={isSendingWhatsapp || isGeneratingWhatsapp || !whatsappMessage}
                          data-testid="btn-send-whatsapp"
                        >
                          {isSendingWhatsapp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Enviar
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TabsContent>

                <TabsContent value="propostas" className="mt-4 space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setIsAddRoundOpen(true)} data-testid="btn-nova-proposta">
                      <Plus className="w-4 h-4" /> Nova Proposta
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={handleAiProposal} disabled={aiProposing} data-testid="btn-ai-proposal">
                      {aiProposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      Gerar Proposta IA
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={handleAiAnalyze} disabled={aiAnalyzing} data-testid="btn-ai-analyze">
                      {aiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                      Analisar Risco IA
                    </Button>
                    {(selectedNegotiation?.status === "acordo_fechado" || selectedNegotiation?.status === "finalizado") && (
                      <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleGenerateAgreement} disabled={isGeneratingAgreement} data-testid="btn-gerar-acordo">
                        {isGeneratingAgreement ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        Gerar Termo de Acordo
                      </Button>
                    )}
                  </div>

                  {rounds.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma proposta registrada</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rounds.map((r: any, idx: number) => (
                        <Card key={r.id} data-testid={`card-round-${r.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={r.type === "proposta" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-orange-50 text-orange-700 border-orange-200"}>
                                  {r.type === "proposta" ? "Proposta" : "Contraproposta"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                            </div>
                            <p className="font-semibold text-lg" data-testid={`text-round-value-${r.id}`}>{formatCurrency(r.value)}</p>
                            {r.conditions && <p className="text-sm text-muted-foreground mt-1">{r.conditions}</p>}
                            {r.message && <p className="text-sm mt-1 italic text-muted-foreground">"{r.message}"</p>}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              {r.sentViaEmail && <Badge variant="outline" className="text-xs gap-1"><Mail className="w-3 h-3" /> Email</Badge>}
                              {r.sentViaWhatsapp && <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-200"><MessageSquare className="w-3 h-3" /> WhatsApp</Badge>}
                              {r.sentAt && <span>Enviado em {formatDate(r.sentAt)}</span>}
                            </div>
                            {r.response && (
                              <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                                <p className="text-xs text-muted-foreground mb-1">Resposta:</p>
                                <p>{r.response}</p>
                                {r.respondedAt && <p className="text-xs text-muted-foreground mt-1">{formatDate(r.respondedAt)}</p>}
                              </div>
                            )}
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => handleSendEmail(r.id)} data-testid={`btn-send-email-${r.id}`}>
                                <Mail className="w-3 h-3" /> Enviar por Email
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <Dialog open={isAddRoundOpen} onOpenChange={setIsAddRoundOpen}>
                    <DialogContent className="sm:max-w-[460px]">
                      <DialogHeader>
                        <DialogTitle>Nova Proposta</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-3">
                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select value={newRoundForm.type} onValueChange={(v) => setNewRoundForm({ ...newRoundForm, type: v })}>
                            <SelectTrigger data-testid="select-round-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="proposta">Proposta</SelectItem>
                              <SelectItem value="contraproposta">Contraproposta</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Valor (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newRoundForm.proposedValue}
                            onChange={(e) => setNewRoundForm({ ...newRoundForm, proposedValue: e.target.value })}
                            placeholder="25000.00"
                            data-testid="input-round-value"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Condições</Label>
                          <Textarea
                            value={newRoundForm.conditions}
                            onChange={(e) => setNewRoundForm({ ...newRoundForm, conditions: e.target.value })}
                            placeholder="Condições de pagamento..."
                            data-testid="input-round-conditions"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Mensagem</Label>
                          <Textarea
                            value={newRoundForm.message}
                            onChange={(e) => setNewRoundForm({ ...newRoundForm, message: e.target.value })}
                            placeholder="Mensagem para o devedor..."
                            data-testid="input-round-message"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsAddRoundOpen(false)}>Cancelar</Button>
                        <Button
                          onClick={() => addRoundMutation.mutate({
                            type: newRoundForm.type,
                            value: newRoundForm.proposedValue || null,
                            conditions: newRoundForm.conditions || null,
                            message: newRoundForm.message || null,
                          })}
                          disabled={addRoundMutation.isPending}
                          data-testid="btn-save-round"
                        >
                          {addRoundMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                          Salvar
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TabsContent>

                <TabsContent value="resumo" className="mt-4 space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-muted-foreground">Status</p>
                        <Badge variant="outline" className={`${(statusConfig[selectedNegotiation.status] || statusConfig.rascunho).color}`} data-testid="badge-detail-status">
                          {(statusConfig[selectedNegotiation.status] || statusConfig.rascunho).label}
                        </Badge>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Cliente (Credor)</p>
                          <p className="font-medium" data-testid="text-detail-client">{clientMap[selectedNegotiation.clientId] || "—"}</p>
                        </div>
                        {selectedNegotiation.caseId && (
                          <div>
                            <p className="text-xs text-muted-foreground">Processo</p>
                            <p className="font-medium" data-testid="text-detail-case">{caseMap[selectedNegotiation.caseId] || "—"}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">Valor Mínimo</p>
                          <p className="font-medium" data-testid="text-detail-min">{formatCurrency(selectedNegotiation.minValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Valor Máximo</p>
                          <p className="font-medium" data-testid="text-detail-max">{formatCurrency(selectedNegotiation.maxValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Proposta Atual</p>
                          <p className="font-medium" data-testid="text-detail-current">{formatCurrency(selectedNegotiation.currentProposalValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Prazo</p>
                          <p className="font-medium flex items-center gap-1" data-testid="text-detail-deadline">
                            <Calendar className="w-3 h-3" />
                            {formatDate(selectedNegotiation.deadline)}
                          </p>
                        </div>
                      </div>
                      {selectedNegotiation.conditions && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Condições / Instruções IA</p>
                          <p className="text-sm" data-testid="text-detail-conditions">{selectedNegotiation.conditions}</p>
                        </div>
                      )}
                      <Separator />
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Modo da IA Negociadora</p>
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedNegotiation.negotiationMode || "semi_automatico"}
                            onValueChange={(v) => updateMutation.mutate({ id: selectedNegotiation.id, data: { negotiationMode: v } })}
                          >
                            <SelectTrigger className="w-full" data-testid="select-detail-neg-mode">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="automatico">Automático</SelectItem>
                              <SelectItem value="semi_automatico">Semi-automático</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(selectedNegotiation.negotiationMode || "semi_automatico") === "automatico"
                            ? "IA responde sozinha ao devedor no WhatsApp, dentro dos limites definidos."
                            : "IA gera rascunho no painel da Secretária. Você aprova antes de enviar."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {(selectedNegotiation.aiAnalysis || selectedNegotiation.aiRiskScore) && (
                    <Card data-testid="card-ai-analysis">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="w-4 h-4" /> Análise IA
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        {selectedNegotiation.aiRiskScore && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">Risco:</p>
                            <Badge variant="outline" className={riskColor(selectedNegotiation.aiRiskScore)} data-testid="badge-detail-risk">
                              {selectedNegotiation.aiRiskScore}/10
                            </Badge>
                          </div>
                        )}
                        {selectedNegotiation.aiAnalysis && (
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-analysis">{selectedNegotiation.aiAnalysis}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Alterar Status</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusConfig).map(([key, config]) => (
                        <Button
                          key={key}
                          size="sm"
                          variant={selectedNegotiation.status === key ? "default" : "outline"}
                          className={`text-xs ${selectedNegotiation.status === key ? "" : config.color}`}
                          onClick={() => updateMutation.mutate({ id: selectedNegotiation.id, data: { status: key } })}
                          disabled={updateMutation.isPending}
                          data-testid={`btn-status-${key}`}
                        >
                          {config.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {selectedNegotiation.notes && (
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground mb-1">Observações</p>
                        <p className="text-sm" data-testid="text-detail-notes">{selectedNegotiation.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isAgreementOpen} onOpenChange={setIsAgreementOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Termo de Composição Extrajudicial
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-white" data-testid="agreement-preview">
            <div dangerouslySetInnerHTML={{ __html: agreementHtml }} />
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                const blob = new Blob([agreementHtml], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = agreementFilename || "Termo_Acordo.html";
                a.click();
                URL.revokeObjectURL(url);
              }} data-testid="btn-download-acordo">
                <ArrowRight className="w-4 h-4 mr-1" /> Baixar HTML
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsAgreementOpen(false)}>Fechar</Button>
              <Button
                className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleSendAgreement(true, false)}
                disabled={isSendingAgreement}
                data-testid="btn-send-acordo-whatsapp"
              >
                {isSendingAgreement ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Enviar WhatsApp
              </Button>
              <Button
                className="gap-1"
                onClick={() => handleSendAgreement(true, true)}
                disabled={isSendingAgreement}
                data-testid="btn-send-acordo-both"
              >
                {isSendingAgreement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                WhatsApp + Email
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}