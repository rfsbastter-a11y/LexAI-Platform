import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Target,
  Plus,
  Trash2,
  Eye,
  Send,
  Brain,
  Users,
  Search,
  Upload,
  Star,
  Building2,
  MapPin,
  Phone,
  Mail,
  Linkedin,
  Instagram,
  Edit2,
  Loader2,
  X,
  ChevronRight,
  FileText,
  MessageSquare,
  MessageCircle,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Shield,
  Handshake,
  BarChart3,
  AlertTriangle,
  Sparkles,
  Bot,
  ArrowRight,
  Link2,
  UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";

const planStatusConfig: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-700 border-gray-200" },
  ativo: { label: "Ativo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  concluido: { label: "Concluído", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pausado: { label: "Pausado", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

const pipelineStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  identificado: { label: "Identificado", color: "bg-gray-100 text-gray-700 border-gray-200", bgColor: "bg-gray-50 border-gray-200" },
  contactado: { label: "Contactado", color: "bg-blue-100 text-blue-700 border-blue-200", bgColor: "bg-blue-50 border-blue-200" },
  em_negociacao: { label: "Em Negociação", color: "bg-yellow-100 text-yellow-700 border-yellow-200", bgColor: "bg-yellow-50 border-yellow-200" },
  proposta_enviada: { label: "Proposta Enviada", color: "bg-orange-100 text-orange-700 border-orange-200", bgColor: "bg-orange-50 border-orange-200" },
  convertido: { label: "Convertido", color: "bg-emerald-100 text-emerald-700 border-emerald-200", bgColor: "bg-emerald-50 border-emerald-200" },
  descartado: { label: "Descartado", color: "bg-red-100 text-red-700 border-red-200", bgColor: "bg-red-50 border-red-200" },
};

const pipelineOrder = ["identificado", "contactado", "em_negociacao", "proposta_enviada", "convertido", "descartado"];

const relationshipOptions = ["Cliente", "Ex-colega", "Evento", "Indicação", "Familiar", "Outro"];

const serviceTypeOptions = [
  "Consultivo",
  "Contencioso",
  "Consultivo e Contencioso",
  "Recuperação de Crédito",
  "Trabalhista",
  "Tributário",
];

