import { getAuthHeaders } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useClients, useClient, useClientContracts, useClientCases, useClientInvoices, useClientDeadlines, useCreateClient, useUpdateClient, useDeleteClient } from "@/hooks/use-clients";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCreateContract } from "@/hooks/use-contracts";
import { useCreateCase } from "@/hooks/use-cases";
import { useRoute, useLocation } from "wouter";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Plus, ArrowLeft, Building2, User, FileText, Scale,
  DollarSign, Bell, Brain, Briefcase, Clock, Loader2, Mail,
  Phone, MapPin, Upload, CheckCircle2, AlertTriangle, Pen,
  BarChart3, MessageCircle, Download, TrendingUp, TrendingDown,
  Target, Shield, Zap, Trash2, Handshake, Users, CheckSquare, Square,
  ClipboardList, FileSpreadsheet
} from "lucide-react";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('pt-BR');

function ClientListView() {
  const [isAdding, setIsAdding] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "upload" | "extracting" | "form">("choose");
  const [searchTerm, setSearchTerm] = useState("");
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    type: "PJ",
    name: "",
    document: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [isExtracted, setIsExtracted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: clients, isLoading } = useClients();
  const createClient = useCreateClient();
  const deleteClient = useDeleteClient();
  const queryClient = useQueryClient();
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const CLIENT_PRIORITY_ORDER = ["mobilar", "município", "municipio", "dominium"];

  const filteredClients = (clients?.filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.document.includes(searchTerm)
  ) || []).sort((a: any, b: any) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aIdx = CLIENT_PRIORITY_ORDER.findIndex(p => aName.includes(p));
    const bIdx = CLIENT_PRIORITY_ORDER.findIndex(p => bName.includes(p));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return aName.localeCompare(bName, "pt-BR");
  });

  const toggleSelectClient = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedClientIds.size === filteredClients.length) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(filteredClients.map((c: any) => c.id)));
    }
  };

  const handleBatchDelete = async () => {
    setIsBatchDeleting(true);
    try {
      const res = await fetch("/api/clients/batch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ clientIds: Array.from(selectedClientIds) }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        setSelectedClientIds(new Set());
        setShowBatchDeleteConfirm(false);
      }
    } catch (err) {
      console.error("Batch delete error:", err);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const [extractError, setExtractError] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractError(false);
    setAddStep("extracting");
    try {
      let text = "";
      const isTextFile = file.name.match(/\.(txt|csv|text)$/i);
      if (isTextFile) {
        text = await file.text();
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), b => String.fromCharCode(b)).join(''));
        const extractRes = await fetch("/api/ai/extract-text", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
        });
        if (extractRes.ok) {
          const data = await extractRes.json();
          text = data.text || "";
        }
      }
      if (!text || text.replace(/[\s\n\r\-0-9of]/g, "").length < 10) {
        setExtractError(true);
        setIsExtracted(false);
        setAddStep("form");
        return;
      }
      const result = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ documentContent: text.substring(0, 8000), extractionType: "client" }),
      });
      if (result.ok) {
        const extracted = await result.json();
        setFormData({
          type: extracted.type || "PJ",
          name: extracted.name || extracted.razaoSocial || extracted.nomeCompleto || "",
          document: extracted.document || extracted.cnpj || extracted.cpf || "",
          email: extracted.email || "",
          phone: extracted.phone || extracted.telefone || "",
          address: extracted.address || extracted.endereco || "",
          notes: extracted.notes || extracted.observacoes || "",
        });
        setIsExtracted(true);
      } else {
        setExtractError(true);
        setIsExtracted(false);
      }
    } catch {
      setExtractError(true);
      setIsExtracted(false);
    }
    setAddStep("form");
  };

  const handleSaveClient = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      const newClient = await createClient.mutateAsync({
        type: formData.type || "PF",
        name: formData.name || "",
        document: formData.document || "",
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined,
        status: "ativo",
        tenantId: 1,
      });
      setIsAdding(false);
      resetDialog();
      if (newClient?.id) navigate(`/clients/${newClient.id}`);
    } catch (err: any) {
      setSaveError(err?.message || "Erro ao cadastrar cliente. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const [saveError, setSaveError] = useState("");

  const resetDialog = () => {
    setAddStep("choose");
    setFormData({ type: "PJ", name: "", document: "", email: "", phone: "", address: "", notes: "" });
    setIsExtracted(false);
    setExtractError(false);
    setSaveError("");
  };

  return (
    <>
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">Clientes</h1>
          <p className="text-muted-foreground mt-1 text-sm hidden sm:block">Gestão completa de clientes do escritório.</p>
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
                Escolha como deseja cadastrar o cliente.
              </DialogDescription>
            </DialogHeader>

            {addStep === "choose" && (
              <div className="py-4 grid grid-cols-2 gap-4">
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => setAddStep("upload")}
                  data-testid="btn-upload-smart"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h3 className="font-medium mb-1">Upload Inteligente</h3>
                  <p className="text-xs text-muted-foreground">
                    Envie um documento e a IA extrai os dados automaticamente
                  </p>
                </div>
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => setAddStep("form")}
                  data-testid="btn-manual-form"
                >
                  <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3">
                    <Pen className="w-7 h-7" />
                  </div>
                  <h3 className="font-medium mb-1">Formulário Manual</h3>
                  <p className="text-xs text-muted-foreground">
                    Preencha os dados do cliente manualmente
                  </p>
                </div>
              </div>
            )}

            {addStep === "upload" && (
              <div className="py-6">
                <label
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                >
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png" onChange={handleFileUpload} data-testid="input-file-upload" />
                  <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">Upload de Documento</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Envie um arquivo (.pdf, .doc, .docx, .jpg, .png, .txt) com dados do cliente. A IA extrairá nome, documento e endereço automaticamente.
                  </p>
                </label>
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
                {isExtracted && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">Dados extraídos via IA — revise e confirme</span>
                  </div>
                )}
                {extractError && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Não foi possível extrair dados do arquivo. Preencha manualmente.</span>
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">{saveError}</span>
                  </div>
                )}
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        data-testid="select-client-type"
                      >
                        <option value="PJ">Pessoa Jurídica</option>
                        <option value="PF">Pessoa Física</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{formData.type === "PJ" ? "CNPJ" : "CPF"}</label>
                      <Input
                        value={formData.document}
                        onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                        placeholder={formData.type === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                        data-testid="input-client-document"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{formData.type === "PJ" ? "Razão Social" : "Nome Completo"}</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={formData.type === "PJ" ? "Razão Social Ltda" : "Nome Completo"}
                      data-testid="input-client-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">E-mail</label>
                      <Input
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@exemplo.com"
                        type="email"
                        data-testid="input-client-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Telefone</label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(00) 00000-0000"
                        data-testid="input-client-phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Endereço</label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Rua, número, bairro, cidade - UF"
                      data-testid="input-client-address"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Outras Informações</label>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Observações, referências, contatos adicionais, informações relevantes..."
                      data-testid="input-client-notes"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {addStep === "form" ? (
                <>
                  <Button variant="outline" onClick={resetDialog}>Voltar</Button>
                  <Button
                    onClick={handleSaveClient}
                    disabled={isSaving}
                    data-testid="btn-confirm-client"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirmar Cadastro
                  </Button>
                </>
              ) : addStep === "upload" ? (
                <Button variant="outline" onClick={resetDialog}>Voltar</Button>
              ) : (
                <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 bg-card p-3 sm:p-4 rounded-lg border shadow-sm mt-4 sm:mt-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={toggleSelectAll}
          title={selectedClientIds.size === filteredClients.length && filteredClients.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
          data-testid="btn-select-all-clients"
        >
          {selectedClientIds.size === filteredClients.length && filteredClients.length > 0 ? (
            <CheckSquare className="w-5 h-5 text-primary" />
          ) : (
            <Square className="w-5 h-5 text-muted-foreground" />
          )}
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes por nome ou documento..."
            className="pl-9 border-none bg-muted/50 focus:bg-background transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-clients"
          />
        </div>
        {selectedClientIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowBatchDeleteConfirm(true)}
            data-testid="btn-batch-delete-clients"
          >
            <Trash2 className="w-4 h-4" />
            Excluir ({selectedClientIds.size})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum cliente encontrado</h3>
          <p className="text-muted-foreground text-sm mt-1">Cadastre um novo cliente para começar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 mt-4 sm:mt-6">
          {filteredClients.map((client: any) => (
            <div
              key={client.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors group ${selectedClientIds.has(client.id) ? "bg-primary/5 ring-1 ring-primary" : ""}`}
              onClick={() => navigate(`/clients/${client.id}`)}
              data-testid={`card-client-${client.id}`}
            >
              <div
                className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0 hover:bg-muted/80 cursor-pointer"
                onClick={(e) => toggleSelectClient(client.id, e)}
                data-testid={`checkbox-client-${client.id}`}
              >
                {selectedClientIds.has(client.id) ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  client.type === "PJ" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <h3 className="font-medium truncate text-sm">{client.name}</h3>
                <Badge variant={client.status === "ativo" ? "default" : "secondary"} className="capitalize shrink-0 text-xs">
                  {client.status}
                </Badge>
              </div>
              <span className="text-xs font-mono text-muted-foreground hidden sm:block shrink-0">{client.document}</span>
              {client.phone && (
                <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1 shrink-0">
                  <Phone className="w-3 h-3" />
                  {client.phone}
                </span>
              )}
              <span className="text-xs text-muted-foreground hidden lg:block shrink-0">
                Desde {new Date(client.createdAt).getFullYear()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                data-testid={`btn-delete-client-${client.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setClientToDelete(client);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{clientToDelete?.name}</strong>? 
              Todos os contratos, processos, faturas e documentos vinculados a este cliente também serão excluídos. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-client"
              onClick={() => {
                if (clientToDelete) {
                  deleteClient.mutate(clientToDelete.id, {
                    onSuccess: () => setClientToDelete(null),
                  });
                }
              }}
            >
              {deleteClient.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedClientIds.size} Cliente(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{selectedClientIds.size} cliente(s)</strong> selecionado(s)?
              Todos os contratos, processos, faturas, devedores e documentos vinculados serão excluídos permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-batch-delete-clients"
              onClick={handleBatchDelete}
              disabled={isBatchDeleting}
            >
              {isBatchDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir {selectedClientIds.size} Cliente(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ClientDetailView({ clientId }: { clientId: number }) {
  const [, navigate] = useLocation();
  const { data: client, isLoading: clientLoading } = useClient(clientId);
  const { data: contracts, isLoading: contractsLoading } = useClientContracts(clientId);
  const { data: cases, isLoading: casesLoading } = useClientCases(clientId);
  const { data: invoices, isLoading: invoicesLoading } = useClientInvoices(clientId);
  const { data: deadlines, isLoading: deadlinesLoading } = useClientDeadlines(clientId);
  const [reportType, setReportType] = useState("geral");
  const [customReportPrompt, setCustomReportPrompt] = useState("");
  const [generatedReport, setGeneratedReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showWhatsAppPanel, setShowWhatsAppPanel] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [strategicAnalysis, setStrategicAnalysis] = useState("");
  const [showDebtorDialog, setShowDebtorDialog] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<any>(null);
  const [debtorForm, setDebtorForm] = useState({ type: "PF", name: "", document: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", zipCode: "", notes: "", totalDebt: "" });
  const [debtorSaving, setDebtorSaving] = useState(false);
  const [debtorUploadStep, setDebtorUploadStep] = useState<"choose" | "extracting" | "form" | "paste">("choose");
  const [debtorExtracted, setDebtorExtracted] = useState(false);
  const [debtorExtractError, setDebtorExtractError] = useState("");
  const [debtorPasteText, setDebtorPasteText] = useState("");
  const [debtorPasteExtracting, setDebtorPasteExtracting] = useState(false);
  const [expandedDebtorId, setExpandedDebtorId] = useState<number | null>(null);
  const [debtorDocUploading, setDebtorDocUploading] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    type: "", name: "", document: "", email: "", phone: "", address: "",
    notes: "", status: "", communicationTone: "", secretaryNotes: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const updateClient = useUpdateClient();

  const openEditDialog = () => {
    if (!client) return;
    setEditForm({
      type: client.type || "PF",
      name: client.name || "",
      document: client.document || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || "",
      status: client.status || "ativo",
      communicationTone: client.communicationTone || "auto",
      secretaryNotes: client.secretaryNotes || "",
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    try {
      await updateClient.mutateAsync({
        id: clientId,
        data: {
          type: editForm.type,
          name: editForm.name,
          document: editForm.document,
          email: editForm.email || null,
          phone: editForm.phone || null,
          address: editForm.address || null,
          notes: editForm.notes || null,
          status: editForm.status,
          communicationTone: editForm.communicationTone || "auto",
          secretaryNotes: editForm.secretaryNotes || null,
        },
      });
      setShowEditDialog(false);
    } catch (err) {
      console.error("Error updating client:", err);
    } finally {
      setEditSaving(false);
    }
  };

  const { data: clientDebtors, isLoading: debtorsLoading } = useQuery({
    queryKey: ["/api/clients", clientId, "debtors"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/debtors`, { headers: getAuthHeaders(), credentials: "include" });
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: negotiations, isLoading: negotiationsLoading } = useQuery({
    queryKey: ["/api/clients", clientId, "negotiations"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/negotiations`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const queryClient = useQueryClient();
  const createContract = useCreateContract();
  const createCase = useCreateCase();

  const [showNewContractDialog, setShowNewContractDialog] = useState(false);
  const [newContractStep, setNewContractStep] = useState<"choose" | "upload" | "form" | "extracting">("choose");
  const [contractForm, setContractForm] = useState({ type: "honorarios", description: "", monthlyValue: "", startDate: "", status: "ativo" });
  const [contractExtracted, setContractExtracted] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [contractError, setContractError] = useState("");

  const [showNewCaseDialog, setShowNewCaseDialog] = useState(false);
  const [newCaseStep, setNewCaseStep] = useState<"choose" | "upload" | "form" | "extracting">("choose");
  const [caseForm, setCaseForm] = useState({ caseNumber: "", title: "", caseType: "civel", court: "", riskLevel: "medio", estimatedValue: "" });
  const [caseExtracted, setCaseExtracted] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseError, setCaseError] = useState("");

  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false);
  const [newInvoiceStep, setNewInvoiceStep] = useState<"choose" | "upload" | "form" | "extracting">("choose");
  const [invoiceForm, setInvoiceForm] = useState({ amount: "", dueDate: "", referenceMonth: "", status: "emitida" });
  const [invoiceExtracted, setInvoiceExtracted] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  const [docAnalyzing, setDocAnalyzing] = useState(false);
  const [docAnalysis, setDocAnalysis] = useState("");
  const [docError, setDocError] = useState("");
  const [selectedCaseForPetition, setSelectedCaseForPetition] = useState("");

  const handleContractFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewContractStep("extracting");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), b => String.fromCharCode(b)).join(''));
      const result = await fetch("/api/ai/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (result.ok) {
        const { text } = await result.json();
        const extractResult = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ documentContent: text.substring(0, 8000), extractionType: "contract" }),
        });
        if (extractResult.ok) {
          const extracted = await extractResult.json();
          setContractForm({
            type: extracted.type || extracted.tipo || "honorarios",
            description: extracted.description || extracted.descricao || extracted.objeto || "",
            monthlyValue: extracted.monthlyValue || extracted.valorMensal || extracted.valor || "",
            startDate: extracted.startDate || extracted.dataInicio || "",
            status: "ativo",
          });
          setContractExtracted(true);
        }
      }
    } catch {}
    setNewContractStep("form");
  };

  const handleCaseFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewCaseStep("extracting");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), b => String.fromCharCode(b)).join(''));
      const result = await fetch("/api/ai/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (result.ok) {
        const { text } = await result.json();
        const extractResult = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ documentContent: text.substring(0, 8000), extractionType: "petition" }),
        });
        if (extractResult.ok) {
          const extracted = await extractResult.json();
          setCaseForm({
            caseNumber: extracted.caseNumber || extracted.numeroProcesso || extracted.numero || "",
            title: extracted.title || extracted.titulo || "",
            caseType: extracted.caseType || extracted.tipo || "civel",
            court: extracted.court || extracted.tribunal || extracted.vara || "",
            riskLevel: extracted.riskLevel || extracted.risco || "medio",
            estimatedValue: extracted.estimatedValue || extracted.valorCausa || "",
          });
          setCaseExtracted(true);
        }
      }
    } catch {}
    setNewCaseStep("form");
  };

  const handleInvoiceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewInvoiceStep("extracting");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), b => String.fromCharCode(b)).join(''));
      const result = await fetch("/api/ai/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (result.ok) {
        const { text } = await result.json();
        const extractResult = await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ documentContent: text.substring(0, 8000), extractionType: "contract" }),
        });
        if (extractResult.ok) {
          const extracted = await extractResult.json();
          setInvoiceForm({
            amount: extracted.amount || extracted.valor || "",
            dueDate: extracted.dueDate || extracted.vencimento || "",
            referenceMonth: extracted.referenceMonth || extracted.mesReferencia || "",
            status: "emitida",
          });
          setInvoiceExtracted(true);
        }
      }
    } catch {}
    setNewInvoiceStep("form");
  };

  const resetContractDialog = () => {
    setNewContractStep("choose");
    setContractForm({ type: "honorarios", description: "", monthlyValue: "", startDate: "", status: "ativo" });
    setContractExtracted(false);
    setContractError("");
  };

  const resetCaseDialog = () => {
    setNewCaseStep("choose");
    setCaseForm({ caseNumber: "", title: "", caseType: "civel", court: "", riskLevel: "medio", estimatedValue: "" });
    setCaseExtracted(false);
    setCaseError("");
  };

  const resetInvoiceDialog = () => {
    setNewInvoiceStep("choose");
    setInvoiceForm({ amount: "", dueDate: "", referenceMonth: "", status: "emitida" });
    setInvoiceExtracted(false);
    setInvoiceError("");
  };

  const handleSaveContract = async () => {
    setContractSaving(true);
    setContractError("");
    try {
      await createContract.mutateAsync({
        tenantId: 1,
        clientId,
        type: contractForm.type,
        description: contractForm.description || undefined,
        monthlyValue: contractForm.monthlyValue || undefined,
        startDate: contractForm.startDate ? new Date(contractForm.startDate).toISOString() : new Date().toISOString(),
        status: contractForm.status,
      });
      queryClient.invalidateQueries({ queryKey: ["clients", clientId, "contracts"] });
      setShowNewContractDialog(false);
      resetContractDialog();
    } catch (err: any) {
      setContractError(err?.message || "Erro ao criar contrato.");
    } finally {
      setContractSaving(false);
    }
  };

  const handleSaveCase = async () => {
    setCaseSaving(true);
    setCaseError("");
    try {
      await createCase.mutateAsync({
        tenantId: 1,
        clientId,
        caseNumber: caseForm.caseNumber,
        title: caseForm.title,
        caseType: caseForm.caseType,
        court: caseForm.court,
        riskLevel: caseForm.riskLevel || undefined,
        estimatedValue: caseForm.estimatedValue || undefined,
        status: "ativo",
      });
      queryClient.invalidateQueries({ queryKey: ["clients", clientId, "cases"] });
      setShowNewCaseDialog(false);
      resetCaseDialog();
    } catch (err: any) {
      setCaseError(err?.message || "Erro ao criar processo.");
    } finally {
      setCaseSaving(false);
    }
  };

  const handleSaveInvoice = async () => {
    setInvoiceSaving(true);
    setInvoiceError("");
    try {
      const firstContract = contracts?.[0];
      await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          tenantId: 1,
          clientId,
          contractId: firstContract?.id || 1,
          invoiceNumber: `FAT-${Date.now()}`,
          amount: invoiceForm.amount,
          dueDate: invoiceForm.dueDate ? new Date(invoiceForm.dueDate).toISOString() : new Date().toISOString(),
          referenceMonth: invoiceForm.referenceMonth,
          status: invoiceForm.status,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["clients", clientId, "invoices"] });
      setShowNewInvoiceDialog(false);
      resetInvoiceDialog();
    } catch (err: any) {
      setInvoiceError(err?.message || "Erro ao criar fatura.");
    } finally {
      setInvoiceSaving(false);
    }
  };

  if (clientLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <User className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Cliente não encontrado</h3>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/clients")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Clientes
        </Button>
      </div>
    );
  }

  const activeCases = cases?.filter((c: any) => c.status === "ativo") || [];
  const totalInvoiced = invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0) || 0;
  const upcomingDeadlines = deadlines?.filter((d: any) => new Date(d.dueDate) >= new Date()) || [];
  const executionCases = cases?.filter((c: any) => c.caseType?.toLowerCase().includes("execução")) || [];

  const totalPaid = invoices?.filter((i: any) => i.status === "paga").reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0) || 0;
  const totalOpen = invoices?.filter((i: any) => i.status !== "paga").reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0) || 0;

  const getDeadlineColor = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "text-red-600 bg-red-50";
    if (diffDays <= 3) return "text-amber-600 bg-amber-50";
    return "";
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "emitida": return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Emitida</Badge>;
      case "paga": return <Badge className="bg-green-100 text-green-800 border-green-200">Paga</Badge>;
      case "vencida": return <Badge className="bg-red-100 text-red-800 border-red-200">Vencida</Badge>;
      default: return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    }
  };

  const handleDebtorFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDebtorExtractError("");
    setDebtorUploadStep("extracting");
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      formDataUpload.append("fileName", file.name);
      const res = await fetch("/api/ai/extract-debtor", {
        method: "POST",
        headers: { ...getAuthHeaders() },
        credentials: "include",
        body: formDataUpload,
      });
      if (res.ok) {
        const extracted = await res.json();
        if (extracted.rawExtraction) {
          setDebtorExtractError("Não foi possível estruturar os dados automaticamente. Preencha manualmente.");
          setDebtorExtracted(false);
        } else {
          setDebtorForm({
            type: extracted.type || "PF",
            name: extracted.name || "",
            document: extracted.document || "",
            email: extracted.email || "",
            phone: extracted.phone || "",
            whatsapp: extracted.whatsapp || "",
            address: extracted.address || "",
            city: extracted.city || "",
            state: extracted.state || "",
            zipCode: extracted.zipCode || "",
            notes: extracted.notes || "",
            totalDebt: extracted.totalDebt || "",
          });
          setDebtorExtracted(true);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setDebtorExtractError(err.error || "Erro ao processar arquivo.");
        setDebtorExtracted(false);
      }
    } catch {
      setDebtorExtractError("Erro ao enviar arquivo. Tente novamente.");
      setDebtorExtracted(false);
    }
    setDebtorUploadStep("form");
    e.target.value = "";
  };

  const handleSaveDebtor = async () => {
    setDebtorSaving(true);
    try {
      const url = editingDebtor ? `/api/debtors/${editingDebtor.id}` : "/api/debtors";
      const method = editingDebtor ? "PUT" : "POST";
      const cleanForm: any = { ...debtorForm, clientId, tenantId: 1 };
      Object.keys(cleanForm).forEach((key) => {
        if (cleanForm[key] === "") cleanForm[key] = null;
      });
      if (cleanForm.totalDebt !== null && cleanForm.totalDebt !== undefined) {
        let raw = String(cleanForm.totalDebt).replace(/[^\d.,-]/g, "");
        if (raw.includes(",")) {
          raw = raw.replace(/\./g, "").replace(",", ".");
        }
        const parsed = parseFloat(raw);
        cleanForm.totalDebt = isNaN(parsed) ? null : String(parsed);
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(cleanForm),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "debtors"] });
      setShowDebtorDialog(false);
      setEditingDebtor(null);
      setDebtorForm({ type: "PF", name: "", document: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", zipCode: "", notes: "", totalDebt: "" });
    } catch { }
    setDebtorSaving(false);
  };

  const handleDebtorPasteExtract = async () => {
    if (!debtorPasteText.trim()) return;
    setDebtorPasteExtracting(true);
    try {
      const res = await fetch("/api/debtors/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ text: debtorPasteText }),
      });
      if (res.ok) {
        const data = await res.json();
        setDebtorForm({
          type: data.type || "PF",
          name: data.name || "",
          document: data.document || "",
          email: data.email || "",
          phone: data.phone || "",
          whatsapp: data.whatsapp || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zipCode: data.zipCode || "",
          notes: data.notes || "",
          totalDebt: data.totalDebt || "",
        });
        setDebtorExtracted(true);
        setDebtorUploadStep("form");
      } else {
        let errorMsg = "Não foi possível extrair os dados. Preencha manualmente.";
        try {
          const errData = await res.json();
          if (errData?.error) errorMsg = errData.error;
        } catch {}
        setDebtorExtractError(errorMsg);
        setDebtorUploadStep("form");
      }
    } catch {
      setDebtorExtractError("Erro de conexão ao processar o texto. Verifique sua internet e tente novamente.");
      setDebtorUploadStep("form");
    }
    setDebtorPasteExtracting(false);
  };

  const handleDebtorDocUpload = async (debtorId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDebtorDocUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      formData.append("type", "documento_devedor");
      if (clientId) formData.append("clientId", String(clientId));
      await fetch(`/api/debtors/${debtorId}/documents`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ["debtor-docs", debtorId] });
    } catch {}
    setDebtorDocUploading(false);
    e.target.value = "";
  };

  const handleDeleteDebtorDoc = async (docId: number, debtorId: number) => {
    if (!confirm("Excluir este documento?")) return;
    await fetch(`/api/documents/${docId}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["debtor-docs", debtorId] });
  };

  const handleDeleteDebtor = async (id: number) => {
    if (!confirm("Excluir este devedor?")) return;
    await fetch(`/api/debtors/${id}`, { method: "DELETE", headers: getAuthHeaders(), credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "debtors"] });
  };

  const openEditDebtor = (debtor: any) => {
    setEditingDebtor(debtor);
    setDebtorForm({
      type: debtor.type || "PF",
      name: debtor.name || "",
      document: debtor.document || "",
      email: debtor.email || "",
      phone: debtor.phone || "",
      whatsapp: debtor.whatsapp || "",
      address: debtor.address || "",
      city: debtor.city || "",
      state: debtor.state || "",
      zipCode: debtor.zipCode || "",
      notes: debtor.notes || "",
      totalDebt: debtor.totalDebt || "",
    });
    setShowDebtorDialog(true);
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    setGeneratedReport("");
    try {
      const contextData = {
        client: { name: client.name, type: client.type, document: client.document, email: client.email, phone: client.phone, status: client.status },
        contracts: contracts || [],
        cases: cases || [],
        invoices: invoices || [],
        deadlines: deadlines || [],
      };

      const reportTypeLabels: Record<string, string> = {
        geral: "relatório geral completo do cliente, incluindo todos os dados",
        processos: "relatório detalhado dos processos judiciais do cliente",
        financeiro: "relatório financeiro com faturamento, pagamentos e inadimplência",
        contratos: "relatório dos contratos ativos e histórico contratual",
        prazos: "relatório de prazos judiciais, alertas e compromissos pendentes",
        custom: customReportPrompt,
      };

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Gere um ${reportTypeLabels[reportType]} para o seguinte cliente do escritório Marques & Serra Sociedade de Advogados.\n\nDados do cliente e informações:\n${JSON.stringify(contextData, null, 2)}\n\nGere um relatório profissional, formatado e detalhado em português. Use seções com títulos. Inclua data do relatório.\n\nIMPORTANTE: NÃO use formatação Markdown (sem **, ##, *, _, etc). Escreva em texto puro, limpo e profissional. Use LETRAS MAIÚSCULAS para títulos de seções. Separe seções com linhas em branco.`
          }]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const cleanText = data.content
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/__([^_]+)__/g, '$1')
          .replace(/_([^_]+)_/g, '$1')
          .replace(/^#{1,6}\s+/gm, '')
          .replace(/^---+$/gm, '')
          .replace(/^___+$/gm, '')
          .replace(/^\*\*\*+$/gm, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        setGeneratedReport(cleanText);
      }
    } catch {
      setGeneratedReport("Erro ao gerar relatório. Tente novamente.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!generatedReport) return;
    setIsExportingWord(true);
    try {
      const reportTitle = `Relatorio_${client.name?.replace(/\s+/g, '_') || 'Cliente'}`;
      const response = await fetch("/api/studio/export-word", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          contentHtml: generatedReport.split('\n').map((line: string) => line.trim() ? `<p>${line}</p>` : '<br/>').join('\n'),
          title: reportTitle,
          wordTemplateFileData: null,
          userId: 1,
        }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${reportTitle}.docx`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!generatedReport) return;
    setIsExportingPdf(true);
    try {
      const reportTitle = `Relatorio_${client.name?.replace(/\s+/g, '_') || 'Cliente'}`;
      const response = await fetch("/api/reports/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          content: generatedReport,
          title: reportTitle,
          clientName: client.name || "",
        }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${reportTitle}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")} data-testid="btn-back-clients" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 sm:hidden min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-primary truncate">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">{client.type}</Badge>
              <Badge variant={client.status === "ativo" ? "default" : "secondary"} className="capitalize text-xs">
                {client.status}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="icon" className="sm:hidden shrink-0" onClick={openEditDialog} data-testid="btn-edit-client-mobile">
            <Pen className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 hidden sm:block">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-primary">{client.name}</h1>
            <Badge variant="outline">{client.type}</Badge>
            <Badge variant={client.status === "ativo" ? "default" : "secondary"} className="capitalize">
              {client.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
            <span className="font-mono text-xs sm:text-sm">{client.document}</span>
            {client.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{client.email}</span>
              </span>
            )}
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {client.phone}
              </span>
            )}
            {client.address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[250px]">{client.address}</span>
              </span>
            )}
          </div>
        </div>
        <div className="sm:hidden w-full">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{client.document}</span>
            {client.email && (
              <span className="flex items-center gap-1 truncate">
                <Mail className="w-3 h-3" />
                <span className="truncate">{client.email}</span>
              </span>
            )}
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {client.phone}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" className="gap-2 hidden sm:flex shrink-0" onClick={openEditDialog} data-testid="btn-edit-client">
          <Pen className="w-4 h-4" />
          Editar
        </Button>
      </div>

      <Tabs defaultValue="painel" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap sm:flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="painel" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Briefcase className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Painel</span>
          </TabsTrigger>
          <TabsTrigger value="devedores" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Devedores</span>
          </TabsTrigger>
          <TabsTrigger value="contratos" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Contratos</span>
          </TabsTrigger>
          <TabsTrigger value="processos" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Scale className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Processos</span>
          </TabsTrigger>
          <TabsTrigger value="execucoes" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Scale className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Execuções</span>
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Financeiro</span>
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Docs AI</span>
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Alertas</span>
          </TabsTrigger>
          <TabsTrigger value="estrategico" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Estratégico</span>
          </TabsTrigger>
          <TabsTrigger value="negociacoes" className="gap-1.5 text-xs sm:text-sm shrink-0">
            <Handshake className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Negociações</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel" data-testid="tab-painel">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Contratos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{contractsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (contracts?.length || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Processos Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{casesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : activeCases.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Valor Total Faturado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoicesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(totalInvoiced)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Próximos Prazos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{deadlinesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : upcomingDeadlines.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Atividade Recente</CardTitle>
            </CardHeader>
            <CardContent>
              {deadlinesLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : deadlines && deadlines.length > 0 ? (
                <div className="space-y-4">
                  {deadlines.slice(0, 5).map((deadline: any) => (
                    <div key={deadline.id} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                        new Date(deadline.dueDate) < new Date() ? "bg-red-500" :
                        Math.ceil((new Date(deadline.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 3 ? "bg-amber-500" : "bg-green-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{deadline.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(deadline.dueDate)} · {deadline.priority}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize text-xs shrink-0">
                        {deadline.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Clock className="w-8 h-8 mb-2" />
                  <p className="text-sm">Nenhuma atividade recente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devedores" data-testid="tab-devedores">
          <div className="flex justify-between items-center mt-4 mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Devedores do Cliente</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" data-testid="btn-upload-devedor" onClick={() => { setEditingDebtor(null); setDebtorForm({ type: "PF", name: "", document: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", zipCode: "", notes: "", totalDebt: "" }); setDebtorUploadStep("choose"); setDebtorExtracted(false); setDebtorExtractError(""); setShowDebtorDialog(true); }}>
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Upload Inteligente</span>
                <span className="sm:hidden">Upload</span>
              </Button>
              <Button size="sm" className="gap-1.5" data-testid="btn-novo-devedor" onClick={() => { setEditingDebtor(null); setDebtorForm({ type: "PF", name: "", document: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", zipCode: "", notes: "", totalDebt: "" }); setDebtorUploadStep("form"); setDebtorExtracted(false); setDebtorExtractError(""); setShowDebtorDialog(true); }}>
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Novo Devedor</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </div>
          </div>
          {debtorsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : clientDebtors && clientDebtors.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Telefone/WhatsApp</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Dívida Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientDebtors.map((debtor: any) => (
                      <React.Fragment key={debtor.id}>
                      <TableRow data-testid={`row-debtor-${debtor.id}`} className="cursor-pointer" onClick={() => setExpandedDebtorId(expandedDebtorId === debtor.id ? null : debtor.id)}>
                        <TableCell className="font-medium" data-testid={`text-debtor-name-${debtor.id}`}>{debtor.name}</TableCell>
                        <TableCell className="font-mono text-sm" data-testid={`text-debtor-document-${debtor.id}`}>{debtor.document}</TableCell>
                        <TableCell data-testid={`text-debtor-phone-${debtor.id}`}>
                          {debtor.phone && <div className="text-sm">{debtor.phone}</div>}
                          {debtor.whatsapp && <div className="text-xs text-muted-foreground">{debtor.whatsapp}</div>}
                        </TableCell>
                        <TableCell data-testid={`text-debtor-email-${debtor.id}`}>{debtor.email}</TableCell>
                        <TableCell data-testid={`text-debtor-debt-${debtor.id}`}>{debtor.totalDebt ? formatCurrency(Number(debtor.totalDebt)) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={debtor.status === "ativo" ? "default" : "secondary"} className="capitalize" data-testid={`badge-debtor-status-${debtor.id}`}>
                            {debtor.status || "ativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditDebtor(debtor); }} data-testid={`btn-edit-debtor-${debtor.id}`}>
                              <Pen className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteDebtor(debtor.id); }} data-testid={`btn-delete-debtor-${debtor.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/negotiations?clientId=${clientId}&debtorId=${debtor.id}`); }} data-testid={`btn-negociar-debtor-${debtor.id}`}>
                              <Handshake className="w-3.5 h-3.5 mr-1" />
                              Negociar
                            </Button>
                            <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={(e) => { e.stopPropagation(); navigate(`/acordos?clientId=${clientId}&debtorId=${debtor.id}`); }} data-testid={`btn-acordo-debtor-${debtor.id}`}>
                              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                              Acordo
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedDebtorId === debtor.id && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <DebtorDocumentsSection debtorId={debtor.id} clientId={clientId} onUpload={handleDebtorDocUpload} onDelete={handleDeleteDebtorDoc} uploading={debtorDocUploading} />
                          </TableCell>
                        </TableRow>
                      )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum devedor cadastrado</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre um devedor para este cliente.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="contratos" data-testid="tab-contratos">
          <div className="flex justify-between items-center mt-4 mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Contratos do cliente</h3>
            <Dialog open={showNewContractDialog} onOpenChange={(open) => { setShowNewContractDialog(open); if (!open) resetContractDialog(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="btn-novo-contrato">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Novo Contrato</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Novo Contrato</DialogTitle>
                  <DialogDescription>Adicione um contrato para este cliente.</DialogDescription>
                </DialogHeader>
                {newContractStep === "choose" && (
                  <div className="py-4 grid grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewContractStep("upload")} data-testid="btn-contract-upload">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Upload className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Upload Inteligente</h3>
                      <p className="text-xs text-muted-foreground">Envie um documento e a IA extrai os dados</p>
                    </div>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewContractStep("form")} data-testid="btn-contract-manual">
                      <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3"><Pen className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Formulário Manual</h3>
                      <p className="text-xs text-muted-foreground">Preencha os dados do contrato manualmente</p>
                    </div>
                  </div>
                )}
                {newContractStep === "upload" && (
                  <div className="py-6">
                    <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={handleContractFileUpload} data-testid="input-contract-file" />
                      <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4"><Upload className="w-8 h-8" /></div>
                      <h3 className="font-medium text-lg mb-1">Upload de Documento</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">Envie um PDF, Word ou texto com dados do contrato.</p>
                    </label>
                  </div>
                )}
                {newContractStep === "extracting" && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div><h3 className="font-semibold text-lg">Analisando Documento...</h3><p className="text-muted-foreground text-sm">Extraindo tipo, descrição e valores do contrato.</p></div>
                  </div>
                )}
                {newContractStep === "form" && (
                  <div className="py-4 space-y-4">
                    {contractExtracted && (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Dados extraídos via IA — revise e confirme</span></div>
                    )}
                    {contractError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{contractError}</span></div>
                    )}
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tipo</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={contractForm.type} onChange={(e) => setContractForm({ ...contractForm, type: e.target.value })} data-testid="select-contract-type">
                            <option value="honorarios">Honorários</option>
                            <option value="consultoria">Consultoria</option>
                            <option value="contencioso">Contencioso</option>
                            <option value="exito">Êxito</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Status</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={contractForm.status} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value })} data-testid="select-contract-status">
                            <option value="ativo">Ativo</option>
                            <option value="encerrado">Encerrado</option>
                            <option value="suspenso">Suspenso</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Descrição</label>
                        <Input value={contractForm.description} onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })} placeholder="Descrição do contrato" data-testid="input-contract-description" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Valor Mensal</label>
                          <Input type="number" value={contractForm.monthlyValue} onChange={(e) => setContractForm({ ...contractForm, monthlyValue: e.target.value })} placeholder="0.00" data-testid="input-contract-value" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Data Início</label>
                          <Input type="date" value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} data-testid="input-contract-start" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {newContractStep === "form" ? (
                    <>
                      <Button variant="outline" onClick={resetContractDialog}>Voltar</Button>
                      <Button onClick={handleSaveContract} disabled={contractSaving} data-testid="btn-confirm-contract">
                        {contractSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Confirmar
                      </Button>
                    </>
                  ) : newContractStep === "upload" ? (
                    <Button variant="outline" onClick={resetContractDialog}>Voltar</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setShowNewContractDialog(false)}>Cancelar</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-md border bg-card shadow-sm">
            {contractsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : contracts && contracts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor Mensal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data Início</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((contract: any) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium capitalize">{contract.type}</TableCell>
                      <TableCell>{contract.description || "—"}</TableCell>
                      <TableCell>{contract.monthlyValue ? formatCurrency(Number(contract.monthlyValue)) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={contract.status === "ativo" ? "default" : "secondary"} className="capitalize">
                          {contract.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{contract.startDate ? formatDate(contract.startDate) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mb-3" />
                <p className="font-medium">Nenhum contrato cadastrado</p>
                <p className="text-sm mt-1">Os contratos deste cliente aparecerão aqui.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="processos" data-testid="tab-processos">
          <div className="flex justify-between items-center mt-4 mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Processos do cliente</h3>
            <Dialog open={showNewCaseDialog} onOpenChange={(open) => { setShowNewCaseDialog(open); if (!open) resetCaseDialog(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="btn-novo-processo">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Novo Processo</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Novo Processo</DialogTitle>
                  <DialogDescription>Adicione um processo para este cliente.</DialogDescription>
                </DialogHeader>
                {newCaseStep === "choose" && (
                  <div className="py-4 grid grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewCaseStep("upload")} data-testid="btn-case-upload">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Upload className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Upload Inteligente</h3>
                      <p className="text-xs text-muted-foreground">Envie um documento e a IA extrai os dados</p>
                    </div>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewCaseStep("form")} data-testid="btn-case-manual">
                      <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3"><Pen className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Formulário Manual</h3>
                      <p className="text-xs text-muted-foreground">Preencha os dados do processo manualmente</p>
                    </div>
                  </div>
                )}
                {newCaseStep === "upload" && (
                  <div className="py-6">
                    <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={handleCaseFileUpload} data-testid="input-case-file" />
                      <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4"><Upload className="w-8 h-8" /></div>
                      <h3 className="font-medium text-lg mb-1">Upload de Documento</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">Envie um PDF, Word ou texto com dados do processo.</p>
                    </label>
                  </div>
                )}
                {newCaseStep === "extracting" && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div><h3 className="font-semibold text-lg">Analisando Documento...</h3><p className="text-muted-foreground text-sm">Extraindo número, tribunal e dados do processo.</p></div>
                  </div>
                )}
                {newCaseStep === "form" && (
                  <div className="py-4 space-y-4">
                    {caseExtracted && (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Dados extraídos via IA — revise e confirme</span></div>
                    )}
                    {caseError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{caseError}</span></div>
                    )}
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Número do Processo</label>
                          <Input value={caseForm.caseNumber} onChange={(e) => { const d = e.target.value.replace(/\D/g, "").substring(0, 20); let m = ""; for (let i = 0; i < d.length; i++) { if (i === 7) m += "-"; if (i === 9) m += "."; if (i === 13) m += "."; if (i === 14) m += "."; if (i === 16) m += "."; m += d[i]; } setCaseForm({ ...caseForm, caseNumber: m }); }} placeholder="0000000-00.0000.0.00.0000" data-testid="input-case-number" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tipo</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={caseForm.caseType} onChange={(e) => setCaseForm({ ...caseForm, caseType: e.target.value })} data-testid="select-case-type">
                            <option value="civel">Cível</option>
                            <option value="trabalhista">Trabalhista</option>
                            <option value="tributario">Tributário</option>
                            <option value="criminal">Criminal</option>
                            <option value="execução">Execução</option>
                            <option value="administrativo">Administrativo</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Título</label>
                        <Input value={caseForm.title} onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })} placeholder="Título do processo" data-testid="input-case-title" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tribunal / Vara</label>
                          <Input value={caseForm.court} onChange={(e) => setCaseForm({ ...caseForm, court: e.target.value })} placeholder="Ex: TJSP - 1ª Vara Cível" data-testid="input-case-court" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Nível de Risco</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={caseForm.riskLevel} onChange={(e) => setCaseForm({ ...caseForm, riskLevel: e.target.value })} data-testid="select-case-risk">
                            <option value="baixo">Baixo</option>
                            <option value="medio">Médio</option>
                            <option value="alto">Alto</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Valor Estimado</label>
                        <Input type="number" value={caseForm.estimatedValue} onChange={(e) => setCaseForm({ ...caseForm, estimatedValue: e.target.value })} placeholder="0.00" data-testid="input-case-value" />
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {newCaseStep === "form" ? (
                    <>
                      <Button variant="outline" onClick={resetCaseDialog}>Voltar</Button>
                      <Button onClick={handleSaveCase} disabled={caseSaving} data-testid="btn-confirm-case">
                        {caseSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Confirmar
                      </Button>
                    </>
                  ) : newCaseStep === "upload" ? (
                    <Button variant="outline" onClick={resetCaseDialog}>Voltar</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setShowNewCaseDialog(false)}>Cancelar</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-md border bg-card shadow-sm">
            {casesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : cases && cases.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tribunal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((caseItem: any) => (
                    <TableRow key={caseItem.id}>
                      <TableCell className="font-mono text-sm">{caseItem.caseNumber}</TableCell>
                      <TableCell className="font-medium">{caseItem.title}</TableCell>
                      <TableCell>{caseItem.court}</TableCell>
                      <TableCell>
                        <Badge variant={caseItem.status === "ativo" ? "default" : "secondary"} className="capitalize">
                          {caseItem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {caseItem.riskLevel ? (
                          <Badge variant={caseItem.riskLevel === "alto" ? "destructive" : "secondary"} className="capitalize">
                            {caseItem.riskLevel}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => navigate(`/studio?processo=${caseItem.caseNumber}&caseId=${caseItem.id}`)}
                          data-testid={`btn-gerar-peticao-${caseItem.id}`}
                        >
                          <Pen className="w-3.5 h-3.5" />
                          Gerar Petição
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Scale className="w-10 h-10 mb-3" />
                <p className="font-medium">Nenhum processo cadastrado</p>
                <p className="text-sm mt-1">Os processos deste cliente aparecerão aqui.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="execucoes" data-testid="tab-execucoes">
          <div className="flex justify-between items-center mt-4 mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Execuções do cliente</h3>
            <Dialog open={showNewCaseDialog} onOpenChange={(open) => { setShowNewCaseDialog(open); if (!open) resetCaseDialog(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="btn-novo-execucao">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Novo Processo</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Novo Processo de Execução</DialogTitle>
                  <DialogDescription>Adicione um processo de execução para este cliente.</DialogDescription>
                </DialogHeader>
                {newCaseStep === "choose" && (
                  <div className="py-4 grid grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewCaseStep("upload")} data-testid="btn-exec-upload">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Upload className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Upload Inteligente</h3>
                      <p className="text-xs text-muted-foreground">Envie um documento e a IA extrai os dados</p>
                    </div>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => { setNewCaseStep("form"); setCaseForm(f => ({ ...f, caseType: "execução" })); }} data-testid="btn-exec-manual">
                      <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3"><Pen className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Formulário Manual</h3>
                      <p className="text-xs text-muted-foreground">Preencha os dados do processo manualmente</p>
                    </div>
                  </div>
                )}
                {newCaseStep === "upload" && (
                  <div className="py-6">
                    <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={handleCaseFileUpload} data-testid="input-exec-file" />
                      <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4"><Upload className="w-8 h-8" /></div>
                      <h3 className="font-medium text-lg mb-1">Upload de Documento</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">Envie um PDF, Word ou texto com dados do processo.</p>
                    </label>
                  </div>
                )}
                {newCaseStep === "extracting" && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div><h3 className="font-semibold text-lg">Analisando Documento...</h3><p className="text-muted-foreground text-sm">Extraindo número, tribunal e dados do processo.</p></div>
                  </div>
                )}
                {newCaseStep === "form" && (
                  <div className="py-4 space-y-4">
                    {caseExtracted && (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Dados extraídos via IA — revise e confirme</span></div>
                    )}
                    {caseError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{caseError}</span></div>
                    )}
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Número do Processo</label>
                          <Input value={caseForm.caseNumber} onChange={(e) => { const d = e.target.value.replace(/\D/g, "").substring(0, 20); let m = ""; for (let i = 0; i < d.length; i++) { if (i === 7) m += "-"; if (i === 9) m += "."; if (i === 13) m += "."; if (i === 14) m += "."; if (i === 16) m += "."; m += d[i]; } setCaseForm({ ...caseForm, caseNumber: m }); }} placeholder="0000000-00.0000.0.00.0000" data-testid="input-exec-number" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tipo</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={caseForm.caseType} onChange={(e) => setCaseForm({ ...caseForm, caseType: e.target.value })} data-testid="select-exec-type">
                            <option value="execução">Execução</option>
                            <option value="civel">Cível</option>
                            <option value="trabalhista">Trabalhista</option>
                            <option value="tributario">Tributário</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Título</label>
                        <Input value={caseForm.title} onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })} placeholder="Título do processo" data-testid="input-exec-title" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tribunal / Vara</label>
                          <Input value={caseForm.court} onChange={(e) => setCaseForm({ ...caseForm, court: e.target.value })} placeholder="Ex: TJSP - 1ª Vara Cível" data-testid="input-exec-court" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Nível de Risco</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={caseForm.riskLevel} onChange={(e) => setCaseForm({ ...caseForm, riskLevel: e.target.value })} data-testid="select-exec-risk">
                            <option value="baixo">Baixo</option>
                            <option value="medio">Médio</option>
                            <option value="alto">Alto</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Valor Estimado</label>
                        <Input type="number" value={caseForm.estimatedValue} onChange={(e) => setCaseForm({ ...caseForm, estimatedValue: e.target.value })} placeholder="0.00" data-testid="input-exec-value" />
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {newCaseStep === "form" ? (
                    <>
                      <Button variant="outline" onClick={resetCaseDialog}>Voltar</Button>
                      <Button onClick={handleSaveCase} disabled={caseSaving} data-testid="btn-confirm-exec">
                        {caseSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Confirmar
                      </Button>
                    </>
                  ) : newCaseStep === "upload" ? (
                    <Button variant="outline" onClick={resetCaseDialog}>Voltar</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setShowNewCaseDialog(false)}>Cancelar</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-md border bg-card shadow-sm">
            {casesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : executionCases.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tribunal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executionCases.map((caseItem: any) => (
                    <TableRow key={caseItem.id}>
                      <TableCell className="font-mono text-sm">{caseItem.caseNumber}</TableCell>
                      <TableCell className="font-medium">{caseItem.title}</TableCell>
                      <TableCell>{caseItem.court}</TableCell>
                      <TableCell>
                        <Badge variant={caseItem.status === "ativo" ? "default" : "secondary"} className="capitalize">
                          {caseItem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {caseItem.riskLevel ? (
                          <Badge variant={caseItem.riskLevel === "alto" ? "destructive" : "secondary"} className="capitalize">
                            {caseItem.riskLevel}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => navigate(`/studio?processo=${caseItem.caseNumber}&caseId=${caseItem.id}`)}
                          data-testid={`btn-gerar-peticao-exec-${caseItem.id}`}
                        >
                          <Pen className="w-3.5 h-3.5" />
                          Gerar Petição
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Scale className="w-10 h-10 mb-3" />
                <p className="font-medium">Nenhuma execução encontrada</p>
                <p className="text-sm mt-1">Os processos de execução deste cliente aparecerão aqui.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="financeiro" data-testid="tab-financeiro">
          <div className="flex justify-between items-center mt-4 mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Financeiro do cliente</h3>
            <Dialog open={showNewInvoiceDialog} onOpenChange={(open) => { setShowNewInvoiceDialog(open); if (!open) resetInvoiceDialog(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="btn-nova-fatura">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nova Fatura</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Nova Fatura</DialogTitle>
                  <DialogDescription>Adicione uma fatura para este cliente.</DialogDescription>
                </DialogHeader>
                {newInvoiceStep === "choose" && (
                  <div className="py-4 grid grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewInvoiceStep("upload")} data-testid="btn-invoice-upload">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Upload className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Upload Inteligente</h3>
                      <p className="text-xs text-muted-foreground">Envie um documento e a IA extrai os dados</p>
                    </div>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => setNewInvoiceStep("form")} data-testid="btn-invoice-manual">
                      <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3"><Pen className="w-7 h-7" /></div>
                      <h3 className="font-medium mb-1">Formulário Manual</h3>
                      <p className="text-xs text-muted-foreground">Preencha os dados da fatura manualmente</p>
                    </div>
                  </div>
                )}
                {newInvoiceStep === "upload" && (
                  <div className="py-6">
                    <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={handleInvoiceFileUpload} data-testid="input-invoice-file" />
                      <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4"><Upload className="w-8 h-8" /></div>
                      <h3 className="font-medium text-lg mb-1">Upload de Documento</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">Envie um PDF, Word ou texto com dados da fatura.</p>
                    </label>
                  </div>
                )}
                {newInvoiceStep === "extracting" && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div><h3 className="font-semibold text-lg">Analisando Documento...</h3><p className="text-muted-foreground text-sm">Extraindo valor, vencimento e dados da fatura.</p></div>
                  </div>
                )}
                {newInvoiceStep === "form" && (
                  <div className="py-4 space-y-4">
                    {invoiceExtracted && (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded border border-green-100 text-sm"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Dados extraídos via IA — revise e confirme</span></div>
                    )}
                    {invoiceError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{invoiceError}</span></div>
                    )}
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Valor</label>
                          <Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} placeholder="0.00" data-testid="input-invoice-amount" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Status</label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={invoiceForm.status} onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })} data-testid="select-invoice-status">
                            <option value="emitida">Emitida</option>
                            <option value="paga">Paga</option>
                            <option value="vencida">Vencida</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Vencimento</label>
                          <Input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} data-testid="input-invoice-due" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Mês Referência</label>
                          <Input value={invoiceForm.referenceMonth} onChange={(e) => setInvoiceForm({ ...invoiceForm, referenceMonth: e.target.value })} placeholder="Ex: 01/2026" data-testid="input-invoice-month" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {newInvoiceStep === "form" ? (
                    <>
                      <Button variant="outline" onClick={resetInvoiceDialog}>Voltar</Button>
                      <Button onClick={handleSaveInvoice} disabled={invoiceSaving} data-testid="btn-confirm-invoice">
                        {invoiceSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Confirmar
                      </Button>
                    </>
                  ) : newInvoiceStep === "upload" ? (
                    <Button variant="outline" onClick={resetInvoiceDialog}>Voltar</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setShowNewInvoiceDialog(false)}>Cancelar</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Faturado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoicesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(totalInvoiced)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{invoicesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(totalPaid)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em Aberto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{invoicesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatCurrency(totalOpen)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border bg-card shadow-sm mt-4">
            {invoicesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices && invoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Mês Ref.</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice: any) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">{invoice.invoiceNumber || `FAT-${invoice.id}`}</TableCell>
                      <TableCell>{invoice.referenceMonth || "—"}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(Number(invoice.amount || 0))}</TableCell>
                      <TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</TableCell>
                      <TableCell>{getInvoiceStatusBadge(invoice.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <DollarSign className="w-10 h-10 mb-3" />
                <p className="font-medium">Nenhuma fatura encontrada</p>
                <p className="text-sm mt-1">As faturas deste cliente aparecerão aqui.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="docs" data-testid="tab-docs">
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Análise de Documento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {docAnalyzing ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Analisando documento com IA...</p>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer" data-testid="doc-upload-area">
                      <input
                        type="file"
                        className="hidden"
                        accept=".txt,.pdf,.doc,.docx,.jpg,.jpeg,.png"
                        data-testid="input-doc-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setDocAnalyzing(true);
                          setDocAnalysis("");
                          setDocError("");
                          try {
                            const isBinary = /\.(pdf|doc|docx|jpg|jpeg|png)$/i.test(file.name);
                            if (isBinary) {
                              const arrayBuffer = await file.arrayBuffer();
                              const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), b => String.fromCharCode(b)).join(''));
                              const result = await fetch("/api/ai/extract-text", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                                credentials: "include",
                                body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
                              });
                              if (result.ok) {
                                const data = await result.json();
                                if (data.analysis) {
                                  setDocAnalysis(data.analysis);
                                } else if (data.text) {
                                  setDocAnalysis(data.text);
                                } else {
                                  setDocError("Não foi possível extrair texto do arquivo.");
                                }
                              } else {
                                setDocError("Erro ao processar o arquivo.");
                              }
                            } else {
                              const text = await file.text();
                              if (!text || text.length < 10) {
                                setDocError("O arquivo está vazio ou com conteúdo insuficiente.");
                              } else {
                                const result = await fetch("/api/ai/extract", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                                  credentials: "include",
                                  body: JSON.stringify({ documentContent: text.substring(0, 8000), extractionType: "contract" }),
                                });
                                if (result.ok) {
                                  const data = await result.json();
                                  setDocAnalysis(typeof data === "string" ? data : JSON.stringify(data, null, 2));
                                } else {
                                  setDocError("Erro ao analisar o documento.");
                                }
                              }
                            }
                          } catch {
                            setDocError("Erro inesperado ao processar o arquivo.");
                          }
                          setDocAnalyzing(false);
                          e.target.value = "";
                        }}
                      />
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="font-medium text-sm">Envie um documento para análise</p>
                      <p className="text-xs text-muted-foreground mt-1">.txt, .pdf, .doc, .docx, .jpg, .jpeg, .png</p>
                    </label>
                  )}
                  {docError && (
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded border border-amber-100 text-sm" data-testid="doc-error">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{docError}</span>
                    </div>
                  )}
                  {docAnalysis && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2" data-testid="doc-analysis-result">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        Análise concluída
                      </div>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {docAnalysis}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Pen className="w-5 h-5" />
                    Gerar Petição
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cases && cases.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Selecione o processo</label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                          value={selectedCaseForPetition}
                          onChange={(e) => setSelectedCaseForPetition(e.target.value)}
                          data-testid="select-case-petition"
                        >
                          <option value="">Escolha um processo...</option>
                          {cases.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.caseNumber} - {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        className="w-full gap-2"
                        disabled={!selectedCaseForPetition}
                        data-testid="btn-gerar-peticao"
                        onClick={() => {
                          const selected = cases.find((c: any) => String(c.id) === selectedCaseForPetition);
                          if (selected) {
                            navigate(`/studio?processo=${encodeURIComponent(selected.caseNumber)}&caseId=${selected.id}&clientId=${clientId}`);
                          }
                        }}
                      >
                        <Pen className="w-4 h-4" />
                        Gerar Petição no LexAI Studio
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                      <Scale className="w-8 h-8 mb-2" />
                      <p className="text-sm font-medium">Nenhum processo encontrado</p>
                      <p className="text-xs mt-1">Cadastre um processo para gerar petições.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Peças Geradas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cases && cases.length > 0 ? (
                  <DocsAIPiecesList cases={cases} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <FileText className="w-10 h-10 mb-3" />
                    <p className="font-medium">Nenhuma peça gerada</p>
                    <p className="text-sm mt-1">As peças geradas pelo LexAI Studio aparecerão aqui.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <ArchivedDocsList clientId={clientId} />
          </div>
        </TabsContent>

        <TabsContent value="relatorios" data-testid="tab-relatorios">
          <div className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Gerar Relatório</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo de Relatório</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    data-testid="select-report-type"
                  >
                    <option value="geral">Relatório Geral do Cliente</option>
                    <option value="processos">Relatório de Processos</option>
                    <option value="financeiro">Relatório Financeiro</option>
                    <option value="contratos">Relatório de Contratos</option>
                    <option value="prazos">Relatório de Prazos e Alertas</option>
                    <option value="custom">Relatório Personalizado</option>
                  </select>
                </div>
                {reportType === "custom" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descreva o relatório desejado</label>
                    <Textarea
                      value={customReportPrompt}
                      onChange={(e) => setCustomReportPrompt(e.target.value)}
                      placeholder="Descreva o que você deseja no relatório..."
                      data-testid="input-custom-report"
                    />
                  </div>
                )}
                <Button
                  onClick={generateReport}
                  disabled={isGeneratingReport || (reportType === "custom" && !customReportPrompt.trim())}
                  className="gap-2"
                  data-testid="btn-generate-report"
                >
                  {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                  Gerar Relatório
                </Button>
              </CardContent>
            </Card>

            {generatedReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Relatório Gerado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm" data-testid="text-generated-report">
                    {generatedReport}
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Baixar Relatório</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={handleDownloadWord}
                        disabled={isExportingWord}
                        data-testid="btn-download-word"
                      >
                        {isExportingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Baixar Word
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={handleDownloadPdf}
                        disabled={isExportingPdf}
                        data-testid="btn-download-pdf"
                      >
                        {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Baixar PDF
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Compartilhar</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="gap-2 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        onClick={() => {
                          setWhatsappMessage(generatedReport);
                          setWhatsappNumber(client.phone?.replace(/\D/g, "") || "");
                          setWhatsappSent(false);
                          setShowWhatsAppPanel(true);
                        }}
                        data-testid="btn-share-whatsapp"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Enviar por WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => window.open("https://accounts.zoho.com/signin?servicename=VirtualOffice&signupurl=https://www.zoho.com/mail/zohomail-pricing.html&serviceurl=https://mail.zoho.com", "zoho_mail_lexai", "width=1100,height=700,left=150,top=80,toolbar=no,menubar=no,scrollbars=yes,resizable=yes")}
                        data-testid="btn-share-email"
                      >
                        <Mail className="w-4 h-4" />
                        Enviar por E-mail
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {showWhatsAppPanel && (
              <Card className="border-green-200 shadow-lg" data-testid="whatsapp-panel">
                <CardHeader className="bg-green-600 text-white rounded-t-lg py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5" />
                      <CardTitle className="text-base text-white">WhatsApp - Enviar Relatório</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-green-700 h-7 w-7 p-0"
                      onClick={() => setShowWhatsAppPanel(false)}
                      data-testid="btn-close-whatsapp"
                    >
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {!whatsappSent ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Número do destinatário</label>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1 px-3 bg-muted rounded-md border text-sm font-medium min-w-[70px]">
                            🇧🇷 +55
                          </div>
                          <Input
                            value={whatsappNumber}
                            onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ""))}
                            placeholder="11999998888"
                            className="flex-1"
                            maxLength={11}
                            data-testid="input-whatsapp-number"
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">DDD + número (ex: 61999998888)</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Mensagem</label>
                        <div className="border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                          <Textarea
                            value={whatsappMessage}
                            onChange={(e) => setWhatsappMessage(e.target.value)}
                            className="min-h-[120px] text-xs border-0 bg-transparent resize-none"
                            data-testid="textarea-whatsapp-message"
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{whatsappMessage.length} caracteres</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
                          disabled={!whatsappNumber || whatsappNumber.length < 10}
                          onClick={() => {
                            const fullNumber = `55${whatsappNumber}`;
                            const encodedMessage = encodeURIComponent(whatsappMessage);
                            const whatsappUrl = `https://web.whatsapp.com/send?phone=${fullNumber}&text=${encodedMessage}`;
                            const wppWindow = window.open(whatsappUrl, "whatsapp_lexai", "width=1000,height=700,left=200,top=100,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
                            if (wppWindow) {
                              setWhatsappSent(true);
                            }
                          }}
                          data-testid="btn-send-whatsapp"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Abrir WhatsApp e Enviar
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowWhatsAppPanel(false)}
                          data-testid="btn-cancel-whatsapp"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-green-700">WhatsApp aberto!</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          O WhatsApp Web foi aberto em uma nova janela com a mensagem pronta. Confirme o envio lá.
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 bg-green-50 text-green-700 border-green-200"
                          onClick={() => {
                            const fullNumber = `55${whatsappNumber}`;
                            const encodedMessage = encodeURIComponent(whatsappMessage);
                            window.open(`https://web.whatsapp.com/send?phone=${fullNumber}&text=${encodedMessage}`, "whatsapp_lexai", "width=1000,height=700,left=200,top=100,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
                          }}
                          data-testid="btn-reopen-whatsapp"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Reabrir WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setWhatsappSent(false);
                            setWhatsappNumber("");
                            setShowWhatsAppPanel(false);
                          }}
                          data-testid="btn-done-whatsapp"
                        >
                          Concluído
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alertas" data-testid="tab-alertas">
          <div className="rounded-md border bg-card shadow-sm mt-4">
            {deadlinesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : deadlines && deadlines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Processo</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadlines.map((deadline: any) => (
                    <TableRow key={deadline.id} className={getDeadlineColor(deadline.dueDate)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {new Date(deadline.dueDate) < new Date() && <AlertTriangle className="w-4 h-4 text-red-500" />}
                          {formatDate(deadline.dueDate)}
                        </div>
                      </TableCell>
                      <TableCell>{deadline.title}</TableCell>
                      <TableCell className="font-mono text-sm">{deadline.caseNumber || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={deadline.priority === "urgente" ? "destructive" : "secondary"} className="capitalize">
                          {deadline.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {deadline.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Bell className="w-10 h-10 mb-3" />
                <p className="font-medium">Nenhum alerta encontrado</p>
                <p className="text-sm mt-1">Os prazos e alertas deste cliente aparecerão aqui.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="estrategico" data-testid="tab-estrategico">
          <div className="space-y-6 mt-4">

            {(() => {
              const allCases = cases || [];
              const allContracts = contracts || [];
              const allInvoices = invoices || [];
              const allDeadlines = deadlines || [];

              const normalizeStatus = (s: string) => (s || "").toLowerCase().replace(/_/g, " ").trim();
              const activeCases = allCases.filter((c: any) => {
                const s = normalizeStatus(c.status);
                return s === "ativo" || s === "em andamento";
              });
              const closedCases = allCases.filter((c: any) => ["ganho", "favorável", "perdido", "arquivado"].includes(normalizeStatus(c.status)));
              const wonCases = allCases.filter((c: any) => normalizeStatus(c.status) === "ganho" || normalizeStatus(c.status) === "favorável");
              const successRate = closedCases.length > 0 ? Math.round((wonCases.length / closedCases.length) * 100) : 0;
              const totalDisputeValue = activeCases.reduce((sum: number, c: any) => sum + (Number(c.value) || Number(c.estimatedValue) || 0), 0);
              const activeContracts = allContracts.filter((c: any) => c.status === "ativo");

              const statusGroups: { label: string; statuses: string[]; color: string; bgColor: string }[] = [
                { label: "Ativo", statuses: ["ativo"], color: "bg-blue-500", bgColor: "bg-blue-100" },
                { label: "Em Andamento", statuses: ["em andamento"], color: "bg-amber-500", bgColor: "bg-amber-100" },
                { label: "Ganho/Favorável", statuses: ["ganho", "favorável"], color: "bg-green-500", bgColor: "bg-green-100" },
                { label: "Perdido", statuses: ["perdido"], color: "bg-red-500", bgColor: "bg-red-100" },
                { label: "Arquivado", statuses: ["arquivado"], color: "bg-gray-400", bgColor: "bg-gray-100" },
              ];

              const totalFaturado = allInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
              const totalRecebido = allInvoices.filter((inv: any) => inv.status === "pago").reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
              const totalPendente = allInvoices.filter((inv: any) => inv.status === "pendente" || inv.status === "em aberto").reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);
              const valorMensalTotal = activeContracts.reduce((sum: number, c: any) => sum + (Number(c.monthlyValue) || 0), 0);
              const receitaAnual = valorMensalTotal * 12;

              const contractTypeCount: Record<string, number> = {};
              allContracts.forEach((c: any) => {
                const t = c.type || "outros";
                contractTypeCount[t] = (contractTypeCount[t] || 0) + 1;
              });

              const now = new Date();
              const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

              const caseDeadlineMap: Record<number, Date[]> = {};
              allDeadlines.filter((d: any) => d.status !== "concluido" && d.status !== "concluída").forEach((d: any) => {
                const dDate = new Date(d.date || d.dueDate);
                if (dDate >= now) {
                  const cId = d.caseId;
                  if (cId) {
                    if (!caseDeadlineMap[cId]) caseDeadlineMap[cId] = [];
                    caseDeadlineMap[cId].push(dDate);
                  }
                }
              });

              const highRisk: any[] = [];
              const mediumRisk: any[] = [];
              const lowRisk: any[] = [];

              activeCases.forEach((c: any) => {
                const caseType = (c.type || c.caseType || "").toLowerCase();
                const hasUrgentDeadline = (caseDeadlineMap[c.id] || []).some((d: Date) => d <= in7Days);
                const hasNearDeadline = (caseDeadlineMap[c.id] || []).some((d: Date) => d <= in30Days);
                const caseValue = Number(c.value) || Number(c.estimatedValue) || 0;

                if (hasUrgentDeadline || caseType.includes("execução") || caseType.includes("execucao") || caseType.includes("criminal")) {
                  highRisk.push(c);
                } else if (hasNearDeadline || caseValue > 100000) {
                  mediumRisk.push(c);
                } else {
                  lowRisk.push(c);
                }
              });

              const upcomingDeadlines = allDeadlines
                .filter((d: any) => {
                  const dDate = new Date(d.date || d.dueDate);
                  return dDate >= now && d.status !== "concluido" && d.status !== "concluída";
                })
                .sort((a: any, b: any) => new Date(a.date || a.dueDate).getTime() - new Date(b.date || b.dueDate).getTime())
                .slice(0, 5);

              const getUrgencyColor = (dateStr: string) => {
                const diff = Math.ceil((new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diff <= 3) return "bg-red-500";
                if (diff <= 7) return "bg-orange-500";
                if (diff <= 15) return "bg-yellow-500";
                return "bg-gray-400";
              };

              const getUrgencyText = (dateStr: string) => {
                const diff = Math.ceil((new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diff <= 0) return "Hoje";
                if (diff === 1) return "Amanhã";
                return `${diff} dias`;
              };

              const handleGenerateStrategy = async () => {
                setIsGeneratingStrategy(true);
                setStrategicAnalysis("");
                try {
                  const res = await fetch("/api/ai/strategic-analysis", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                    credentials: "include",
                    body: JSON.stringify({ clientId }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setStrategicAnalysis(data.content || data.analysis || JSON.stringify(data));
                  } else {
                    setStrategicAnalysis("Erro ao gerar análise estratégica. Tente novamente.");
                  }
                } catch {
                  setStrategicAnalysis("Erro ao gerar análise estratégica. Tente novamente.");
                } finally {
                  setIsGeneratingStrategy(false);
                }
              };

              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="section-kpi">
                    <Card data-testid="card-kpi-total-cases">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Processos</p>
                            <p className="text-3xl font-bold mt-1">{allCases.length}</p>
                            <p className="text-xs text-muted-foreground mt-1">{activeCases.length} ativos</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Scale className="w-6 h-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-kpi-success-rate">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Taxa de Êxito</p>
                            <p className={`text-3xl font-bold mt-1 ${successRate > 60 ? "text-green-600" : "text-foreground"}`}>{successRate}%</p>
                            <p className="text-xs text-muted-foreground mt-1">{wonCases.length} de {closedCases.length} encerrados</p>
                          </div>
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${successRate > 60 ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}>
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-kpi-dispute-value">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Valor em Disputa</p>
                            <p className="text-2xl font-bold mt-1">{formatCurrency(totalDisputeValue)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{activeCases.length} processos ativos</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <DollarSign className="w-6 h-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-kpi-active-contracts">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Contratos Ativos</p>
                            <p className="text-3xl font-bold mt-1">{activeContracts.length}</p>
                            <p className="text-xs text-muted-foreground mt-1">{allContracts.length} total</p>
                          </div>
                          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card data-testid="card-case-overview">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          Panorama de Processos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {statusGroups.map((group) => {
                            const count = allCases.filter((c: any) => group.statuses.includes(normalizeStatus(c.status))).length;
                            const pct = allCases.length > 0 ? Math.round((count / allCases.length) * 100) : 0;
                            return (
                              <div key={group.label} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span>{group.label}</span>
                                  <span className="text-muted-foreground">{count} ({pct}%)</span>
                                </div>
                                <div className={`w-full h-2.5 rounded-full ${group.bgColor}`}>
                                  <div className={`h-2.5 rounded-full ${group.color} transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {activeCases.length > 0 && (
                          <div className="mt-6 pt-4 border-t">
                            <p className="text-sm font-medium mb-3">Processos ativos recentes</p>
                            <div className="space-y-2">
                              {activeCases.slice(0, 3).map((c: any) => (
                                <div key={c.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{c.title || c.caseNumber}</p>
                                    <p className="text-xs text-muted-foreground">{c.court || "—"}</p>
                                  </div>
                                  {(c.value || c.estimatedValue) && (
                                    <span className="text-xs font-mono text-muted-foreground ml-2 shrink-0">{formatCurrency(Number(c.value) || Number(c.estimatedValue) || 0)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card data-testid="card-financial-analysis">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="w-5 h-5" />
                          Análise Financeira
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-sm font-semibold mb-3">Receitas</p>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Total faturado</span>
                                <span className="text-sm font-medium">{formatCurrency(totalFaturado)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500" />
                                  <span className="text-sm text-muted-foreground">Recebido</span>
                                </div>
                                <span className="text-sm font-medium text-green-600">{formatCurrency(totalRecebido)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                                  <span className="text-sm text-muted-foreground">Pendente</span>
                                </div>
                                <span className="text-sm font-medium text-orange-600">{formatCurrency(totalPendente)}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-semibold mb-3">Contratos</p>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Valor mensal</span>
                                <span className="text-sm font-medium">{formatCurrency(valorMensalTotal)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Receita anual projetada</span>
                                <span className="text-sm font-medium">{formatCurrency(receitaAnual)}</span>
                              </div>
                              {Object.entries(contractTypeCount).length > 0 && (
                                <div className="pt-2 border-t space-y-1">
                                  {Object.entries(contractTypeCount).map(([type, count]) => (
                                    <div key={type} className="flex items-center justify-between text-xs">
                                      <span className="capitalize text-muted-foreground">{type}</span>
                                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card data-testid="card-risk-map">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="w-5 h-5" />
                          Mapa de Riscos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {highRisk.length === 0 && mediumRisk.length === 0 && lowRisk.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhum processo ativo para classificar</p>
                        ) : (
                          <div className="space-y-4">
                            {highRisk.length > 0 && (
                              <div data-testid="section-risk-high">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-1.5 h-4 rounded bg-red-500" />
                                  <span className="text-sm font-semibold text-red-700">Alto Risco ({highRisk.length})</span>
                                </div>
                                <div className="space-y-2 ml-4">
                                  {highRisk.map((c: any) => (
                                    <div key={c.id} className="border-l-2 border-red-300 pl-3 py-1">
                                      <p className="text-sm font-medium">{c.title || c.caseNumber}</p>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                        {c.caseNumber && <span>{c.caseNumber}</span>}
                                        {c.court && <span>{c.court}</span>}
                                        {(c.value || c.estimatedValue) && <span>{formatCurrency(Number(c.value) || Number(c.estimatedValue) || 0)}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {mediumRisk.length > 0 && (
                              <div data-testid="section-risk-medium">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-1.5 h-4 rounded bg-amber-500" />
                                  <span className="text-sm font-semibold text-amber-700">Médio Risco ({mediumRisk.length})</span>
                                </div>
                                <div className="space-y-2 ml-4">
                                  {mediumRisk.map((c: any) => (
                                    <div key={c.id} className="border-l-2 border-amber-300 pl-3 py-1">
                                      <p className="text-sm font-medium">{c.title || c.caseNumber}</p>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                        {c.caseNumber && <span>{c.caseNumber}</span>}
                                        {c.court && <span>{c.court}</span>}
                                        {(c.value || c.estimatedValue) && <span>{formatCurrency(Number(c.value) || Number(c.estimatedValue) || 0)}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {lowRisk.length > 0 && (
                              <div data-testid="section-risk-low">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-1.5 h-4 rounded bg-green-500" />
                                  <span className="text-sm font-semibold text-green-700">Baixo Risco ({lowRisk.length})</span>
                                </div>
                                <div className="space-y-2 ml-4">
                                  {lowRisk.map((c: any) => (
                                    <div key={c.id} className="border-l-2 border-green-300 pl-3 py-1">
                                      <p className="text-sm font-medium">{c.title || c.caseNumber}</p>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                        {c.caseNumber && <span>{c.caseNumber}</span>}
                                        {c.court && <span>{c.court}</span>}
                                        {(c.value || c.estimatedValue) && <span>{formatCurrency(Number(c.value) || Number(c.estimatedValue) || 0)}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card data-testid="card-critical-deadlines">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Clock className="w-5 h-5" />
                          Prazos Críticos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {upcomingDeadlines.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Nenhum prazo próximo</p>
                        ) : (
                          <div className="space-y-3">
                            {upcomingDeadlines.map((d: any, idx: number) => {
                              const dateStr = d.date || d.dueDate;
                              const associatedCase = allCases.find((c: any) => c.id === d.caseId);
                              return (
                                <div key={d.id || idx} className="flex items-start gap-3" data-testid={`deadline-item-${idx}`}>
                                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getUrgencyColor(dateStr)}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium truncate">{d.title}</p>
                                      <Badge variant="outline" className="text-xs ml-2 shrink-0">{getUrgencyText(dateStr)}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                      <span>{formatDate(dateStr)}</span>
                                      {associatedCase && <span>• {associatedCase.title || associatedCase.caseNumber}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card data-testid="card-ai-recommendations">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Recomendações IA
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!strategicAnalysis && !isGeneratingStrategy && (
                        <div className="flex flex-col items-center py-6">
                          <p className="text-sm text-muted-foreground mb-4 text-center">
                            Gere uma análise estratégica completa baseada nos dados deste cliente.
                          </p>
                          <Button onClick={handleGenerateStrategy} className="gap-2" data-testid="btn-generate-strategy">
                            <Brain className="w-4 h-4" />
                            Gerar Análise Estratégica
                          </Button>
                        </div>
                      )}
                      {isGeneratingStrategy && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Gerando análise estratégica...</p>
                        </div>
                      )}
                      {strategicAnalysis && !isGeneratingStrategy && (
                        <div>
                          <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap" data-testid="text-strategic-analysis">
                            {strategicAnalysis}
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button variant="outline" size="sm" onClick={handleGenerateStrategy} className="gap-2" data-testid="btn-regenerate-strategy">
                              <Zap className="w-4 h-4" />
                              Gerar Novamente
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}

          </div>
        </TabsContent>

        <TabsContent value="negociacoes" data-testid="tab-negociacoes">
          {(() => {
            const statusColors: Record<string, string> = {
              rascunho: "bg-gray-100 text-gray-700",
              em_andamento: "bg-blue-100 text-blue-700",
              proposta_enviada: "bg-yellow-100 text-yellow-700",
              acordo_fechado: "bg-green-100 text-green-700",
              recusado: "bg-red-100 text-red-700",
            };

            const statusLabels: Record<string, string> = {
              rascunho: "Rascunho",
              em_andamento: "Em Andamento",
              proposta_enviada: "Proposta Enviada",
              acordo_fechado: "Acordo Fechado",
              recusado: "Recusado",
            };

            return (
              <div className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold" data-testid="text-negociacoes-title">Negociações do Cliente</h3>
                  <Button
                    className="gap-2"
                    onClick={() => navigate("/negotiations")}
                    data-testid="btn-nova-negociacao"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Negociação
                  </Button>
                </div>

                {negotiationsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !negotiations || negotiations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground" data-testid="empty-negociacoes">
                    <Handshake className="w-10 h-10 mb-3" />
                    <p className="font-medium">Nenhuma negociação encontrada</p>
                    <p className="text-sm mt-1">Crie uma nova negociação para este cliente.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {negotiations.map((neg: any) => (
                      <Card key={neg.id} className="hover:shadow-md transition-shadow" data-testid={`card-negotiation-${neg.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[neg.status] || "bg-gray-100 text-gray-700"}`} data-testid={`badge-status-${neg.id}`}>
                                  {statusLabels[neg.status] || neg.status}
                                </span>
                                {neg.aiRiskScore != null && (
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-risk-${neg.id}`}>
                                    Risco IA: {neg.aiRiskScore}%
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                {(neg.minValue != null || neg.maxValue != null) && (
                                  <span data-testid={`text-range-${neg.id}`}>
                                    Faixa: {neg.minValue != null ? formatCurrency(Number(neg.minValue)) : "—"} - {neg.maxValue != null ? formatCurrency(Number(neg.maxValue)) : "—"}
                                  </span>
                                )}
                                {neg.currentProposalValue != null && (
                                  <span data-testid={`text-proposal-${neg.id}`}>
                                    Proposta: {formatCurrency(Number(neg.currentProposalValue))}
                                  </span>
                                )}
                                {neg.deadline && (
                                  <span data-testid={`text-deadline-${neg.id}`}>
                                    Prazo: {formatDate(neg.deadline)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate("/negotiations")}
                              data-testid={`btn-ver-detalhes-${neg.id}`}
                            >
                              Ver Detalhes
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={showDebtorDialog} onOpenChange={(open) => { setShowDebtorDialog(open); if (!open) { setEditingDebtor(null); setDebtorForm({ type: "PF", name: "", document: "", email: "", phone: "", whatsapp: "", address: "", city: "", state: "", zipCode: "", notes: "", totalDebt: "" }); setDebtorUploadStep("choose"); setDebtorExtracted(false); setDebtorExtractError(""); setDebtorPasteText(""); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDebtor ? "Editar Devedor" : "Novo Devedor"}</DialogTitle>
            <DialogDescription>{editingDebtor ? "Edite os dados do devedor." : "Cadastre um novo devedor para este cliente."}</DialogDescription>
          </DialogHeader>

          {!editingDebtor && debtorUploadStep === "choose" && (
            <div className="py-6 grid grid-cols-3 gap-4">
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff" onChange={handleDebtorFileUpload} data-testid="input-debtor-file-upload" />
                <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary hover:bg-primary/5 transition-colors h-full flex flex-col items-center justify-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <h3 className="font-medium mb-1 text-sm">Upload Inteligente</h3>
                  <p className="text-xs text-muted-foreground">PDF, Word, Imagem</p>
                  <p className="text-xs text-muted-foreground mt-1">IA extrai os dados</p>
                </div>
              </label>
              <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer h-full flex flex-col items-center justify-center" onClick={() => { setDebtorPasteText(""); setDebtorUploadStep("paste"); }} data-testid="btn-debtor-paste">
                <FileText className="w-8 h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-medium mb-1 text-sm">Colar Texto</h3>
                <p className="text-xs text-muted-foreground">Cole as informações</p>
                <p className="text-xs text-muted-foreground mt-1">IA preenche tudo</p>
              </div>
              <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer h-full flex flex-col items-center justify-center" onClick={() => setDebtorUploadStep("form")} data-testid="btn-debtor-manual">
                <Pen className="w-8 h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-medium mb-1 text-sm">Cadastro Manual</h3>
                <p className="text-xs text-muted-foreground">Preencha manualmente</p>
              </div>
            </div>
          )}

          {!editingDebtor && debtorUploadStep === "paste" && (
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">Cole abaixo as informações do devedor (nome, CPF, endereço, telefone, etc.) em qualquer formato. A IA irá extrair e preencher os dados automaticamente.</p>
              <Textarea value={debtorPasteText} onChange={(e) => setDebtorPasteText(e.target.value)} placeholder="Cole aqui os dados do devedor..." className="min-h-[150px]" data-testid="textarea-debtor-paste" />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDebtorUploadStep("choose")} data-testid="btn-paste-back">Voltar</Button>
                <Button onClick={handleDebtorPasteExtract} disabled={debtorPasteExtracting || !debtorPasteText.trim()} data-testid="btn-paste-extract">
                  {debtorPasteExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
                  Extrair Dados
                </Button>
              </div>
            </div>
          )}

          {!editingDebtor && debtorUploadStep === "extracting" && (
            <div className="py-12 flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium">Extraindo dados com IA...</p>
              <p className="text-xs text-muted-foreground mt-1">Analisando o documento enviado</p>
            </div>
          )}

          {(editingDebtor || debtorUploadStep === "form") && (<>
          <div className="py-4 space-y-4">
            {debtorExtracted && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-300">Dados extraídos por IA. Revise antes de salvar.</span>
              </div>
            )}
            {debtorExtractError && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">{debtorExtractError}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={debtorForm.type} onValueChange={(value) => setDebtorForm({ ...debtorForm, type: value })} data-testid="select-debtor-type">
                  <SelectTrigger data-testid="select-debtor-type-trigger">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{debtorForm.type === "PJ" ? "CNPJ" : "CPF"}</label>
                <Input value={debtorForm.document} onChange={(e) => setDebtorForm({ ...debtorForm, document: e.target.value })} placeholder={debtorForm.type === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"} data-testid="input-debtor-document" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input value={debtorForm.name} onChange={(e) => setDebtorForm({ ...debtorForm, name: e.target.value })} placeholder="Nome completo" data-testid="input-debtor-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input value={debtorForm.email} onChange={(e) => setDebtorForm({ ...debtorForm, email: e.target.value })} placeholder="email@exemplo.com" type="email" data-testid="input-debtor-email" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input value={debtorForm.phone} onChange={(e) => setDebtorForm({ ...debtorForm, phone: e.target.value })} placeholder="(00) 00000-0000" data-testid="input-debtor-phone" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp</label>
                <Input value={debtorForm.whatsapp} onChange={(e) => setDebtorForm({ ...debtorForm, whatsapp: e.target.value })} placeholder="(00) 00000-0000" data-testid="input-debtor-whatsapp" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Dívida Total</label>
                <Input value={debtorForm.totalDebt} onChange={(e) => setDebtorForm({ ...debtorForm, totalDebt: e.target.value })} placeholder="0,00" data-testid="input-debtor-totaldebt" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Endereço</label>
              <Input value={debtorForm.address} onChange={(e) => setDebtorForm({ ...debtorForm, address: e.target.value })} placeholder="Rua, número, bairro" data-testid="input-debtor-address" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cidade</label>
                <Input value={debtorForm.city} onChange={(e) => setDebtorForm({ ...debtorForm, city: e.target.value })} placeholder="Cidade" data-testid="input-debtor-city" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado</label>
                <Input value={debtorForm.state} onChange={(e) => setDebtorForm({ ...debtorForm, state: e.target.value })} placeholder="UF" data-testid="input-debtor-state" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">CEP</label>
                <Input value={debtorForm.zipCode} onChange={(e) => setDebtorForm({ ...debtorForm, zipCode: e.target.value })} placeholder="00000-000" data-testid="input-debtor-zipcode" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea value={debtorForm.notes} onChange={(e) => setDebtorForm({ ...debtorForm, notes: e.target.value })} placeholder="Observações sobre o devedor..." data-testid="input-debtor-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDebtorDialog(false)} data-testid="btn-cancel-debtor">Cancelar</Button>
            <Button onClick={handleSaveDebtor} disabled={debtorSaving} data-testid="btn-save-debtor">
              {debtorSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingDebtor ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Altere os dados do cliente abaixo.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })} data-testid="select-edit-client-type">
                  <SelectTrigger data-testid="select-edit-client-type-trigger">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })} data-testid="select-edit-client-status">
                  <SelectTrigger data-testid="select-edit-client-status-trigger">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="prospecto">Prospecto</SelectItem>
                    <SelectItem value="arquivado">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome / Razão Social</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nome completo ou razão social"
                data-testid="input-edit-client-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{editForm.type === "PJ" ? "CNPJ" : "CPF"}</label>
              <Input
                value={editForm.document}
                onChange={(e) => setEditForm({ ...editForm, document: e.target.value })}
                placeholder={editForm.type === "PJ" ? "00.000.000/0001-00" : "000.000.000-00"}
                data-testid="input-edit-client-document"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  type="email"
                  data-testid="input-edit-client-email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  data-testid="input-edit-client-phone"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Endereço</label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder="Rua, número, bairro, cidade - UF"
                data-testid="input-edit-client-address"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tom de Comunicação (Secretária IA)</label>
              <Select value={editForm.communicationTone} onValueChange={(v) => setEditForm({ ...editForm, communicationTone: v })} data-testid="select-edit-client-tone">
                <SelectTrigger data-testid="select-edit-client-tone-trigger">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="informal">Informal</SelectItem>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="amigavel">Amigável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas da Secretária</label>
              <Textarea
                value={editForm.secretaryNotes}
                onChange={(e) => setEditForm({ ...editForm, secretaryNotes: e.target.value })}
                placeholder="Instruções especiais para a secretária IA ao interagir com este cliente..."
                className="min-h-[80px]"
                data-testid="input-edit-client-secretary-notes"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Observações gerais, referências, contatos adicionais..."
                className="min-h-[80px]"
                data-testid="input-edit-client-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || !editForm.name} data-testid="btn-save-edit-client">
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DebtorDocumentsSection({ debtorId, clientId, onUpload, onDelete, uploading }: { debtorId: number; clientId: number | undefined; onUpload: (debtorId: number, e: React.ChangeEvent<HTMLInputElement>) => void; onDelete: (docId: number, debtorId: number) => void; uploading: boolean }) {
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportCases, setReportCases] = useState<any[]>([]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["debtor-docs", debtorId],
    queryFn: async () => {
      const res = await fetch(`/api/debtors/${debtorId}/documents`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleGenerateReport = async () => {
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch(`/api/debtors/${debtorId}/case-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        setReportCases(data.cases || []);
      } else {
        setReport("Erro ao gerar relatório. Tente novamente.");
      }
    } catch {
      setReport("Erro ao gerar relatório. Tente novamente.");
    }
    setReportLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documentos do Devedor
          </h4>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.tiff" onChange={(e) => onUpload(debtorId, e)} data-testid={`input-debtor-doc-upload-${debtorId}`} />
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <span>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Anexar Documento
              </span>
            </Button>
          </label>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : docs && docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-background rounded-lg border" data-testid={`debtor-doc-${doc.id}`}>
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.type} · {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ""} · {formatDate(doc.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => window.open(`/api/documents/download/${doc.id}`, "_blank")} data-testid={`btn-download-debtor-doc-${doc.id}`}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(doc.id, debtorId)} data-testid={`btn-delete-debtor-doc-${doc.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum documento anexado</p>
            <p className="text-xs mt-1">Anexe notas promissórias, documentos de cobrança, etc.</p>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Relatório do Processo
          </h4>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleGenerateReport} disabled={reportLoading} data-testid={`btn-report-debtor-${debtorId}`}>
            {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            {reportLoading ? "Gerando..." : report ? "Atualizar Relatório" : "Gerar Relatório"}
          </Button>
        </div>
        {reportLoading && (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando processos e gerando relatório com IA...</p>
          </div>
        )}
        {report && !reportLoading && (
          <div className="bg-background rounded-lg border p-4" data-testid={`debtor-report-${debtorId}`}>
            {reportCases.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {reportCases.map((c: any) => (
                  <Badge key={c.id} variant="outline" className="text-xs font-mono" data-testid={`report-case-badge-${c.id}`}>
                    {c.caseNumber}
                  </Badge>
                ))}
              </div>
            )}
            <div className="prose prose-sm max-w-none dark:prose-invert text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: report.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>').replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>').replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>').replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>').replace(/^---$/gm, '<hr class="my-3"/>').replace(/\n/g, '<br/>') }} />
          </div>
        )}
        {!report && !reportLoading && (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum relatório gerado</p>
            <p className="text-xs mt-1">Clique em "Gerar Relatório" para ver o estado dos processos deste devedor.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DocsAIPiecesList({ cases }: { cases: any[] }) {
  const caseIds = cases.map((c: any) => c.id);
  const { data: allPieces, isLoading } = useQuery({
    queryKey: ["studio", "pieces", "client", ...caseIds],
    queryFn: async () => {
      const results = await Promise.all(
        caseIds.map((id: number) =>
          fetch(`/api/studio/pieces?caseId=${id}`, {
            credentials: "include",
            headers: getAuthHeaders(),
          }).then(r => r.ok ? r.json() : [])
        )
      );
      return results.flat();
    },
    enabled: caseIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allPieces || allPieces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FileText className="w-10 h-10 mb-3" />
        <p className="font-medium">Nenhuma peça gerada</p>
        <p className="text-sm mt-1">As peças geradas pelo LexAI Studio aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allPieces.map((piece: any) => {
        const relatedCase = cases.find((c: any) => c.id === piece.caseId);
        return (
          <div key={piece.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid={`piece-item-${piece.id}`}>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{piece.title}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{piece.pieceType}</Badge>
                {relatedCase && (
                  <span className="text-xs text-muted-foreground truncate">{relatedCase.caseNumber || relatedCase.title}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(piece.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArchivedDocsList({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: archivedDocs, isLoading } = useQuery({
    queryKey: ["archived-docs", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/by-client/${clientId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      return res.ok ? res.json() : [];
    },
  });

  const handleDelete = async () => {
    if (!deleteDocId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteDocId}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["archived-docs", clientId] });
      }
    } catch {}
    setIsDeleting(false);
    setDeleteDocId(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!archivedDocs || archivedDocs.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="w-5 h-5" />
            Documentos Arquivados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {archivedDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors" data-testid={`archived-doc-${doc.id}`}>
                <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{doc.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-BR") : ""}
                    </span>
                  </div>
                </div>
                <a
                  href={`/api/documents/download/${doc.id}`}
                  className="shrink-0 p-2 rounded-md hover:bg-muted transition-colors"
                  title="Baixar documento"
                  data-testid={`download-doc-${doc.id}`}
                >
                  <Download className="w-4 h-4 text-muted-foreground" />
                </a>
                <button
                  onClick={() => setDeleteDocId(doc.id)}
                  className="shrink-0 p-2 rounded-md hover:bg-red-50 transition-colors"
                  title="Excluir documento"
                  data-testid={`delete-doc-${doc.id}`}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ClientsPage() {
  const [match, params] = useRoute("/clients/:id");

  return (
    <DashboardLayout>
      {match && params?.id ? (
        <ClientDetailView clientId={Number(params.id)} />
      ) : (
        <ClientListView />
      )}
    </DashboardLayout>
  );
}
