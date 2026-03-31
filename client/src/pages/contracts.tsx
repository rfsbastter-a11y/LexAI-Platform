import { useState, useMemo, type ChangeEvent } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus,
  FileText,
  DollarSign,
  AlertCircle,
  Loader2,
  Search,
  ArrowUpDown,
  Clock,
  ChevronRight,
  RefreshCcw,
  Upload,
  Pen,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useContracts, useCreateContract, useUpdateContract, useDeleteContract } from "@/hooks/use-contracts";
import { useClients } from "@/hooks/use-clients";
import { Link } from "wouter";
import { Trash2, Edit } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("pt-BR") : "—";

const statusConfig: Record<string, { label: string; color: string }> = {
  ativo: { label: "Ativo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  inativo: { label: "Inativo", color: "bg-gray-100 text-gray-600 border-gray-200" },
  encerrado: { label: "Encerrado", color: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700 border-red-200" },
  suspenso: { label: "Suspenso", color: "bg-amber-100 text-amber-700 border-amber-200" },
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

type SortKey = "clientName" | "type" | "monthlyValue" | "startDate" | "endDate" | "status";
type SortDir = "asc" | "desc";

const emptyForm = {
  clientId: "",
  type: "mensal",
  description: "",
  monthlyValue: "",
  successFeePercent: "",
  adjustmentIndex: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  status: "ativo",
};

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const { data: clients } = useClients();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("clientName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [isAdding, setIsAdding] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "upload" | "extracting" | "form">("choose");
  const [formData, setFormData] = useState({ ...emptyForm });
  const [isExtracted, setIsExtracted] = useState(false);
  const [extractError, setExtractError] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [editingContract, setEditingContract] = useState<any>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const allContracts = contracts || [];
  const activeContracts = allContracts.filter((c: any) => c.status === "ativo");
  const totalMRR = activeContracts.reduce((sum: number, c: any) => sum + (Number(c.monthlyValue) || 0), 0);

  const expiringContracts = allContracts.filter((c: any) => {
    if (!c.endDate || c.status !== "ativo") return false;
    const end = new Date(c.endDate);
    return end >= now && end <= thirtyDays;
  });

  const adjustmentContracts = allContracts.filter((c: any) => {
    if (!c.nextAdjustmentDate || c.status !== "ativo") return false;
    const adj = new Date(c.nextAdjustmentDate);
    const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return adj >= now && adj <= threeMonths;
  });

  const uniqueTypes = useMemo(() => {
    const types = new Set(allContracts.map((c: any) => c.type));
    return Array.from(types).sort();
  }, [allContracts]);

  const filtered = useMemo(() => {
    let result = [...allContracts];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c: any) =>
        (c.clientName || "").toLowerCase().includes(q) ||
        (c.type || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "todos") {
      result = result.filter((c: any) => c.status === statusFilter);
    }

    if (typeFilter !== "todos") {
      result = result.filter((c: any) => c.type === typeFilter);
    }

    result.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "clientName": aVal = (a.clientName || "").toLowerCase(); bVal = (b.clientName || "").toLowerCase(); break;
        case "type": aVal = a.type || ""; bVal = b.type || ""; break;
        case "monthlyValue": aVal = Number(a.monthlyValue) || 0; bVal = Number(b.monthlyValue) || 0; break;
        case "startDate": aVal = a.startDate ? new Date(a.startDate).getTime() : 0; bVal = b.startDate ? new Date(b.startDate).getTime() : 0; break;
        case "endDate": aVal = a.endDate ? new Date(a.endDate).getTime() : Infinity; bVal = b.endDate ? new Date(b.endDate).getTime() : Infinity; break;
        case "status": aVal = a.status; bVal = b.status; break;
        default: aVal = 0; bVal = 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [allContracts, search, statusFilter, typeFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getDaysToExpire = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractError(false);
    setAddStep("extracting");
    try {
      const isText = /\.(txt|csv|text)$/i.test(file.name);
      const isImage = /\.(jpg|jpeg|png)$/i.test(file.name);
      const isBinary = /\.(pdf|doc|docx)$/i.test(file.name);
      let documentContent = "";

      if (isText) {
        documentContent = await file.text();
      } else if (isImage) {
        const base64 = await fileToBase64(file);
        const analyzeRes = await fetch("/api/ai/analyze-file", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ content: "", fileName: file.name, isImage: true, imageBase64: base64 }),
        });
        if (analyzeRes.ok) {
          const data = await analyzeRes.json();
          documentContent = data.content || "";
        }
      } else if (isBinary) {
        const base64 = await fileToBase64(file);
        const extractRes = await fetch("/api/ai/extract-text", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
        });
        if (extractRes.ok) {
          const data = await extractRes.json();
          documentContent = data.text || data.analysis || "";
        }
      }

      if (!documentContent || documentContent.length < 10) {
        setExtractError(true);
        setIsExtracted(false);
        setAddStep("form");
        return;
      }

      const result = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ documentContent: documentContent.substring(0, 8000), extractionType: "contract" }),
      });
      if (result.ok) {
        const extracted = await result.json();
        setFormData({
          clientId: "",
          type: extracted.tipo || extracted.type || "mensal",
          description: extracted.descricao || extracted.description || extracted.objeto || "",
          monthlyValue: extracted.valorMensal || extracted.monthlyValue || extracted.valor || "",
          successFeePercent: extracted.percentualExito || extracted.successFeePercent || "",
          adjustmentIndex: extracted.indiceReajuste || extracted.adjustmentIndex || "",
          startDate: extracted.dataInicio || extracted.startDate || new Date().toISOString().split("T")[0],
          endDate: extracted.dataFim || extracted.endDate || "",
          status: "ativo",
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

  const handleSaveContract = async () => {
    setSaveError("");
    if (!formData.clientId) {
      setSaveError("Selecione um cliente.");
      return;
    }
    if (!formData.type) {
      setSaveError("Selecione o tipo de contrato.");
      return;
    }
    if (!formData.startDate) {
      setSaveError("Informe a data de início.");
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        clientId: Number(formData.clientId),
        type: formData.type,
        description: formData.description || null,
        monthlyValue: formData.monthlyValue ? String(formData.monthlyValue) : null,
        successFeePercent: formData.successFeePercent ? String(formData.successFeePercent) : null,
        adjustmentIndex: formData.adjustmentIndex || null,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        status: formData.status,
        tenantId: 1,
      };
      await createContract.mutateAsync(payload);
      resetDialog();
    } catch (err: any) {
      setSaveError(err?.message || "Erro ao salvar contrato.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetDialog = () => {
    setIsAdding(false);
    setAddStep("choose");
    setFormData({ ...emptyForm });
    setIsExtracted(false);
    setExtractError(false);
    setSaveError("");
  };

  const openEditDialog = (contract: any) => {
    setEditingContract(contract);
    setEditForm({
      clientId: String(contract.clientId || ""),
      type: contract.type || "mensal",
      description: contract.description || "",
      monthlyValue: contract.monthlyValue ? String(contract.monthlyValue) : "",
      successFeePercent: contract.successFeePercent ? String(contract.successFeePercent) : "",
      adjustmentIndex: contract.adjustmentIndex || "",
      startDate: contract.startDate ? new Date(contract.startDate).toISOString().split("T")[0] : "",
      endDate: contract.endDate ? new Date(contract.endDate).toISOString().split("T")[0] : "",
      status: contract.status || "ativo",
    });
    setEditError("");
  };

  const handleEditSave = async () => {
    setEditError("");
    if (!editForm.clientId) {
      setEditError("Selecione um cliente.");
      return;
    }
    setEditSaving(true);
    try {
      const payload: any = {
        clientId: Number(editForm.clientId),
        type: editForm.type,
        description: editForm.description || null,
        monthlyValue: editForm.monthlyValue ? String(editForm.monthlyValue) : null,
        successFeePercent: editForm.successFeePercent ? String(editForm.successFeePercent) : null,
        adjustmentIndex: editForm.adjustmentIndex || null,
        startDate: editForm.startDate ? new Date(editForm.startDate).toISOString() : null,
        endDate: editForm.endDate ? new Date(editForm.endDate).toISOString() : null,
        status: editForm.status,
      };
      await updateContract.mutateAsync({ id: editingContract.id, data: payload });
      setEditingContract(null);
    } catch (err: any) {
      setEditError(err?.message || "Erro ao salvar contrato.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteContract.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Error deleting contract:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      data-testid={`sort-${field}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary" data-testid="text-contracts-title">Contratos</h1>
          <p className="text-muted-foreground mt-1">Gestão centralizada de honorários e contratos.</p>
        </div>
        <Dialog open={isAdding} onOpenChange={(open) => { if (!open) resetDialog(); else setIsAdding(true); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 btn-responsive" data-testid="btn-novo-contrato">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Contrato</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Contrato</DialogTitle>
              <DialogDescription>Escolha como deseja cadastrar o contrato.</DialogDescription>
            </DialogHeader>

            {addStep === "choose" && (
              <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => setAddStep("upload")}
                  data-testid="btn-contract-upload-smart"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h3 className="font-medium mb-1">Upload Inteligente</h3>
                  <p className="text-xs text-muted-foreground">
                    Envie o contrato e a IA extrai os dados automaticamente
                  </p>
                </div>
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => setAddStep("form")}
                  data-testid="btn-contract-manual-form"
                >
                  <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-3">
                    <Pen className="w-7 h-7" />
                  </div>
                  <h3 className="font-medium mb-1">Formulário Manual</h3>
                  <p className="text-xs text-muted-foreground">
                    Preencha os dados do contrato manualmente
                  </p>
                </div>
              </div>
            )}

            {addStep === "upload" && (
              <div className="py-6">
                <label className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer">
                  <input type="file" className="hidden" accept=".txt,.csv,.text,.pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileUpload} data-testid="input-contract-file-upload" />
                  <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">Upload de Contrato</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Envie um arquivo (.txt, .pdf, .doc, .jpg) com o contrato. A IA extrairá tipo, valor, datas e cláusulas automaticamente.
                  </p>
                </label>
              </div>
            )}

            {addStep === "extracting" && (
              <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <div>
                  <h3 className="font-semibold text-lg">Analisando Contrato...</h3>
                  <p className="text-muted-foreground text-sm">Extraindo tipo, valores, datas e cláusulas.</p>
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cliente *</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      data-testid="select-contract-client"
                    >
                      <option value="">Selecione um cliente</option>
                      {(clients || []).map((client: any) => (
                        <option key={client.id} value={client.id}>
                          {client.name} {client.document ? `(${client.document})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo de Contrato *</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        data-testid="select-contract-type"
                      >
                        <option value="mensal">Mensal Fixo</option>
                        <option value="fixo">Fixo</option>
                        <option value="exito">Êxito</option>
                        <option value="misto">Misto</option>
                        <option value="consultivo">Consultivo</option>
                        <option value="contencioso">Contencioso</option>
                        <option value="honorarios">Honorários</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        data-testid="select-contract-status"
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                        <option value="suspenso">Suspenso</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descrição / Objeto</label>
                    <textarea
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Prestação de serviços jurídicos de assessoria..."
                      data-testid="input-contract-description"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Valor Mensal (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.monthlyValue}
                        onChange={(e) => setFormData({ ...formData, monthlyValue: e.target.value })}
                        placeholder="5000.00"
                        data-testid="input-contract-monthly-value"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">% Êxito</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.successFeePercent}
                        onChange={(e) => setFormData({ ...formData, successFeePercent: e.target.value })}
                        placeholder="20"
                        data-testid="input-contract-success-fee"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data Início *</label>
                      <Input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        data-testid="input-contract-start-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data Término</label>
                      <Input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        data-testid="input-contract-end-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Índice Reajuste</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={formData.adjustmentIndex}
                        onChange={(e) => setFormData({ ...formData, adjustmentIndex: e.target.value })}
                        data-testid="select-contract-adjustment"
                      >
                        <option value="">Nenhum</option>
                        <option value="IPCA">IPCA</option>
                        <option value="IPCA-E">IPCA-E</option>
                        <option value="INPC">INPC</option>
                        <option value="IGP-M">IGP-M</option>
                        <option value="Selic">Selic</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {addStep === "form" ? (
                <>
                  <Button variant="outline" onClick={resetDialog} data-testid="btn-contract-cancel">
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveContract} disabled={isSaving} data-testid="btn-contract-save">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Salvar Contrato
                  </Button>
                </>
              ) : addStep === "choose" ? (
                <Button variant="outline" onClick={resetDialog} data-testid="btn-contract-close">
                  Fechar
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mt-6">
        <Card data-testid="card-kpi-mrr">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Receita Mensal</p>
                <h3 className="text-lg sm:text-2xl font-bold truncate" data-testid="text-mrr">
                  {formatCurrency(totalMRR)}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-ativos">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Contratos Ativos</p>
                <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-active-contracts">
                  {activeContracts.length}
                </h3>
                <p className="text-xs text-muted-foreground">{allContracts.length} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-vencendo" className={expiringContracts.length > 0 ? "border-amber-200" : ""}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${expiringContracts.length > 0 ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"}`}>
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Vencendo (30 dias)</p>
                <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-expiring-contracts">
                  {expiringContracts.length}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-reajustes">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <RefreshCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Reajustes (90 dias)</p>
                <h3 className="text-lg sm:text-2xl font-bold" data-testid="text-adjustments">
                  {adjustmentContracts.length}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Renovação */}
      {expiringContracts.length > 0 && (
        <Card className="mt-4 border-amber-200 bg-amber-50/30" data-testid="card-renewal-alerts">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-base">Alertas de Renovação</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringContracts.map((c: any) => {
                const days = getDaysToExpire(c.endDate);
                const urgency = days !== null && days <= 7 ? "text-red-600 bg-red-50 border-red-200" : days !== null && days <= 15 ? "text-orange-600 bg-orange-50 border-orange-200" : "text-amber-600 bg-amber-50 border-amber-200";
                return (
                  <div key={c.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border ${urgency}`} data-testid={`renewal-alert-${c.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.clientName}</p>
                      <p className="text-xs opacity-75">{typeLabels[c.type] || c.type} · {formatCurrency(Number(c.monthlyValue) || 0)}/mês</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs whitespace-nowrap">{days} dias restantes</Badge>
                      <Link href={`/clients/${c.clientId}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2" data-testid={`btn-ver-cliente-${c.id}`}>
                          Ver cliente <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, tipo ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-contracts"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
            data-testid="select-status-filter"
          >
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="encerrado">Encerrado</option>
            <option value="cancelado">Cancelado</option>
            <option value="suspenso">Suspenso</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
            data-testid="select-type-filter"
          >
            <option value="todos">Todos os tipos</option>
            {uniqueTypes.map(t => (
              <option key={t} value={t}>{typeLabels[t] || t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Contratos */}
      <Card className="mt-4" data-testid="card-contracts-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{search || statusFilter !== "todos" || typeFilter !== "todos" ? "Nenhum contrato encontrado com esses filtros." : "Nenhum contrato cadastrado."}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3"><SortButton label="Cliente" field="clientName" /></th>
                      <th className="text-left p-3"><SortButton label="Tipo" field="type" /></th>
                      <th className="text-left p-3"><SortButton label="Valor" field="monthlyValue" /></th>
                      <th className="text-left p-3"><SortButton label="Início" field="startDate" /></th>
                      <th className="text-left p-3"><SortButton label="Término" field="endDate" /></th>
                      <th className="text-left p-3">Reajuste</th>
                      <th className="text-left p-3"><SortButton label="Status" field="status" /></th>
                      <th className="text-right p-3 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((contract: any) => {
                      const daysToExpire = getDaysToExpire(contract.endDate);
                      const isExpiring = contract.status === "ativo" && daysToExpire !== null && daysToExpire <= 30 && daysToExpire >= 0;
                      const sc = statusConfig[contract.status] || statusConfig.ativo;
                      return (
                        <tr key={contract.id} className={`border-b hover:bg-muted/30 transition-colors ${isExpiring ? "bg-amber-50/30" : ""}`} data-testid={`contract-row-${contract.id}`}>
                          <td className="p-3">
                            <Link href={`/clients/${contract.clientId}`}>
                              <span className="text-sm font-medium text-primary hover:underline cursor-pointer" data-testid={`link-client-${contract.id}`}>
                                {contract.clientName}
                              </span>
                            </Link>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs capitalize">{typeLabels[contract.type] || contract.type}</Badge>
                          </td>
                          <td className="p-3 font-mono text-sm">
                            {contract.monthlyValue
                              ? formatCurrency(Number(contract.monthlyValue))
                              : contract.successFeePercent
                                ? `${contract.successFeePercent}% êxito`
                                : "—"
                            }
                            {contract.monthlyValue && contract.successFeePercent && (
                              <span className="text-xs text-muted-foreground ml-1">+ {contract.successFeePercent}%</span>
                            )}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{formatDate(contract.startDate)}</td>
                          <td className="p-3 text-sm">
                            <span className={isExpiring ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                              {formatDate(contract.endDate)}
                            </span>
                            {isExpiring && (
                              <span className="text-xs text-amber-500 block">{daysToExpire}d restantes</span>
                            )}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {contract.nextAdjustmentDate
                              ? new Date(contract.nextAdjustmentDate).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
                              : "—"
                            }
                            {contract.adjustmentIndex && (
                              <span className="text-xs text-muted-foreground block">{contract.adjustmentIndex}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                          </td>
                          <td className="p-3 text-right pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditDialog(contract)} data-testid={`btn-edit-${contract.id}`}>
                                <Edit className="w-3 h-3 mr-1" /> Editar
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(contract)} data-testid={`btn-delete-${contract.id}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <Link href={`/clients/${contract.clientId}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid={`btn-ver-${contract.id}`}>
                                  <ChevronRight className="w-3 h-3" />
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y">
                {filtered.map((contract: any) => {
                  const daysToExpire = getDaysToExpire(contract.endDate);
                  const isExpiring = contract.status === "ativo" && daysToExpire !== null && daysToExpire <= 30 && daysToExpire >= 0;
                  const sc = statusConfig[contract.status] || statusConfig.ativo;
                  return (
                    <div key={contract.id} className={`p-4 ${isExpiring ? "bg-amber-50/30" : ""}`} data-testid={`contract-card-${contract.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/clients/${contract.clientId}`}>
                            <p className="text-sm font-semibold text-primary hover:underline cursor-pointer truncate">{contract.clientName}</p>
                          </Link>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{typeLabels[contract.type] || contract.type}</Badge>
                            <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold font-mono">
                            {contract.monthlyValue
                              ? formatCurrency(Number(contract.monthlyValue))
                              : contract.successFeePercent
                                ? `${contract.successFeePercent}%`
                                : "—"
                            }
                          </p>
                          {contract.monthlyValue && <p className="text-[10px] text-muted-foreground">/mês</p>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>Início: {formatDate(contract.startDate)}</span>
                          {contract.endDate && (
                            <span className={isExpiring ? "text-amber-600 font-medium" : ""}>
                              Fim: {formatDate(contract.endDate)}
                              {isExpiring && ` (${daysToExpire}d)`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => openEditDialog(contract)} data-testid={`btn-edit-mobile-${contract.id}`}>
                            <Edit className="w-3 h-3 mr-0.5" /> Editar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-red-500" onClick={() => setDeleteTarget(contract)} data-testid={`btn-delete-mobile-${contract.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          <Link href={`/clients/${contract.clientId}`}>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid={`btn-ver-mobile-${contract.id}`}>
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          </Link>
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

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-2" data-testid="text-contracts-count">
          Exibindo {filtered.length} de {allContracts.length} contratos
        </p>
      )}
      <Dialog open={!!editingContract} onOpenChange={(open) => { if (!open) setEditingContract(null); }}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            {editingContract && (<>
            <DialogHeader>
              <DialogTitle>Editar Contrato</DialogTitle>
              <DialogDescription>Altere os dados do contrato de {editingContract.clientName}.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-100 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">{editError}</span>
                </div>
              )}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cliente *</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={editForm.clientId}
                    onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                    data-testid="select-edit-contract-client"
                  >
                    <option value="">Selecione um cliente</option>
                    {(clients || []).map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.name} {client.document ? `(${client.document})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo de Contrato *</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      data-testid="select-edit-contract-type"
                    >
                      <option value="mensal">Mensal Fixo</option>
                      <option value="fixo">Fixo</option>
                      <option value="exito">Êxito</option>
                      <option value="misto">Misto</option>
                      <option value="consultivo">Consultivo</option>
                      <option value="contencioso">Contencioso</option>
                      <option value="honorarios">Honorários</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      data-testid="select-edit-contract-status"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="encerrado">Encerrado</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="suspenso">Suspenso</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Descrição / Objeto</label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    data-testid="input-edit-contract-description"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Valor Mensal (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.monthlyValue}
                      onChange={(e) => setEditForm({ ...editForm, monthlyValue: e.target.value })}
                      data-testid="input-edit-contract-monthly-value"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">% Êxito</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={editForm.successFeePercent}
                      onChange={(e) => setEditForm({ ...editForm, successFeePercent: e.target.value })}
                      data-testid="input-edit-contract-success-fee"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Início</label>
                    <Input
                      type="date"
                      value={editForm.startDate}
                      onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                      data-testid="input-edit-contract-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Término</label>
                    <Input
                      type="date"
                      value={editForm.endDate}
                      onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                      data-testid="input-edit-contract-end-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Índice Reajuste</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={editForm.adjustmentIndex}
                      onChange={(e) => setEditForm({ ...editForm, adjustmentIndex: e.target.value })}
                      data-testid="select-edit-contract-adjustment"
                    >
                      <option value="">Nenhum</option>
                      <option value="IPCA">IPCA</option>
                      <option value="IGP-M">IGP-M</option>
                      <option value="INPC">INPC</option>
                      <option value="Selic">Selic</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingContract(null)} data-testid="btn-edit-contract-cancel">
                Cancelar
              </Button>
              <Button onClick={handleEditSave} disabled={editSaving} data-testid="btn-edit-contract-save">
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Salvar Alterações
              </Button>
            </DialogFooter>
            </>)}
          </DialogContent>
        </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato de <strong>{deleteTarget?.clientName}</strong> ({typeLabels[deleteTarget?.type] || deleteTarget?.type})?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} data-testid="btn-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContract}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
              data-testid="btn-delete-confirm"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