export default function ProspectingPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("plans");
  const [searchFilter, setSearchFilter] = useState("");
  const [networkSearch, setNetworkSearch] = useState("");
  const [networkPlatform, setNetworkPlatform] = useState<string>("linkedin");

  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    title: "",
    thesis: "",
    sector: "",
    region: "Brasília/DF",
    serviceType: "",
    targetCompanies: "",
  });

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [leadMessages, setLeadMessages] = useState<any[]>([]);
  const [leadChainInfo, setLeadChainInfo] = useState<any>(null);
  const [isGeneratingMessages, setIsGeneratingMessages] = useState(false);

  const [isCreateContactOpen, setIsCreateContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    company: "",
    position: "",
    phone: "",
    email: "",
    linkedin: "",
    instagram: "",
    relationship: "",
    notes: "",
    tags: "",
  });

  const [thesisExtracting, setThesisExtracting] = useState(false);
  const thesisFileRef = useRef<HTMLInputElement>(null);

  const [editingContact, setEditingContact] = useState<any>(null);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);

  const [batchNamesOpen, setBatchNamesOpen] = useState(false);
  const [batchNamesText, setBatchNamesText] = useState("");
  const [batchNamesImporting, setBatchNamesImporting] = useState(false);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPlanId, setChatPlanId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: plans = [] } = useQuery<any[]>({
    queryKey: ["/api/prospection/plans"],
    queryFn: async () => {
      const res = await fetch("/api/prospection/plans", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const { data: allLeads = [] } = useQuery<any[]>({
    queryKey: ["/api/prospection/leads"],
    queryFn: async () => {
      const res = await fetch("/api/prospection/leads", { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const { data: planLeads = [] } = useQuery<any[]>({
    queryKey: ["/api/prospection/leads", selectedPlan?.id],
    queryFn: async () => {
      const res = await fetch(`/api/prospection/leads?planId=${selectedPlan.id}`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!selectedPlan?.id,
  });

  const { data: networkContacts = [] } = useQuery<any[]>({
    queryKey: ["/api/prospection/network", networkPlatform],
    queryFn: async () => {
      const res = await fetch(`/api/prospection/network?platform=${networkPlatform}`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const { data: chatMessages = [], refetch: refetchChat } = useQuery<any[]>({
    queryKey: ["/api/prospection/chat", chatPlanId],
    queryFn: async () => {
      const res = await fetch(`/api/prospection/chat/${chatPlanId}`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!chatPlanId && isChatOpen,
  });

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isSendingChat) return;
    const msg = chatInput.trim();
    setChatInput("");
    setIsSendingChat(true);
    try {
      const url = chatPlanId ? `/api/prospection/chat/${chatPlanId}` : "/api/prospection/chat";
      await apiRequest("POST", url, { message: msg });
      refetchChat();
      toast({ title: "Resposta gerada" });
    } catch {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    } finally {
      setIsSendingChat(false);
    }
  };

  const createPlanMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/prospection/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/plans"] });
      setIsCreatePlanOpen(false);
      setPlanForm({ title: "", thesis: "", sector: "", region: "Brasília/DF", serviceType: "", targetCompanies: "" });
      toast({ title: "Plano criado com sucesso" });
    },
    onError: () => { toast({ title: "Erro ao criar plano", variant: "destructive" }); },
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prospection/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/leads"] });
      toast({ title: "Plano excluído" });
    },
    onError: () => { toast({ title: "Erro ao excluir plano", variant: "destructive" }); },
  });

  const [generatingPlanId, setGeneratingPlanId] = useState<number | null>(null);
  const generatePlanMutation = useMutation({
    mutationFn: (id: number) => {
      setGeneratingPlanId(id);
      return apiRequest("POST", `/api/prospection/plans/${id}/generate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/leads"] });
      setGeneratingPlanId(null);
      toast({ title: "Leads gerados com IA com sucesso!" });
    },
    onError: () => {
      setGeneratingPlanId(null);
      toast({ title: "Erro ao gerar leads com IA", variant: "destructive" });
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/prospection/leads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/leads"] });
      toast({ title: "Lead atualizado" });
    },
    onError: () => { toast({ title: "Erro ao atualizar lead", variant: "destructive" }); },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prospection/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/leads"] });
      setSelectedLead(null);
      toast({ title: "Lead excluído" });
    },
    onError: () => { toast({ title: "Erro ao excluir lead", variant: "destructive" }); },
  });

  const createContactMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/prospection/network", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/network"] });
      setIsCreateContactOpen(false);
      setContactForm({ name: "", company: "", position: "", phone: "", email: "", linkedin: "", instagram: "", relationship: "", notes: "", tags: "" });
      toast({ title: "Contato adicionado" });
    },
    onError: () => { toast({ title: "Erro ao criar contato", variant: "destructive" }); },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/prospection/network/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/network"] });
      setIsEditContactOpen(false);
      setEditingContact(null);
      toast({ title: "Contato atualizado" });
    },
    onError: () => { toast({ title: "Erro ao atualizar contato", variant: "destructive" }); },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prospection/network/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/network"] });
      toast({ title: "Contato excluído" });
    },
    onError: () => { toast({ title: "Erro ao excluir contato", variant: "destructive" }); },
  });

  const [fileImporting, setFileImporting] = useState(false);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("platform", networkPlatform);
    try {
      const res = await fetch("/api/prospection/network/import-file", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro ao importar");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/network"] });
      toast({ title: `${data.imported || 0} contatos importados com sucesso` });
    } catch {
      toast({ title: "Erro ao importar contatos", variant: "destructive" });
    } finally {
      setFileImporting(false);
    }
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleThesisFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThesisExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1] || result;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/ai/extract-text", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (!res.ok) throw new Error("Erro ao extrair texto");
      const data = await res.json();
      const extractedText = data.text || data.analysis || "";
      if (extractedText) {
        setPlanForm(prev => ({ ...prev, thesis: extractedText }));
        toast({ title: "Tese extraída do arquivo com sucesso" });
      } else {
        toast({ title: "Não foi possível extrair texto do arquivo", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao processar arquivo", variant: "destructive" });
    } finally {
      setThesisExtracting(false);
      if (thesisFileRef.current) thesisFileRef.current.value = "";
    }
  };

  const handleBatchNamesImport = async () => {
    const names = batchNamesText.split("\n").map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      toast({ title: "Nenhum nome informado", variant: "destructive" });
      return;
    }
    setBatchNamesImporting(true);
    try {
      const res = await fetch("/api/prospection/network/batch-names", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ names, platform: networkPlatform }),
      });
      if (!res.ok) throw new Error("Erro");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/prospection/network"] });
      toast({ title: `${data.imported || 0} contatos criados com sucesso` });
      setBatchNamesOpen(false);
      setBatchNamesText("");
    } catch {
      toast({ title: "Erro ao importar contatos", variant: "destructive" });
    } finally {
      setBatchNamesImporting(false);
    }
  };

  const handleGenerateMessages = async (leadId: number) => {
    setIsGeneratingMessages(true);
    setLeadMessages([]);
    setLeadChainInfo(null);
    try {
      const res = await fetch(`/api/prospection/leads/${leadId}/generate-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao gerar mensagens");
      const data = await res.json();
      if (data.chainInfo) setLeadChainInfo(data.chainInfo);
      const messagesArray: any[] = [];
      if (data.whatsapp) messagesArray.push({ channel: "whatsapp", content: data.whatsapp });
      if (data.email) messagesArray.push({ channel: "email", content: data.email.body || data.email, subject: data.email.subject });
      if (data.linkedin) messagesArray.push({ channel: "linkedin", content: data.linkedin });
      if (data.instagram) messagesArray.push({ channel: "instagram", content: data.instagram });
      setLeadMessages(messagesArray.length > 0 ? messagesArray : (data.messages || []));
      toast({ title: "Mensagens geradas com IA" });
    } catch {
      toast({ title: "Erro ao gerar mensagens com IA", variant: "destructive" });
    } finally {
      setIsGeneratingMessages(false);
    }
  };

  const handleSendMessage = async (channel: string, content: string, subject?: string) => {
    try {
      if (channel === "whatsapp") {
        let phone: string | null = null;
        const useChainContact = (leadChainInfo?.targetRole === "intermediário" || leadChainInfo?.targetRole === "contato_direto") && leadChainInfo?.chainContactPhone;
        if (useChainContact) {
          phone = leadChainInfo.chainContactPhone;
        } else {
          phone = selectedLead?.companyPhone || (selectedLead?.decisionMakers as any)?.contacts?.[0]?.phone || (selectedLead?.decisionMakers as any)?.[0]?.phone;
        }
        if (!phone) { toast({ title: "Nenhum telefone encontrado para este contato", variant: "destructive" }); return; }
        const cleanPhone = phone.replace(/\D/g, "");
        const encodedMsg = encodeURIComponent(content);
        navigate(`/mensagens?phone=${cleanPhone}&prospecting=true&leadId=${selectedLead?.id}&message=${encodedMsg}`);
        return;
      } else if (channel === "email") {
        let email: string | null = null;
        const useChainEmail = (leadChainInfo?.targetRole === "intermediário" || leadChainInfo?.targetRole === "contato_direto") && leadChainInfo?.chainContactEmail;
        if (useChainEmail) {
          email = leadChainInfo.chainContactEmail;
        } else {
          email = selectedLead?.companyEmail || (selectedLead?.decisionMakers as any)?.contacts?.[0]?.email || (selectedLead?.decisionMakers as any)?.[0]?.email;
        }
        if (!email) { toast({ title: "Nenhum e-mail encontrado para este contato", variant: "destructive" }); return; }
        await apiRequest("POST", "/api/prospection/outreach/email", {
          to: email, subject: subject || "Proposta de serviços jurídicos", body: content, leadId: selectedLead?.id,
        });
        toast({ title: "Email enviado com sucesso" });
      } else if (channel === "linkedin") {
        const linkedinUrl = leadChainInfo?.chainContactLinkedin || (selectedLead?.decisionMakers as any)?.contacts?.[0]?.linkedin || "https://www.linkedin.com/messaging/";
        window.open(linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`, "_blank");
        await apiRequest("POST", "/api/prospection/messages", {
          leadId: selectedLead?.id, channel, content, status: "enviado",
        });
        toast({ title: "LinkedIn aberto - cole a mensagem no chat" });
      } else if (channel === "instagram") {
        const igHandle = (selectedLead?.decisionMakers as any)?.contacts?.[0]?.instagram || (selectedLead as any)?.companyInstagram;
        const igUrl = igHandle ? (igHandle.startsWith("http") ? igHandle : `https://www.instagram.com/${igHandle.replace("@", "")}/`) : "https://www.instagram.com/direct/inbox/";
        window.open(igUrl, "_blank");
        await apiRequest("POST", "/api/prospection/messages", {
          leadId: selectedLead?.id, channel, content, status: "enviado",
        });
        toast({ title: "Instagram aberto - cole a mensagem no DM" });
      } else {
        await apiRequest("POST", "/api/prospection/messages", {
          leadId: selectedLead?.id, channel, content, status: "rascunho",
        });
        toast({ title: `Mensagem salva como rascunho` });
      }
    } catch {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    }
  };

  const handleCreatePlan = () => {
    if (!planForm.title) { toast({ title: "Informe o título do plano", variant: "destructive" }); return; }
    if (!planForm.thesis) { toast({ title: "Informe a tese do plano", variant: "destructive" }); return; }
    createPlanMutation.mutate(planForm);
  };

  const handleCreateContact = () => {
    if (!contactForm.name) { toast({ title: "Informe o nome do contato", variant: "destructive" }); return; }
    const data: any = { ...contactForm };
    if (data.tags) {
      data.tags = data.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    } else {
      data.tags = [];
    }
    data.platform = networkPlatform;
    createContactMutation.mutate(data);
  };

  const handleUpdateContact = () => {
    if (!editingContact) return;
    const data: any = { ...editingContact };
    if (typeof data.tags === "string") {
      data.tags = data.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    }
    delete data.id;
    delete data.userId;
    delete data.createdAt;
    delete data.updatedAt;
    updateContactMutation.mutate({ id: editingContact.id, data });
  };

  const totalPlans = plans.length;
  const activePlans = plans.filter((p: any) => p.status === "ativo").length;
  const totalLeads = allLeads.length;
  const convertedLeads = allLeads.filter((l: any) => l.pipelineStatus === "convertido").length;

  const filteredPlans = useMemo(() => {
    if (!searchFilter) return plans;
    const q = searchFilter.toLowerCase();
    return plans.filter((p: any) =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.thesis || "").toLowerCase().includes(q) ||
      (p.sector || "").toLowerCase().includes(q)
    );
  }, [plans, searchFilter]);

  const filteredContacts = useMemo(() => {
    if (!networkSearch) return networkContacts;
    const q = networkSearch.toLowerCase();
    return networkContacts.filter((c: any) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.position || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  }, [networkContacts, networkSearch]);

  const groupedLeads = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const status of pipelineOrder) {
      groups[status] = [];
    }
    for (const lead of planLeads) {
      const status = lead.pipelineStatus || "identificado";
      if (groups[status]) {
        groups[status].push(lead);
      } else {
        groups["identificado"].push(lead);
      }
    }
    return groups;
  }, [planLeads]);

  const renderStars = (priority: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`w-3 h-3 ${i < priority ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
    ));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3" data-testid="page-title">
            <Target className="w-8 h-8 text-amber-500" />
            Prospecção Inteligente
          </h1>
          <p className="text-muted-foreground mt-1">Desenvolvimento de negócios com IA</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="main-tabs">
            <TabsTrigger value="plans" data-testid="tab-plans">
              <Target className="w-4 h-4 mr-2" />
              Planos de Prospecção
            </TabsTrigger>
            <TabsTrigger value="network" data-testid="tab-network">
              <Users className="w-4 h-4 mr-2" />
              Rede de Contatos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="kpi-total-plans">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total de Planos</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalPlans}</div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-active-plans">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Planos Ativos</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">{activePlans}</div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-total-leads">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total de Leads</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalLeads}</div>
                </CardContent>
              </Card>
              <Card data-testid="kpi-converted-leads">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Leads Convertidos</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">{convertedLeads}</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Dialog open={isCreatePlanOpen} onOpenChange={setIsCreatePlanOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-new-plan">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Plano
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Novo Plano de Prospecção</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="plan-title">Título *</Label>
                      <Input
                        id="plan-title"
                        data-testid="input-plan-title"
                        value={planForm.title}
                        onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                        placeholder="Nome do plano de prospecção"
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan-thesis">Tese *</Label>
                      <Textarea
                        id="plan-thesis"
                        data-testid="input-plan-thesis"
                        value={planForm.thesis}
                        onChange={(e) => setPlanForm({ ...planForm, thesis: e.target.value })}
                        placeholder="Ex: Recuperação de crédito para empresas do agronegócio no DF"
                        rows={3}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => thesisFileRef.current?.click()}
                          disabled={thesisExtracting}
                          data-testid="button-upload-thesis"
                        >
                          {thesisExtracting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                          {thesisExtracting ? "Extraindo..." : "Importar de arquivo"}
                        </Button>
                        <span className="text-xs text-muted-foreground">PDF, Word ou TXT</span>
                        <input
                          ref={thesisFileRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          className="hidden"
                          onChange={handleThesisFileUpload}
                          data-testid="input-thesis-file"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="plan-sector">Setor</Label>
                      <Input
                        id="plan-sector"
                        data-testid="input-plan-sector"
                        value={planForm.sector}
                        onChange={(e) => setPlanForm({ ...planForm, sector: e.target.value })}
                        placeholder="Ex: Agronegócio, Tecnologia, Saúde"
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan-region">Região</Label>
                      <Input
                        id="plan-region"
                        data-testid="input-plan-region"
                        value={planForm.region}
                        onChange={(e) => setPlanForm({ ...planForm, region: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="plan-service-type">Tipo de Serviço</Label>
                      <Select
                        value={planForm.serviceType}
                        onValueChange={(v) => setPlanForm({ ...planForm, serviceType: v })}
                      >
                        <SelectTrigger data-testid="select-plan-service-type">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceTypeOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="plan-target-companies">Empresas já mapeadas (opcional)</Label>
                      <Textarea
                        id="plan-target-companies"
                        data-testid="input-plan-target-companies"
                        value={planForm.targetCompanies}
                        onChange={(e) => setPlanForm({ ...planForm, targetCompanies: e.target.value })}
                        placeholder={"Informe empresas que deseja incluir no plano, uma por linha.\nEx:\nPetrobras\nVale S.A.\nJBS"}
                        rows={3}
                      />
                      <span className="text-xs text-muted-foreground">A IA priorizará essas empresas na pesquisa e geração de leads.</span>
                    </div>
                    <Button
                      className="w-full"
                      data-testid="button-submit-plan"
                      onClick={handleCreatePlan}
                      disabled={createPlanMutation.isPending}
                    >
                      {createPlanMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                      Criar Plano
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-plans"
                  placeholder="Buscar planos..."
                  className="pl-9"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4">
              {filteredPlans.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Target className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">Nenhum plano encontrado</p>
                    <p className="text-sm">Crie seu primeiro plano de prospecção</p>
                  </CardContent>
                </Card>
              )}
              {filteredPlans.map((plan: any) => {
                const statusCfg = planStatusConfig[plan.status] || planStatusConfig.rascunho;
                const planLeadCount = allLeads.filter((l: any) => l.planId === plan.id).length;
                return (
                  <Card key={plan.id} data-testid={`card-plan-${plan.id}`} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold" data-testid={`text-plan-title-${plan.id}`}>{plan.title}</h3>
                            <Badge className={`${statusCfg.color} border text-xs`} data-testid={`badge-plan-status-${plan.id}`}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                          {plan.thesis && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{plan.thesis}</p>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {plan.sector && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {plan.sector}
                              </span>
                            )}
                            {plan.region && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {plan.region}
                              </span>
                            )}
                            {plan.serviceType && (
                              <Badge variant="outline" className="text-xs">{plan.serviceType}</Badge>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> {planLeadCount} leads
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-generate-${plan.id}`}
                            onClick={() => generatePlanMutation.mutate(plan.id)}
                            disabled={generatingPlanId === plan.id}
                          >
                            {generatingPlanId === plan.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Brain className="w-4 h-4 mr-1" />
                            )}
                            Gerar com IA
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-chat-${plan.id}`}
                            onClick={() => { setChatPlanId(plan.id); setIsChatOpen(true); }}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                          >
                            <Bot className="w-4 h-4 mr-1" />
                            Consultor IA
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-view-leads-${plan.id}`}
                            onClick={() => { setSelectedPlan(plan); setSelectedLead(null); setLeadMessages([]); setLeadChainInfo(null); }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Ver Leads
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-plan-${plan.id}`}
                            onClick={() => deletePlanMutation.mutate(plan.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            <Tabs value={networkPlatform} onValueChange={setNetworkPlatform}>
              <TabsList className="mb-4">
                <TabsTrigger value="linkedin" className="gap-2">
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </TabsTrigger>
                <TabsTrigger value="instagram" className="gap-2">
                  <Instagram className="w-4 h-4" />
                  Instagram
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="gap-2">
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </TabsTrigger>
              </TabsList>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Dialog open={isCreateContactOpen} onOpenChange={setIsCreateContactOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-new-contact">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Contato
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Novo Contato</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="contact-name">Nome *</Label>
                      <Input id="contact-name" data-testid="input-contact-name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-company">Empresa</Label>
                        <Input id="contact-company" data-testid="input-contact-company" value={contactForm.company} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="contact-position">Cargo</Label>
                        <Input id="contact-position" data-testid="input-contact-position" value={contactForm.position} onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-phone">Telefone</Label>
                        <Input id="contact-phone" data-testid="input-contact-phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="contact-email">Email</Label>
                        <Input id="contact-email" data-testid="input-contact-email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="contact-linkedin">LinkedIn</Label>
                        <Input id="contact-linkedin" data-testid="input-contact-linkedin" value={contactForm.linkedin} onChange={(e) => setContactForm({ ...contactForm, linkedin: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="contact-instagram">Instagram</Label>
                        <Input id="contact-instagram" data-testid="input-contact-instagram" value={contactForm.instagram} onChange={(e) => setContactForm({ ...contactForm, instagram: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="contact-relationship">Como conhece</Label>
                      <Select value={contactForm.relationship} onValueChange={(v) => setContactForm({ ...contactForm, relationship: v })}>
                        <SelectTrigger data-testid="select-contact-relationship">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {relationshipOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="contact-notes">Observações</Label>
                      <Textarea id="contact-notes" data-testid="input-contact-notes" value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} rows={2} />
                    </div>
                    <div>
                      <Label htmlFor="contact-tags">Tags (separadas por vírgula)</Label>
                      <Input id="contact-tags" data-testid="input-contact-tags" value={contactForm.tags} onChange={(e) => setContactForm({ ...contactForm, tags: e.target.value })} placeholder="ex: vip, parceiro, indicação" />
                    </div>
                    <Button className="w-full" data-testid="button-submit-contact" onClick={handleCreateContact} disabled={createContactMutation.isPending}>
                      {createContactMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                      Adicionar Contato
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" data-testid="button-import-csv" onClick={() => csvInputRef.current?.click()} disabled={fileImporting}>
                {fileImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {fileImporting ? "Processando..." : "Importar Contatos"}
              </Button>
              <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileImport} data-testid="input-file-import" />

              <Button variant="outline" data-testid="button-batch-names" onClick={() => setBatchNamesOpen(true)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Digitar Nomes
              </Button>

              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-contacts"
                  placeholder="Buscar contatos..."
                  className="pl-9"
                  value={networkSearch}
                  onChange={(e) => setNetworkSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredContacts.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">Nenhum contato encontrado</p>
                    <p className="text-sm">Adicione ou importe seus contatos profissionais</p>
                  </CardContent>
                </Card>
              )}
              {filteredContacts.map((contact: any) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm" data-testid={`text-contact-name-${contact.id}`}>{contact.name}</h4>
                          {contact.position && <p className="text-xs text-muted-foreground">{contact.position}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          data-testid={`button-edit-contact-${contact.id}`}
                          onClick={() => {
                            setEditingContact({
                              ...contact,
                              tags: Array.isArray(contact.tags) ? contact.tags.join(", ") : (contact.tags || ""),
                            });
                            setIsEditContactOpen(true);
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-700"
                          data-testid={`button-delete-contact-${contact.id}`}
                          onClick={() => deleteContactMutation.mutate(contact.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {contact.company && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="w-3 h-3" /> {contact.company}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {contact.phone && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="w-3 h-3" /> {contact.phone}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" /> {contact.email}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.linkedin && (
                        <a href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`} target="_blank" rel="noopener noreferrer" data-testid={`link-linkedin-${contact.id}`}>
                          <Linkedin className="w-4 h-4 text-blue-600 hover:text-blue-800" />
                        </a>
                      )}
                      {contact.instagram && (
                        <a href={contact.instagram.startsWith("http") ? contact.instagram : `https://instagram.com/${contact.instagram}`} target="_blank" rel="noopener noreferrer" data-testid={`link-instagram-${contact.id}`}>
                          <Instagram className="w-4 h-4 text-pink-500 hover:text-pink-700" />
                        </a>
                      )}
                      {contact.relationship && (
                        <Badge variant="outline" className="text-xs ml-auto" data-testid={`badge-relationship-${contact.id}`}>
                          {contact.relationship}
                        </Badge>
                      )}
                    </div>
                    {contact.tags && (Array.isArray(contact.tags) ? contact.tags : []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(contact.tags) ? contact.tags : []).map((tag: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={!!selectedPlan && !selectedLead} onOpenChange={(open) => { if (!open) setSelectedPlan(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-500" />
              {selectedPlan?.title} — Leads
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {planLeads.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>Nenhum lead ainda. Clique em "Gerar com IA" para criar leads.</p>
              </div>
            )}
            {pipelineOrder.map((status) => {
              const leads = groupedLeads[status] || [];
              if (leads.length === 0) return null;
              const cfg = pipelineStatusConfig[status];
              return (
                <div key={status} className="space-y-2">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cfg.bgColor}`}>
                    <Badge className={`${cfg.color} border text-xs`}>{cfg.label}</Badge>
                    <span className="text-xs text-muted-foreground">({leads.length})</span>
                  </div>
                  <div className="space-y-2 pl-2">
                    {leads.map((lead: any) => (
                      <Card
                        key={lead.id}
                        data-testid={`card-lead-${lead.id}`}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => { setSelectedLead(lead); setLeadMessages([]); setLeadChainInfo(null); }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm" data-testid={`text-lead-company-${lead.id}`}>
                                  {lead.companyName || lead.company || "Empresa"}
                                </h4>
                                {lead.compatibilityScore != null && (
                                  <Badge className={`text-[10px] px-1.5 border ${lead.compatibilityScore >= 80 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : lead.compatibilityScore >= 60 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                    {lead.compatibilityScore}%
                                  </Badge>
                                )}
                                {lead.networkPath && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-[10px] px-1.5">
                                    via rede
                                  </Badge>
                                )}
                                {lead.partnerFirms && Array.isArray(lead.partnerFirms) && lead.partnerFirms.length > 0 && (
                                  <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 border text-[10px] px-1.5">
                                    <Handshake className="w-2.5 h-2.5 mr-0.5" />{lead.partnerFirms.length}
                                  </Badge>
                                )}
                                {lead.competitors && Array.isArray(lead.competitors) && lead.competitors.length > 0 && (
                                  <Badge className="bg-red-50 text-red-600 border-red-200 border text-[10px] px-1.5">
                                    <Shield className="w-2.5 h-2.5 mr-0.5" />{lead.competitors.length}
                                  </Badge>
                                )}
                              </div>
                              {lead.companySector && (
                                <p className="text-xs text-muted-foreground">{lead.companySector}</p>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="flex">{renderStars(lead.priority || 0)}</div>
                              </div>
                              {lead.decisionMakers && (() => {
                                const dms = lead.decisionMakers;
                                const contacts = Array.isArray(dms) ? dms : (dms?.contacts ? dms.contacts : []);
                                if (!contacts.length) return null;
                                const firstDisc = contacts[0]?.discProfile;
                                const hasNetworkDM = contacts.some((dm: any) => dm?.inNetworkContact || dm?.confirmedContact);
                                const discBadgeColors: Record<string, string> = {
                                  D: "bg-red-100 text-red-700",
                                  I: "bg-yellow-100 text-yellow-700",
                                  S: "bg-green-100 text-green-700",
                                  C: "bg-blue-100 text-blue-700",
                                };
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {hasNetworkDM && (
                                      <Badge className="bg-violet-100 text-violet-700 border-violet-300 border text-[9px] px-1.5 py-0.5 font-semibold" data-testid={`badge-in-network-${lead.id}`}>
                                        <UserCheck className="w-2.5 h-2.5 mr-0.5" />Na sua rede!
                                      </Badge>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      <User className="w-3 h-3 inline mr-1" />
                                      {contacts.slice(0, 2).map((dm: any) => typeof dm === "string" ? dm : dm.name).join(", ")}
                                      {contacts.length > 2 && ` +${contacts.length - 2}`}
                                    </p>
                                    {firstDisc?.primary && (
                                      <Badge className={`text-[9px] px-1 py-0 ${discBadgeColors[firstDisc.primary] || "bg-gray-100 text-gray-600"}`}>
                                        {firstDisc.primary}{firstDisc.secondary ? `/${firstDisc.secondary}` : ''}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Select
                                value={lead.pipelineStatus || "identificado"}
                                onValueChange={(v) => updateLeadMutation.mutate({ id: lead.id, data: { pipelineStatus: v } })}
                              >
                                <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-lead-status-${lead.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {pipelineOrder.map((s) => (
                                    <SelectItem key={s} value={s}>{pipelineStatusConfig[s].label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <ChevronRight className="w-4 h-4 text-muted-foreground mx-auto" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedLead} onOpenChange={(open) => { if (!open) setSelectedLead(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-5 h-5 text-blue-500" />
              {selectedLead?.companyName || selectedLead?.company || "Lead"}
              {selectedLead?.compatibilityScore != null && (
                <Badge className={`ml-2 text-xs ${selectedLead.compatibilityScore >= 80 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : selectedLead.compatibilityScore >= 60 ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-gray-100 text-gray-700 border-gray-200'} border`}>
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Score: {selectedLead.compatibilityScore}/100
                </Badge>
              )}
              {selectedLead && (() => {
                const dms = selectedLead.decisionMakers;
                const contacts = Array.isArray(dms) ? dms : (dms?.contacts || []);
                const hasNetworkDM = contacts.some((dm: any) => dm?.inNetworkContact || dm?.confirmedContact);
                if (!hasNetworkDM) return null;
                return (
                  <Badge className="bg-violet-600 text-white border-violet-700 border text-xs px-2 py-0.5 font-bold animate-pulse" data-testid="badge-lead-network-header">
                    <UserCheck className="w-3.5 h-3.5 mr-1" />Você conhece o decisor!
                  </Badge>
                );
              })()}
            </SheetTitle>
          </SheetHeader>
          {selectedLead && (
            <div className="mt-6 space-y-4">
              {selectedLead.compatibilityScore != null && (
                <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${selectedLead.compatibilityScore >= 80 ? 'bg-emerald-500' : selectedLead.compatibilityScore >= 60 ? 'bg-yellow-500' : 'bg-gray-400'}`} style={{ width: `${selectedLead.compatibilityScore}%` }} />
                </div>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Informações da Empresa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {selectedLead.companySector && <p><strong>Setor:</strong> {selectedLead.companySector}</p>}
                  {selectedLead.companyLocation && <p><strong>Região:</strong> {selectedLead.companyLocation}</p>}
                  {selectedLead.companySize && <p><strong>Porte:</strong> {selectedLead.companySize}</p>}
                  {selectedLead.companyWebsite && <p><strong>Website:</strong> <a href={selectedLead.companyWebsite.startsWith("http") ? selectedLead.companyWebsite : `https://${selectedLead.companyWebsite}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{selectedLead.companyWebsite}</a></p>}
                  <div className="flex items-center gap-1">
                    <strong>Prioridade:</strong> <div className="flex ml-1">{renderStars(selectedLead.priority || 0)}</div>
                  </div>
                  {selectedLead.networkPath && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                      <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Caminho na Rede
                      </p>
                      <p className="text-xs text-amber-600 mt-1">{selectedLead.networkPath}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedLead.companyProfile && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" /> Perfil da Empresa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedLead.companyProfile}
                  </CardContent>
                </Card>
              )}

              {selectedLead.painPoints && Array.isArray(selectedLead.painPoints) && selectedLead.painPoints.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" /> Pontos de Dor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {selectedLead.painPoints.map((pp: any, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-orange-500 mt-0.5">•</span>
                          <span>{typeof pp === "string" ? pp : JSON.stringify(pp)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {selectedLead.decisionMakers && (() => {
                const raw = selectedLead.decisionMakers;
                const contacts: any[] = Array.isArray(raw) ? raw : (raw?.contacts || []);
                const connectionPaths: any[] = Array.isArray(raw) ? [] : (raw?.connectionPaths || []);
                if (!contacts.length && !connectionPaths.length) return null;

                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="w-4 h-4" /> Decisores
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3">
                      {contacts.map((dm: any, i: number) => {
                        const disc = dm.discProfile;
                        const discColors: Record<string, string> = {
                          D: "bg-red-100 text-red-700 border-red-300",
                          I: "bg-yellow-100 text-yellow-700 border-yellow-300",
                          S: "bg-green-100 text-green-700 border-green-300",
                          C: "bg-blue-100 text-blue-700 border-blue-300",
                        };
                        const discLabels: Record<string, string> = {
                          D: "Dominância",
                          I: "Influência",
                          S: "Estabilidade",
                          C: "Conformidade",
                        };
                        return (
                        <div key={i} className={`border rounded-lg p-3 space-y-1.5 ${(dm.inNetworkContact || dm.confirmedContact) ? 'border-violet-300 bg-violet-50/40' : ''}`}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{dm.name || "N/A"}</p>
                              {(dm.inNetworkContact || dm.confirmedContact) && (
                                <Badge className="bg-violet-100 text-violet-700 border-violet-300 border text-[10px] px-1.5 font-semibold" data-testid={`badge-dm-in-network-${i}`} title="Você já conhece esta pessoa!">
                                  <UserCheck className="w-3 h-3 mr-0.5" />Na sua rede!
                                </Badge>
                              )}
                            </div>
                            {disc?.primary && (
                              <Badge className={`text-[10px] border ${discColors[disc.primary] || "bg-gray-100 text-gray-700"}`} data-testid={`badge-disc-${i}`}>
                                DISC: {disc.primary}{disc.secondary ? `/${disc.secondary}` : ''} — {disc.label || discLabels[disc.primary] || disc.primary}
                              </Badge>
                            )}
                          </div>
                          {dm.position && <p className="text-xs text-muted-foreground">{dm.position}</p>}
                          {disc && (() => {
                            const discBg: Record<string, string> = {
                              D: "bg-red-50 border-red-200",
                              I: "bg-yellow-50 border-yellow-200",
                              S: "bg-green-50 border-green-200",
                              C: "bg-blue-50 border-blue-200",
                            };
                            return (
                            <div className={`rounded-lg p-2.5 border text-[11px] space-y-1 ${discBg[disc.primary] || "bg-gray-50 border-gray-200"}`}>
                              <p className="font-semibold flex items-center gap-1">
                                <Target className="w-3 h-3" /> Perfil Comportamental DISC
                              </p>
                              {disc.justification && <p className="opacity-80">{disc.justification}</p>}
                              {disc.approachTips && (
                                <p className="font-medium mt-1">
                                  <strong>Como abordar:</strong> {disc.approachTips}
                                </p>
                              )}
                            </div>
                            );
                          })()}
                          {dm.background && <p className="text-xs text-muted-foreground"><strong>Histórico:</strong> {dm.background}</p>}
                          {dm.interests && <p className="text-xs text-muted-foreground"><strong>Interesses:</strong> {dm.interests}</p>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {dm.bestChannel && <Badge variant="outline" className="text-[10px]">{dm.bestChannel}</Badge>}
                            {dm.communicationTone && <Badge variant="secondary" className="text-[10px]">{dm.communicationTone}</Badge>}
                          </div>
                          <div className="flex gap-2 mt-1">
                            {dm.linkedin && <a href={dm.linkedin.startsWith("http") ? dm.linkedin : `https://${dm.linkedin}`} target="_blank" rel="noopener noreferrer"><Linkedin className="w-3.5 h-3.5 text-blue-600" /></a>}
                            {dm.email && <a href={`mailto:${dm.email}`}><Mail className="w-3.5 h-3.5 text-gray-500" /></a>}
                          </div>
                        </div>
                        );
                      })}

                      {connectionPaths && connectionPaths.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                            <Link2 className="w-3.5 h-3.5" /> Caminhos de Conexão
                          </p>
                          <div className="space-y-2">
                            {connectionPaths.map((cp: any, i: number) => {
                              if (cp.type === "sem_conexao") {
                                return (
                                  <div key={i} className="border border-orange-200 bg-orange-50 rounded-lg p-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                                      <span className="text-xs font-semibold text-orange-700">Sem conexão na rede</span>
                                    </div>
                                    {cp.actionPlan && <p className="text-[11px] text-orange-600">{cp.actionPlan}</p>}
                                  </div>
                                );
                              }
                              const confidenceColor = cp.confidence === "alta" ? "text-green-600 bg-green-50 border-green-200" :
                                cp.confidence === "média" ? "text-amber-600 bg-amber-50 border-amber-200" :
                                "text-gray-600 bg-gray-50 border-gray-200";
                              const typeLabel = cp.type === "direto" ? "Conexão Direta" : cp.type === "2_graus" ? "2 Graus de Separação" : "3 Graus de Separação";
                              const pathParts = cp.path ? cp.path.split("→").map((s: string) => s.trim()) : [];
                              return (
                                <div key={i} className={`border rounded-lg p-2.5 ${confidenceColor}`}>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Badge variant="outline" className={`text-[10px] ${confidenceColor}`}>{typeLabel}</Badge>
                                    <Badge variant="outline" className={`text-[10px] ${confidenceColor}`}>
                                      {cp.confidence === "alta" ? "Alta Confiança" : cp.confidence === "média" ? "Média Confiança" : "Baixa Confiança"}
                                    </Badge>
                                  </div>
                                  {pathParts.length > 0 && (
                                    <div className="flex items-center flex-wrap gap-1 mb-1.5">
                                      {pathParts.map((part: string, pi: number) => (
                                        <span key={pi} className="flex items-center gap-1">
                                          <span className="text-xs font-medium bg-white/80 px-1.5 py-0.5 rounded border">{part}</span>
                                          {pi < pathParts.length - 1 && <ArrowRight className="w-3 h-3 opacity-60" />}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {cp.networkContactName && (
                                    <p className="text-[10px] opacity-75 mb-1">via {cp.networkContactName}</p>
                                  )}
                                  {cp.actionPlan && <p className="text-[11px] mt-1 opacity-80">{cp.actionPlan}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {selectedLead.competitors && Array.isArray(selectedLead.competitors) && selectedLead.competitors.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-red-500" /> Concorrentes Mapeados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedLead.competitors.map((c: any, i: number) => (
                        <div key={i} className="border border-red-100 bg-red-50/50 rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{c.name || "N/A"}</p>
                            <Badge className="bg-red-100 text-red-700 border-red-200 border text-[10px]">
                              {c.type === "concorrente_direto" ? "Concorrente Direto" : "Concorrente"}
                            </Badge>
                          </div>
                          {c.area && <p className="text-xs text-muted-foreground">Área: {c.area}</p>}
                          {c.strategy && <p className="text-xs text-muted-foreground">Estratégia: {c.strategy}</p>}
                          {c.networkConnection && (
                            <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                              <p className="text-[10px] text-amber-700"><Users className="w-3 h-3 inline mr-1" />{c.networkConnection.path}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {selectedLead.competitorStrategy && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Estratégia vs Concorrência</p>
                        <p className="text-xs text-blue-600">{selectedLead.competitorStrategy}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedLead.partnerFirms && Array.isArray(selectedLead.partnerFirms) && selectedLead.partnerFirms.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Handshake className="w-4 h-4 text-emerald-500" /> Parceiros Potenciais
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedLead.partnerFirms.map((p: any, i: number) => (
                        <div key={i} className="border border-emerald-100 bg-emerald-50/50 rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{p.name || "N/A"}</p>
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px]">
                              Parceiro Potencial
                            </Badge>
                          </div>
                          {p.area && <p className="text-xs text-muted-foreground">Área: {p.area}</p>}
                          {p.synergy && <p className="text-xs text-muted-foreground"><strong>Sinergia:</strong> {p.synergy}</p>}
                          {p.partnerProposal && <p className="text-xs text-muted-foreground"><strong>Proposta:</strong> {p.partnerProposal}</p>}
                          {p.networkConnection && (
                            <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                              <p className="text-[10px] text-amber-700"><Users className="w-3 h-3 inline mr-1" />{p.networkConnection.path}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {selectedLead.partnerProposal && (
                      <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <p className="text-xs font-semibold text-emerald-700 mb-1">Proposta de Parceria</p>
                        <p className="text-xs text-emerald-600 whitespace-pre-wrap">{selectedLead.partnerProposal}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedLead.aiStrategy && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" /> Estratégia IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedLead.aiStrategy}
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Mensagens de Abordagem
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-generate-messages-${selectedLead.id}`}
                    onClick={() => handleGenerateMessages(selectedLead.id)}
                    disabled={isGeneratingMessages}
                  >
                    {isGeneratingMessages ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Brain className="w-4 h-4 mr-1" />
                    )}
                    Gerar Mensagens
                  </Button>
                </div>

                {leadChainInfo && (
                  <div className={`p-3 rounded-lg border text-xs ${leadChainInfo.targetRole === "intermediário" ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800" : "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-semibold">
                        {leadChainInfo.targetRole === "intermediário"
                          ? `Mensagens para: ${leadChainInfo.targetName} (intermediário)`
                          : leadChainInfo.targetRole === "contato_direto"
                            ? `Mensagens para: ${leadChainInfo.targetName} (contato direto)`
                            : `Mensagens para: ${leadChainInfo.targetName} (decisor)`}
                      </span>
                    </div>
                    {leadChainInfo.targetRole === "intermediário" && (
                      <p className="text-muted-foreground">
                        Pedindo introdução ao decisor <strong>{leadChainInfo.decisionMakerName}</strong> na {selectedLead.companyName}
                      </p>
                    )}
                    {leadChainInfo.targetRole === "contato_direto" && (
                      <p className="text-muted-foreground">
                        Contato direto na <strong>{selectedLead.companyName}</strong> - abordagem direta de negócios
                      </p>
                    )}
                    {leadChainInfo.networkPath && (
                      <p className="text-muted-foreground mt-1">Caminho: {leadChainInfo.networkPath}</p>
                    )}
                  </div>
                )}

                {leadMessages.length > 0 && (
                  <div className="space-y-3">
                    {leadMessages.map((msg: any, i: number) => (
                      <Card key={i} data-testid={`card-message-${i}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs capitalize">
                              {msg.channel || msg.type || "geral"}
                            </Badge>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                data-testid={`button-send-message-${i}`}
                                onClick={() => handleSendMessage(msg.channel || msg.type || "geral", msg.content || msg.message || msg.body || msg.text || "", msg.subject)}
                              >
                                <Send className="w-3 h-3 mr-1" /> Enviar
                              </Button>
                            </div>
                          </div>
                          {msg.subject && <p className="text-xs font-semibold">{msg.subject}</p>}
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {msg.content || msg.message || msg.text || ""}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700"
                  data-testid={`button-delete-lead-${selectedLead.id}`}
                  onClick={() => deleteLeadMutation.mutate(selectedLead.id)}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Excluir Lead
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-back-to-leads"
                  onClick={() => setSelectedLead(null)}
                >
                  Voltar para Lista
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isChatOpen} onOpenChange={(open) => { if (!open) { setIsChatOpen(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              Consultor de Prospecção IA
              {chatPlanId && plans.find((p: any) => p.id === chatPlanId) && (
                <Badge variant="outline" className="text-xs ml-2">
                  {plans.find((p: any) => p.id === chatPlanId)?.title}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[55vh] p-2">
            {chatMessages.length === 0 && !isSendingChat && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Sparkles className="w-10 h-10 mb-3 text-purple-300" />
                <p className="text-sm font-medium">Pergunte ao Consultor IA</p>
                <p className="text-xs text-center mt-1 max-w-sm">Peça insights sobre o plano, análise de empresas, estratégias de abordagem, mapeamento de concorrência, ou qualquer dúvida sobre prospecção.</p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {["Analise os pontos fortes deste plano", "Sugira novas empresas-alvo", "Quais escritórios são parceiros potenciais?", "Gere uma abordagem diferente para o lead principal"].map((suggestion, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => { setChatInput(suggestion); }} data-testid={`chat-suggestion-${i}`}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg: any) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === "assistant" ? <Bot className="w-3.5 h-3.5 text-purple-500" /> : <User className="w-3.5 h-3.5" />}
                    <span className="text-[10px] opacity-70">
                      {msg.role === "assistant" ? "Consultor IA" : "Você"} • {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {isSendingChat && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                  <span className="text-sm text-muted-foreground">Analisando...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input
              data-testid="input-chat-message"
              placeholder="Pergunte sobre o plano, leads, concorrência, parcerias..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
              disabled={isSendingChat}
            />
            <Button
              data-testid="button-send-chat"
              onClick={handleSendChatMessage}
              disabled={isSendingChat || !chatInput.trim()}
            >
              {isSendingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={batchNamesOpen} onOpenChange={setBatchNamesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Contatos por Nome</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Digite ou cole os nomes dos contatos, um por linha. Você pode incluir informações adicionais separadas por vírgula (nome, empresa, cargo, telefone, email).
            </p>
            <Textarea
              value={batchNamesText}
              onChange={(e) => setBatchNamesText(e.target.value)}
              placeholder={"João da Silva\nMaria Santos, Empresa X, Diretora\nPedro Oliveira, Tech Corp, CEO, 61999998888, pedro@email.com"}
              rows={10}
              className="font-mono text-sm"
              data-testid="textarea-batch-names"
            />
            <div className="text-xs text-muted-foreground">
              {batchNamesText.split("\n").filter(n => n.trim()).length} contato(s) detectado(s)
            </div>
            <Button
              className="w-full"
              onClick={handleBatchNamesImport}
              disabled={batchNamesImporting || batchNamesText.trim().length === 0}
              data-testid="button-submit-batch-names"
            >
              {batchNamesImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {batchNamesImporting ? "Importando..." : "Importar Contatos"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>
          {editingContact && (
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input data-testid="input-edit-contact-name" value={editingContact.name || ""} onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Empresa</Label>
                  <Input data-testid="input-edit-contact-company" value={editingContact.company || ""} onChange={(e) => setEditingContact({ ...editingContact, company: e.target.value })} />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input data-testid="input-edit-contact-position" value={editingContact.position || ""} onChange={(e) => setEditingContact({ ...editingContact, position: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefone</Label>
                  <Input data-testid="input-edit-contact-phone" value={editingContact.phone || ""} onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input data-testid="input-edit-contact-email" type="email" value={editingContact.email || ""} onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>LinkedIn</Label>
                  <Input data-testid="input-edit-contact-linkedin" value={editingContact.linkedin || ""} onChange={(e) => setEditingContact({ ...editingContact, linkedin: e.target.value })} />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input data-testid="input-edit-contact-instagram" value={editingContact.instagram || ""} onChange={(e) => setEditingContact({ ...editingContact, instagram: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Como conhece</Label>
                <Select value={editingContact.relationship || ""} onValueChange={(v) => setEditingContact({ ...editingContact, relationship: v })}>
                  <SelectTrigger data-testid="select-edit-contact-relationship">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea data-testid="input-edit-contact-notes" value={editingContact.notes || ""} onChange={(e) => setEditingContact({ ...editingContact, notes: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Tags (separadas por vírgula)</Label>
                <Input data-testid="input-edit-contact-tags" value={editingContact.tags || ""} onChange={(e) => setEditingContact({ ...editingContact, tags: e.target.value })} />
              </div>
              <Button className="w-full" data-testid="button-update-contact" onClick={handleUpdateContact} disabled={updateContactMutation.isPending}>
                {updateContactMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit2 className="w-4 h-4 mr-2" />}
                Salvar Alterações
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}