import { useState, useRef, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, X, Send, Sparkles, FileText, Loader2, History, Save, Settings, Trash2, 
  FileDown, MessageSquare, Search, BookOpen, LayoutTemplate, 
  GraduationCap, Gavel, Check, Upload, Image, FolderOpen, Stamp, 
  ChevronDown, ChevronUp, File, AlertTriangle, Lightbulb, Eye, EyeOff, PanelLeftClose, PanelLeft,
  ExternalLink, Share2, Mic, MicOff, Briefcase, ClipboardList, Maximize2, Minimize2, Calculator,
  Copy, ClipboardCheck, User, Users, Building2, MapPin, Wand2, Undo2, Shield, GripHorizontal
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GeneratedPiece {
  id: number;
  title: string;
  pieceType: string;
  contentHtml: string;
  createdAt: string;
}

interface DocumentTemplate {
  id: number;
  name: string;
  category: string;
  description?: string;
  contentHtml: string;
}


interface SearchResult {
  id: string;
  source: "escavador" | "doctrine" | "web";
  title: string;
  summary: string;
  ementa?: string;
  legalThesis?: string;
  fundamentacao?: string;
  court?: string;
  date?: string;
  caseNumber?: string;
  url?: string;
  relevance: "alta" | "media" | "baixa";
  citationABNT?: string;
  selected?: boolean;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalFound: number;
  sources: string[];
}

interface DocumentSegment {
  type: string;
  text: string;
  selected: boolean;
}

interface UploadedFile {
  id: string;
  name: string;
  data: string;
  type: string;
  extractedText?: string;
  isExtracting?: boolean;
  isReferenceModel?: boolean;
  documents?: DocumentSegment[];
}

interface SystemEntity {
  id: number;
  name: string;
  type: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  entityType: 'client' | 'debtor';
  clientName?: string;
  totalDebt?: string;
  notes?: string;
  contracts?: Array<{ type: string; monthlyValue?: string; status: string }>;
  documentTexts?: string[];
}

interface StudioDraft {
  instructionText: string;
  selectedModel: string;
  generatedHtml: string;
  selectedJurisprudence: SearchResult[];
  selectedDoctrine: SearchResult[];
  processedCaseFacts: string;
  selectedSystemEntities: SystemEntity[];
  caseNotes: Array<{ id: string; text: string; source: 'text' | 'voice'; timestamp: string }>;
  savedAt: string;
}

interface WordTemplateFile {
  name: string;
  data: string;
}

interface ProtocolParteData {
  nome: string | null;
  tipoPessoa: string | null;
  genitora: string | null;
  genitor: string | null;
  sexo: string | null;
  dataNascimento: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  nacionalidade: string | null;
  naturalidadeEstado: string | null;
  naturalidadeMunicipio: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  rg: string | null;
  cep: string | null;
  estado: string | null;
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  email: string | null;
  telefone: string | null;
}

interface ProtocolData {
  dadosIniciais: {
    materia: string;
    jurisdicao: string;
    classeJudicial: string;
  };
  jurisdicoesTJDFT?: string[];
  assunto: {
    sugestao: string | null;
    codigo: string | null;
  };
  poloAtivo: ProtocolParteData[];
  poloPassivo: ProtocolParteData[];
  procurador: {
    nome: string;
    oab: string;
  };
  caracteristicas: {
    justicaGratuita: boolean;
    tutelaAntecipada: boolean;
    valorCausa: string | null;
    segredoJustica: boolean;
    prioridade: string | null;
  };
}

const PIECE_MODELS = [
  { value: "peticao_inicial", label: "Petição Inicial" },
  { value: "acao_monitoria", label: "Ação Monitória" },
  { value: "execucao", label: "Execução de Título Extrajudicial" },
  { value: "cumprimento_sentenca", label: "Cumprimento de Sentença" },
  { value: "contestacao", label: "Contestação" },
  { value: "impugnacao_embargos_execucao", label: "Impugnação aos Embargos à Execução" },
  { value: "impugnacao_embargos_monitoria", label: "Impugnação aos Embargos à Monitória" },
  { value: "contrarrazoes", label: "Contrarrazões" },
  { value: "recurso_apelacao", label: "Recurso de Apelação" },
  { value: "agravo_instrumento", label: "Agravo de Instrumento" },
  { value: "recurso_especial", label: "Recurso Especial" },
  { value: "recurso_extraordinario", label: "Recurso Extraordinário" },
  { value: "habeas_corpus", label: "Habeas Corpus" },
  { value: "mandado_seguranca", label: "Mandado de Segurança" },
  { value: "acordo_extrajudicial", label: "Acordo Extrajudicial" },
  { value: "notificacao_extrajudicial", label: "Notificação Extrajudicial" },
  { value: "pesquisa_sistemas", label: "Pesquisa de Sistemas" },
  { value: "indicacao_enderecos", label: "Indicação de Novos Endereços" },
  { value: "contrato", label: "Contrato" },
  { value: "renegociacao_divida", label: "Renegociação de Dívida" },
  { value: "proposta_acordo", label: "Proposta de Acordo" },
  { value: "termo_acordo", label: "Termo de Acordo/Composição" },
  { value: "outro", label: "Outro" },
];

const TEMPLATE_CATEGORIES = [
  { value: "trabalhista", label: "Trabalhista" },
  { value: "civil", label: "Cível" },
  { value: "familia", label: "Família" },
  { value: "criminal", label: "Criminal" },
  { value: "tributario", label: "Tributário" },
  { value: "empresarial", label: "Empresarial" },
  { value: "administrativo", label: "Administrativo" },
  { value: "contratos", label: "Contratos" },
];

const CALC_INDEX_RATES: Record<string, { monthly: number; label: string }> = {
  "IPCA-E": { monthly: 0.0045, label: "IPCA-E (~5,5% a.a.)" },
  "INPC": { monthly: 0.004, label: "INPC (~4,9% a.a.)" },
  "Selic": { monthly: 0.0083, label: "Selic (~10,4% a.a.)" },
  "TR": { monthly: 0.001, label: "TR (~1,2% a.a.)" },
  "IGP-M": { monthly: 0.005, label: "IGP-M (~6,2% a.a.)" },
  "IPCA": { monthly: 0.0045, label: "IPCA (~5,5% a.a.)" },
};

type ToolTab = 'arquivos' | 'juris' | 'doutrina' | 'modelos' | 'timbrado' | 'calculos' | 'dados' | 'humanizar';

export default function StudioPage() {
  const { user } = useAuth();

  const initialUrlParamsRef = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    return {
      hasCaseId: !!params.get("caseId"),
      hasTemplateType: !!params.get("templateType"),
      hasTab: !!params.get("tab"),
      hasMemoria: !!params.get("memoria"),
      hasMovimentacao: !!params.get("movimentacao"),
    };
  })());

  const [activeTab, setActiveTab] = useState("studio");
  const [selectedPiece, setSelectedPiece] = useState<GeneratedPiece | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    category: "civil",
    description: "",
    contentHtml: "",
  });

  const [isToolboxOpen, setIsToolboxOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>('modelos');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedAttorney, setSelectedAttorney] = useState<string>("pedro");
  const [wordTemplateFile, setWordTemplateFile] = useState<WordTemplateFile | null>(null);
  const [useDefaultLetterhead, setUseDefaultLetterhead] = useState(true);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [instructionText, setInstructionText] = useState("");
  const [pieceTitle, setPieceTitle] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedJurisprudence, setSelectedJurisprudence] = useState<SearchResult[]>([]);
  const [selectedDoctrine, setSelectedDoctrine] = useState<SearchResult[]>([]);

  const [suggestedJurisTerms, setSuggestedJurisTerms] = useState<string[]>([]);
  const [suggestedDoctrineTerms, setSuggestedDoctrineTerms] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSourcesPanel, setShowSourcesPanel] = useState(true);
  
  // Maximize/minimize state
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  
  // Case notes state
  const [showCaseDialog, setShowCaseDialog] = useState(false);
  const [caseNotes, setCaseNotes] = useState<Array<{ id: string; text: string; source: 'text' | 'voice'; timestamp: Date }>>([]);
  const [currentNoteText, setCurrentNoteText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [processedCaseFacts, setProcessedCaseFacts] = useState<string>("");
  const [isProcessingCase, setIsProcessingCase] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [calcType, setCalcType] = useState<'correcao' | 'juros' | 'atualizacao' | 'honorarios'>('correcao');
  const [calcValorOriginal, setCalcValorOriginal] = useState("");
  const [calcDataInicio, setCalcDataInicio] = useState("");
  const [calcDataFim, setCalcDataFim] = useState("");
  const [calcIndice, setCalcIndice] = useState("IPCA");
  const [calcTaxaJuros, setCalcTaxaJuros] = useState("1");
  const [calcPercentualHonorarios, setCalcPercentualHonorarios] = useState("20");
  const [calcTipoHonorarios, setCalcTipoHonorarios] = useState("exito");
  const [calcIncluirMulta, setCalcIncluirMulta] = useState(false);
  const [calcItems, setCalcItems] = useState<Array<{id: string; type: string; label: string; valorOriginal: number; valorTotal: number; details: string; breakdown: string[]}>>([]);

  const [showProtocolChecklist, setShowProtocolChecklist] = useState(false);
  const [protocolData, setProtocolData] = useState<ProtocolData | null>(null);
  const [selectedForum, setSelectedForum] = useState<string>("");
  const [checklistDocTexts, setChecklistDocTexts] = useState<string[]>([]);
  const [checklistDocNames, setChecklistDocNames] = useState<string[]>([]);
  const [isUploadingChecklistDoc, setIsUploadingChecklistDoc] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 80, y: 80 });
  const [popupSize, setPopupSize] = useState({ w: 520, h: 600 });
  const popupDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const checklistFileRef = useRef<HTMLInputElement>(null);
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [humanizeIntensity, setHumanizeIntensity] = useState<string>("moderado");
  const [showHumanizeOptions, setShowHumanizeOptions] = useState(false);
  const [originalHtml, setOriginalHtml] = useState<string>("");
  const [isHumanized, setIsHumanized] = useState(false);
  const [humanizeUploadText, setHumanizeUploadText] = useState<string>("");
  const [isHumanizeUploading, setIsHumanizeUploading] = useState(false);
  const humanizeFileRef = useRef<HTMLInputElement>(null);
  const [isExtractingProtocol, setIsExtractingProtocol] = useState(false);
  const [protocolTab, setProtocolTab] = useState("dados");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [systemSearchQuery, setSystemSearchQuery] = useState("");
  const [systemSearchResults, setSystemSearchResults] = useState<SystemEntity[]>([]);
  const [isSearchingSystem, setIsSearchingSystem] = useState(false);
  const [selectedSystemEntities, setSelectedSystemEntities] = useState<SystemEntity[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wordTemplateFileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: pieces = [], isLoading: piecesLoading } = useQuery<GeneratedPiece[]>({
    queryKey: ["/api/studio/pieces"] as const,
    staleTime: 30000,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ["/api/studio/templates"] as const,
    staleTime: 60000,
  });

  useEffect(() => {
    if (useDefaultLetterhead && !wordTemplateFile) {
      fetch("/api/studio/default-letterhead", { headers: getAuthHeaders(), credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (data.name && data.data) {
            setWordTemplateFile({ name: data.name, data: data.data });
          }
        })
        .catch(err => console.log("Default letterhead not available:", err));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memoria = params.get("memoria");
    if (memoria) {
      setCaseNotes(prev => [...prev, {
        id: `memoria-${Date.now()}`,
        text: memoria,
        source: 'text' as const,
        timestamp: new Date(),
      }]);
      window.history.replaceState({}, '', '/studio');
    }

    const templateParam = params.get("templateType");
    const promptParam = params.get("prompt");
    const clientParam = params.get("clientRef");
    if (templateParam) {
      setSelectedModel(templateParam);
      if (promptParam) setInstructionText(decodeURIComponent(promptParam));
      if (clientParam) {
        setInstructionText(prev => prev ? `${prev}\n\nCliente/Parte: ${decodeURIComponent(clientParam)}` : `Cliente/Parte: ${decodeURIComponent(clientParam)}`);
      }
      window.history.replaceState({}, '', '/studio');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const tabParam = params.get("tab");
    const pieceIdParam = params.get("pieceId");
    if (tabParam === "history") {
      setActiveTab("history");
      if (pieceIdParam) {
        const targetId = parseInt(pieceIdParam);
        const findAndSelect = async () => {
          try {
            const res = await fetch("/api/studio/pieces", {
              headers: getAuthHeaders(),
              credentials: "include",
            });
            if (res.ok) {
              const allPieces = await res.json();
              const found = allPieces.find((p: any) => p.id === targetId);
              if (found) setSelectedPiece(found);
            }
          } catch {}
        };
        findAndSelect();
      }
      window.history.replaceState({}, '', '/studio');
      return;
    }

    const caseId = params.get("caseId");
    const clientId = params.get("clientId");
    const processo = params.get("processo");

    if (!caseId) return;

    const loadCaseContext = async () => {
      try {
        const [caseRes, clientRes] = await Promise.all([
          fetch(`/api/cases/${caseId}`, { headers: getAuthHeaders(), credentials: "include" }),
          clientId ? fetch(`/api/clients/${clientId}`, { headers: getAuthHeaders(), credentials: "include" }) : Promise.resolve(null),
        ]);

        const caseData = caseRes.ok ? await caseRes.json() : null;
        const clientData = clientRes && clientRes.ok ? await clientRes.json() : null;

        if (!caseData) return;

        const caseNumber = processo || caseData.caseNumber || "";

        const lines: string[] = ["CONTEXTO DO CASO:"];
        const addLine = (label: string, value: any) => {
          if (value) lines.push(`${label}: ${value}`);
        };

        addLine("Processo", caseNumber);
        addLine("Título", caseData.title);
        addLine("Tipo", caseData.caseType);
        addLine("Tribunal", caseData.court);
        addLine("Vara/Juiz", caseData.judge);
        addLine("Classe", caseData.caseClass);
        addLine("Assunto", caseData.subject);
        addLine("Status", caseData.status);
        addLine("Valor estimado", caseData.estimatedValue);

        if (clientData) {
          lines.push("");
          lines.push("QUALIFICAÇÃO DO AUTOR:");
          addLine("Nome", clientData.name);
          addLine("Documento (CPF/CNPJ)", clientData.document);
          addLine("Endereço", clientData.address);
        }

        if (caseData.adversePartyName || caseData.adversePartyDocument || caseData.adversePartyAddress || caseData.adversePartyRepresentative || caseData.adversePartyLawyer) {
          lines.push("");
          lines.push("QUALIFICAÇÃO DA PARTE ADVERSA:");
          addLine("Nome", caseData.adversePartyName);
          addLine("Documento", caseData.adversePartyDocument);
          addLine("Endereço", caseData.adversePartyAddress);
          addLine("Representante", caseData.adversePartyRepresentative);
          addLine("Advogado", caseData.adversePartyLawyer);
        }

        const movimentacao = params.get("movimentacao");
        const tipoMov = params.get("tipoMov");
        const dataMov = params.get("dataMov");

        if (movimentacao) {
          lines.push("");
          lines.push("--- MOVIMENTAÇÃO / INTIMAÇÃO ---");
          if (tipoMov) lines.push(`Tipo: ${tipoMov}`);
          if (dataMov) lines.push(`Data: ${dataMov}`);
          lines.push(`Teor: ${movimentacao}`);
          lines.push("---");
          lines.push("");
          lines.push("Gere uma peça processual adequada com base no teor da movimentação acima.");
        }

        const contextText = lines.join("\n");
        setInstructionText(contextText);

        setCaseNotes(prev => [...prev, {
          id: `case-context-${Date.now()}`,
          text: contextText,
          source: 'text' as const,
          timestamp: new Date(),
        }]);

        if (movimentacao) {
          setCaseNotes(prev => [...prev, {
            id: `movimentacao-${Date.now()}`,
            text: `MOVIMENTAÇÃO (${tipoMov || "Geral"} - ${dataMov || ""}):\n${movimentacao}`,
            source: 'text' as const,
            timestamp: new Date(),
          }]);
        }

        const caseType = (caseData.caseType || "").toLowerCase();
        if (caseType.includes("execucao") || caseType.includes("execução")) {
          setSelectedModel("execucao");
        } else if (caseType.includes("criminal") || caseType.includes("penal")) {
          setSelectedModel("habeas_corpus");
        } else if (caseType.includes("trabalhist")) {
          setSelectedModel("peticao_inicial");
        } else {
          setSelectedModel("");
        }

        window.history.replaceState({}, '', '/studio');
      } catch (error) {
        console.error("Error loading case context:", error);
      }
    };

    loadCaseContext();
  }, []);

  const getDraftKey = useCallback(() => {
    const userId = user?.id ?? "anon";
    return `studio_draft_${userId}`;
  }, [user?.id]);

  const draftRestoredRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const { hasCaseId, hasTemplateType, hasTab, hasMemoria, hasMovimentacao } = initialUrlParamsRef.current;
    const hasUrlParams = hasCaseId || hasTemplateType || hasTab || hasMemoria || hasMovimentacao;
    if (hasUrlParams) return;

    try {
      const key = getDraftKey();
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw) as StudioDraft;
      if (draft.instructionText !== undefined) setInstructionText(draft.instructionText);
      if (draft.selectedModel !== undefined) setSelectedModel(draft.selectedModel);
      if (draft.generatedHtml !== undefined) setGeneratedHtml(draft.generatedHtml);
      if (draft.selectedJurisprudence !== undefined) setSelectedJurisprudence(draft.selectedJurisprudence);
      if (draft.selectedDoctrine !== undefined) setSelectedDoctrine(draft.selectedDoctrine);
      if (draft.processedCaseFacts !== undefined) setProcessedCaseFacts(draft.processedCaseFacts);
      if (draft.selectedSystemEntities !== undefined) setSelectedSystemEntities(draft.selectedSystemEntities);
      if (draft.caseNotes !== undefined) {
        setCaseNotes(draft.caseNotes.map(n => ({ ...n, timestamp: new Date(n.timestamp) })));
      }
      if (draft.instructionText || draft.generatedHtml || draft.selectedModel || (draft.caseNotes && draft.caseNotes.length > 0)) {
        setHasDraft(true);
      }
    } catch {}
  }, [user, getDraftKey]);

  useEffect(() => {
    if (!user) return;

    const isDraftable =
      instructionText.trim() ||
      generatedHtml.trim() ||
      selectedModel ||
      selectedJurisprudence.length > 0 ||
      selectedDoctrine.length > 0 ||
      processedCaseFacts.trim() ||
      selectedSystemEntities.length > 0 ||
      caseNotes.length > 0;

    if (!isDraftable) return;

    const buildDraft = (): StudioDraft => ({
      instructionText,
      selectedModel,
      generatedHtml,
      selectedJurisprudence,
      selectedDoctrine,
      processedCaseFacts,
      selectedSystemEntities,
      caseNotes: caseNotes.map(n => ({ ...n, timestamp: n.timestamp instanceof Date ? n.timestamp.toISOString() : String(n.timestamp) })),
      savedAt: new Date().toISOString(),
    });

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(getDraftKey(), JSON.stringify(buildDraft()));
        setDraftSavedAt(new Date());
        setHasDraft(true);
      } catch {}
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        try {
          localStorage.setItem(getDraftKey(), JSON.stringify(buildDraft()));
        } catch {}
      }
    };
  }, [
    user,
    instructionText,
    selectedModel,
    generatedHtml,
    selectedJurisprudence,
    selectedDoctrine,
    processedCaseFacts,
    selectedSystemEntities,
    caseNotes,
    getDraftKey,
  ]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(getDraftKey());
    } catch {}
    setInstructionText("");
    setSelectedModel("");
    setGeneratedHtml("");
    setSelectedJurisprudence([]);
    setSelectedDoctrine([]);
    setProcessedCaseFacts("");
    setSelectedSystemEntities([]);
    setCaseNotes([]);
    setDraftSavedAt(null);
    setHasDraft(false);
    setUploadedFiles([]);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }, [getDraftKey]);

  const savePieceMutation = useMutation({
    mutationFn: async (data: { title: string; pieceType: string; contentHtml: string; prompt?: string }) => {
      const res = await fetch("/api/studio/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save piece");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/pieces"] });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      const res = await fetch("/api/studio/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/templates"] });
      setShowTemplateDialog(false);
      setTemplateForm({ name: "", category: "civil", description: "", contentHtml: "" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/studio/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/templates"] });
      setSelectedTemplate(null);
    },
  });

  const deletePieceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/studio/pieces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete piece");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/pieces"] });
      setSelectedPiece(null);
    },
  });


  const handleSearchJurisprudence = async (query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/search/web-jurisprudence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ query, limit: 50 }),
      });
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error("Error searching jurisprudence:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchDoctrine = async (query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/search/web-doctrine", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ query, limit: 50 }),
      });
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error("Error searching doctrine:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportWord = async (content: string, title: string) => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/studio/export-word", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          contentHtml: content,
          title,
          wordTemplateFileData: wordTemplateFile?.data || null,
          userId: 1,
          attorney: selectedAttorney,
        }),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_')}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting Word:", error);
      // Fallback to old method if backend fails
      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
        <head><meta charset="utf-8"><title>${title}</title></head>
        <body style="font-family: Times New Roman, serif; font-size: 12pt; line-height: 1.5; margin: 2cm;">
          ${content}
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_')}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareWhatsApp = (content: string, title: string) => {
    const text = `*${title}*\n\n${content.replace(/<[^>]*>/g, '').substring(0, 500)}...\n\n_Gerado por LexAI - Marques & Serra Sociedade de Advogados_`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const extractTextFromFile = async (fileId: string, fileData: string, fileName: string, fileType: string, isRefModelOverride?: boolean) => {
    const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    const isDocx = /\.(doc|docx)$/i.test(fileName) || fileType?.includes("word");
    if (!isDocx && !supportedTypes.some(t => fileType.includes(t.split('/')[1]) || fileType === t)) {
      return;
    }

    const file = uploadedFiles.find(f => f.id === fileId);
    const isRef = isRefModelOverride !== undefined ? isRefModelOverride : (file?.isReferenceModel || false);

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, isExtracting: true } : f
    ));

    try {
      const res = await fetch("/api/studio/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          fileData,
          fileName,
          fileType,
          isReferenceModel: isRef,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const docs = data.documents
          ? data.documents.map((d: any) => ({ ...d, selected: true } as DocumentSegment))
          : undefined;
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, extractedText: data.text, isExtracting: false, documents: docs } : f
        ));
      } else {
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, extractedText: "Erro ao extrair texto", isExtracting: false } : f
        ));
      }
    } catch (error) {
      console.error("Error auto-extracting text:", error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, extractedText: "Erro ao extrair texto", isExtracting: false } : f
      ));
    }
  };

  const handleSearchSystem = async (query: string) => {
    if (!query.trim()) return;
    setIsSearchingSystem(true);
    try {
      const [clientsRes, debtorsRes, contractsRes] = await Promise.all([
        fetch(`/api/clients`, { headers: getAuthHeaders(), credentials: "include" }),
        fetch(`/api/debtors`, { headers: getAuthHeaders(), credentials: "include" }),
        fetch(`/api/contracts`, { headers: getAuthHeaders(), credentials: "include" }),
      ]);
      const clients = clientsRes.ok ? await clientsRes.json() : [];
      const debtors = debtorsRes.ok ? await debtorsRes.json() : [];
      const contracts = contractsRes.ok ? await contractsRes.json() : [];
      const q = query.toLowerCase();

      const matchedClientsList = clients
        .filter((c: any) => c.name?.toLowerCase().includes(q) || c.document?.toLowerCase().includes(q))
        .slice(0, 10);

      const matchedDebtorsList = debtors
        .filter((d: any) => d.name?.toLowerCase().includes(q) || d.document?.toLowerCase().includes(q))
        .slice(0, 10);

      // Fetch documents for matched clients and debtors in parallel
      const clientDocFetches = matchedClientsList.map((c: any) =>
        fetch(`/api/documents/by-client/${c.id}`, { headers: getAuthHeaders(), credentials: "include" })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      );
      const debtorDocFetches = matchedDebtorsList.map((d: any) =>
        fetch(`/api/debtors/${d.id}/documents`, { headers: getAuthHeaders(), credentials: "include" })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      );

      const [clientDocResults, debtorDocResults] = await Promise.all([
        Promise.all(clientDocFetches),
        Promise.all(debtorDocFetches),
      ]);

      // Extract text from documents on demand (uses server-side caching in metadata)
      const extractDocText = async (doc: any): Promise<string | null> => {
        // Use cached text from metadata if available
        if (doc.metadata?.extractedText) return doc.metadata.extractedText;
        try {
          const r = await fetch(`/api/documents/${doc.id}/extract-text`, { headers: getAuthHeaders(), credentials: "include" });
          if (r.ok) {
            const data = await r.json();
            return data.extractedText || null;
          }
        } catch {}
        return null;
      };

      // Extract text for all docs in parallel
      const allClientDocs = clientDocResults.flat();
      const allDebtorDocs = debtorDocResults.flat();
      const [clientDocTexts, debtorDocTexts] = await Promise.all([
        Promise.all(allClientDocs.map(extractDocText)),
        Promise.all(allDebtorDocs.map(extractDocText)),
      ]);

      // Build per-client doc text map
      let clientDocOffset = 0;
      const clientDocTextsByIdx: string[][] = clientDocResults.map(docs => {
        const texts: string[] = [];
        for (let i = 0; i < docs.length; i++) {
          const t = clientDocTexts[clientDocOffset + i];
          if (t) texts.push(`[${docs[i].title || 'Documento'}]: ${t}`);
        }
        clientDocOffset += docs.length;
        return texts;
      });

      let debtorDocOffset = 0;
      const debtorDocTextsByIdx: string[][] = debtorDocResults.map(docs => {
        const texts: string[] = [];
        for (let i = 0; i < docs.length; i++) {
          const t = debtorDocTexts[debtorDocOffset + i];
          if (t) texts.push(`[${docs[i].title || 'Documento'}]: ${t}`);
        }
        debtorDocOffset += docs.length;
        return texts;
      });

      const matchedClients: SystemEntity[] = matchedClientsList.map((c: any, i: number) => {
        const clientContracts = contracts.filter((ct: any) => ct.clientId === c.id);
        const documentTexts = clientDocTextsByIdx[i] || [];
        return {
          id: c.id,
          name: c.name,
          type: c.type || "PF",
          document: c.document,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city,
          state: c.state,
          zipCode: c.zipCode,
          notes: c.notes,
          entityType: 'client' as const,
          contracts: clientContracts.map((ct: any) => ({ type: ct.type, monthlyValue: ct.monthlyValue, status: ct.status })),
          documentTexts: documentTexts.length > 0 ? documentTexts : undefined,
        };
      });

      const matchedDebtors: SystemEntity[] = matchedDebtorsList.map((d: any, i: number) => {
        const documentTexts = debtorDocTextsByIdx[i] || [];
        return {
          id: d.id,
          name: d.name,
          type: d.type || "PF",
          document: d.document,
          email: d.email,
          phone: d.phone,
          address: d.address,
          city: d.city,
          state: d.state,
          zipCode: d.zipCode,
          totalDebt: d.totalDebt,
          notes: d.notes,
          entityType: 'debtor' as const,
          clientName: clients.find((c: any) => c.id === d.clientId)?.name,
          documentTexts: documentTexts.length > 0 ? documentTexts : undefined,
        };
      });

      setSystemSearchResults([...matchedClients, ...matchedDebtors]);
    } catch (error) {
      console.error("Error searching system data:", error);
    } finally {
      setIsSearchingSystem(false);
    }
  };

  const toggleSystemEntity = (entity: SystemEntity) => {
    setSelectedSystemEntities(prev => {
      const exists = prev.find(e => e.id === entity.id && e.entityType === entity.entityType);
      if (exists) return prev.filter(e => !(e.id === entity.id && e.entityType === entity.entityType));
      return [...prev, entity];
    });
  };

  const toggleDocumentSegment = (fileId: string, segIndex: number) => {
    setUploadedFiles(prev => prev.map(f => {
      if (f.id !== fileId || !f.documents) return f;
      const newDocs = f.documents.map((d, i) => i === segIndex ? { ...d, selected: !d.selected } : d);
      const selectedText = newDocs.filter(d => d.selected).map(d => d.text).join("\n\n");
      return { ...f, documents: newDocs, extractedText: selectedText || "[Nenhum documento selecionado]" };
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fileData = reader.result as string;
        const newFile: UploadedFile = {
          id: fileId,
          name: file.name,
          data: fileData,
          type: file.type,
        };
        setUploadedFiles((prev) => [...prev, newFile]);
        
        extractTextFromFile(fileId, fileData, file.name, file.type);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleWordTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setWordTemplateFile({
        name: file.name,
        data: reader.result as string,
      });
    };
    reader.readAsDataURL(file);

    if (wordTemplateFileInputRef.current) {
      wordTemplateFileInputRef.current.value = "";
    }
  };

  const toggleJurisprudenceSelection = (result: SearchResult) => {
    setSelectedJurisprudence((prev) => {
      const exists = prev.find((r) => r.id === result.id);
      if (exists) {
        return prev.filter((r) => r.id !== result.id);
      }
      return [...prev, result];
    });
  };

  const toggleDoctrineSelection = (result: SearchResult) => {
    setSelectedDoctrine((prev) => {
      const exists = prev.find((r) => r.id === result.id);
      if (exists) {
        return prev.filter((r) => r.id !== result.id);
      }
      return [...prev, result];
    });
  };

  const handleSuggestSearch = async () => {
    if (!instructionText.trim() || instructionText.length < 10) return;
    
    setIsLoadingSuggestions(true);
    setSuggestedJurisTerms([]);
    setSuggestedDoctrineTerms([]);

    try {
      const res = await fetch("/api/studio/suggest-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          prompt: instructionText,
          templateType: selectedModel || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestedJurisTerms(data.jurisprudenceTerms || []);
        setSuggestedDoctrineTerms(data.doctrineTerms || []);
      }
    } catch (error) {
      console.error("Error suggesting search terms:", error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSuggestedTermClick = (term: string, type: 'juris' | 'doutrina') => {
    setSearchQuery(term);
    setActiveToolTab(type);
    setIsToolboxOpen(true);
    if (type === 'juris') {
      handleSearchJurisprudence(term);
    } else {
      handleSearchDoctrine(term);
    }
  };

  // Voice recording functions
  const isRecordingRef = useRef(false);
  
  const startVoiceRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.");
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    let finalTranscript = '';
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setCurrentNoteText(finalTranscript + interimTranscript);
    };
    
    recognition.onerror = (event: any) => {
      console.error("Voice recognition error:", event.error);
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    
    recognition.onend = () => {
      if (isRecordingRef.current && finalTranscript.trim()) {
        setCaseNotes(prev => [...prev, {
          id: Date.now().toString(),
          text: finalTranscript.trim(),
          source: 'voice',
          timestamp: new Date()
        }]);
        setCurrentNoteText("");
      }
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    
    recognitionRef.current = recognition;
    isRecordingRef.current = true;
    recognition.start();
    setIsRecording(true);
  };

  const stopVoiceRecording = () => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };
  
  // Cleanup on dialog close
  useEffect(() => {
    if (!showCaseDialog && recognitionRef.current) {
      recognitionRef.current.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [showCaseDialog]);

  const addCaseNote = (text: string, source: 'text' | 'voice') => {
    if (!text.trim()) return;
    setCaseNotes(prev => [...prev, {
      id: Date.now().toString(),
      text: text.trim(),
      source,
      timestamp: new Date()
    }]);
    setCurrentNoteText("");
  };

  const removeCaseNote = (id: string) => {
    setCaseNotes(prev => prev.filter(n => n.id !== id));
  };

  const processCaseNotes = async () => {
    if (caseNotes.length === 0) return;
    
    setIsProcessingCase(true);
    try {
      const allNotes = caseNotes.map(n => n.text).join("\n\n---\n\n");
      
      const res = await fetch("/api/studio/process-case", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ notes: allNotes }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setProcessedCaseFacts(data.facts);
        // Add/replace processed facts in instruction text
        if (data.facts) {
          setInstructionText(prev => {
            // Remove existing FATOS DO CASO section if present
            const factsRegex = /\n*FATOS DO CASO:[\s\S]*?(?=\n\n[A-Z]|\n*$)/;
            const cleanedPrev = prev.replace(factsRegex, '').trim();
            return cleanedPrev 
              ? `${cleanedPrev}\n\nFATOS DO CASO:\n${data.facts}` 
              : `FATOS DO CASO:\n${data.facts}`;
          });
        }
        // Clear notes after successful processing
        setCaseNotes([]);
        setCurrentNoteText("");
        setShowCaseDialog(false);
      } else {
        const errorData = await res.json();
        alert(`Erro: ${errorData.error || 'Falha ao processar anotações'}`);
      }
    } catch (error) {
      console.error("Error processing case notes:", error);
      alert("Erro ao processar anotações do caso. Tente novamente.");
    } finally {
      setIsProcessingCase(false);
    }
  };

  const handleExtractText = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;

    setUploadedFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, isExtracting: true } : f
    ));

    try {
      const res = await fetch("/api/studio/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          fileData: file.data,
          fileName: file.name,
          fileType: file.type,
          isReferenceModel: file.isReferenceModel || false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, extractedText: data.text, isExtracting: false } : f
        ));
      } else {
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, extractedText: "Erro ao extrair texto", isExtracting: false } : f
        ));
      }
    } catch (error) {
      console.error("Error extracting text:", error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, extractedText: "Erro ao extrair texto", isExtracting: false } : f
      ));
    }
  };

  const handleGenerate = async () => {
    if (!instructionText.trim() || !selectedModel) return;
    
    setIsGenerating(true);
    setGeneratedHtml("");
    setIsHumanized(false);
    setOriginalHtml("");
    setShowHumanizeOptions(false);

    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          prompt: instructionText,
          templateType: selectedModel,
          attorney: selectedAttorney,
          systemContext: selectedSystemEntities.length > 0 ? selectedSystemEntities.map(e => {
            const lines = [`${e.entityType === 'client' ? 'CLIENTE' : 'DEVEDOR'}: ${e.name}`];
            if (e.type) lines.push(`Tipo: ${e.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}`);
            if (e.document) lines.push(`Documento (CPF/CNPJ): ${e.document}`);
            if (e.email) lines.push(`Email: ${e.email}`);
            if (e.phone) lines.push(`Telefone: ${e.phone}`);
            if (e.address) lines.push(`Endereço: ${e.address}`);
            if (e.city) lines.push(`Cidade: ${e.city}`);
            if (e.state) lines.push(`Estado: ${e.state}`);
            if (e.zipCode) lines.push(`CEP: ${e.zipCode}`);
            if (e.clientName) lines.push(`Cliente vinculado: ${e.clientName}`);
            if (e.totalDebt) lines.push(`Valor da dívida: R$ ${parseFloat(e.totalDebt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            if (e.notes) lines.push(`Observações: ${e.notes}`);
            if (e.contracts && e.contracts.length > 0) {
              lines.push(`Contratos (${e.contracts.length}):`);
              e.contracts.forEach(ct => {
                const val = ct.monthlyValue ? ` - R$ ${parseFloat(ct.monthlyValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês` : '';
                lines.push(`  • ${ct.type}${val} [${ct.status}]`);
              });
            }
            if (e.documentTexts && e.documentTexts.length > 0) {
              lines.push(`\nDocumentos anexados:`);
              e.documentTexts.forEach(dt => lines.push(dt));
            }
            return lines.join('\n');
          }).join('\n\n') : undefined,
          files: uploadedFiles.map((f) => ({ name: f.name, type: f.type, data: f.data, extractedText: f.extractedText, isReferenceModel: f.isReferenceModel })),
          selectedJurisprudence: selectedJurisprudence.map((r) => ({
            title: r.title,
            summary: r.summary,
            ementa: r.ementa,
            legalThesis: r.legalThesis,
            court: r.court,
            caseNumber: r.caseNumber,
            citationABNT: r.citationABNT,
          })),
          selectedDoctrine: selectedDoctrine.map((r) => ({
            title: r.title,
            summary: r.summary,
            citationABNT: r.citationABNT,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate piece");
      }

      const data = await res.json();
      const rawHtml = data.contentHtml || data.content || "";
      const processedPreview = rawHtml
        .replace(
          /<p\s+style\s*=\s*["']text-align\s*:\s*center[^"']*["']\s*>\s*<strong>([^<]{1,150})<\/strong>\s*<\/p>/gi,
          (_match: string, content: string) => {
            return `<p class="centered-title"><strong>${content}</strong></p>`;
          }
        )
        .replace(
          /<p(?:\s+style\s*=\s*["']text-align\s*:\s*left[^"']*["'])?\s*>\s*<strong>([^<]{1,150})<\/strong>\s*<\/p>/gi,
          (_match: string, content: string) => {
            const trimmed = content.trim();
            const isUpperOrTitle = trimmed === trimmed.toUpperCase() || 
              /^(EXCELENT|AO\s|À\s|DOS?\s|DA\s|DAS?\s|EGRÉGIO)/i.test(trimmed) ||
              /^\d+\.\d+\.?\s/.test(trimmed) ||
              /^[IVX]+\s*[–—-]/.test(trimmed);
            if (isUpperOrTitle || trimmed.length < 120) {
              return `<p class="section-title"><strong>${content}</strong></p>`;
            }
            return `<p><strong>${content}</strong></p>`;
          }
        )
        .replace(
          /<p(?:\s+[^>]*)?>\s*<strong>([^<]{1,40}(?::|\.))<\/strong>\s*([\s\S]*?)<\/p>/gi,
          (_match: string, label: string, value: string) => {
            return `<p class="no-indent"><strong>${label}</strong> ${value.trim()}</p>`;
          }
        )
        .replace(
          /<p(?:\s+[^>]*)?>\s*<strong>([^<]{1,50})<\/strong>\s*(?:<br\s*\/?>)?\s*([^<]*(?:OAB|CRM|CREA)[^<]*)<\/p>/gi,
          (_match: string, name: string, reg: string) => {
            return `<p class="signature-block"><strong>${name}</strong><br>${reg.trim()}</p>`;
          }
        )
        .replace(
          /<p(?:\s+[^>]*)?>(\s*(?:Termos em que|Nestes termos|Brasília|Respeitosamente)[^<]*)<\/p>/gi,
          (_match: string, content: string) => {
            return `<p class="no-indent">${content.trim()}</p>`;
          }
        )
        .replace(
          /<p(?:\s+[^>]*)?>(\s*[a-z]\)\s[^<]*)<\/p>/gi,
          (_match: string, content: string) => {
            return `<p class="no-indent">${content.trim()}</p>`;
          }
        );
      setGeneratedHtml(processedPreview);
      setIsPreviewMaximized(true);
      
      const modelLabel = PIECE_MODELS.find(m => m.value === selectedModel)?.label || selectedModel;
      setPieceTitle(`${modelLabel} - ${new Date().toLocaleDateString('pt-BR')}`);
    } catch (error) {
      console.error("Error generating piece:", error);
      setGeneratedHtml("<p style='color: red;'>Erro ao gerar a peça. Por favor, tente novamente.</p>");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePiece = async () => {
    if (!generatedHtml || !pieceTitle.trim()) return;

    await savePieceMutation.mutateAsync({
      title: pieceTitle,
      pieceType: selectedModel,
      contentHtml: generatedHtml,
      prompt: instructionText,
    });
    
    setPieceTitle("");
  };

  const handleHumanize = async () => {
    if (!generatedHtml) return;
    setIsHumanizing(true);
    try {
      if (!isHumanized) {
        setOriginalHtml(generatedHtml);
      }
      const res = await fetch("/api/studio/humanize", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: generatedHtml, intensity: humanizeIntensity }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Falha ao humanizar a peça");
      }
      const result = await res.json();
      if (result.content) {
        setGeneratedHtml(result.content);
        setIsHumanized(true);
        setShowHumanizeOptions(false);
        toast({
          title: "Peça humanizada!",
          description: `Nível: ${humanizeIntensity === "leve" ? "Leve" : humanizeIntensity === "moderado" ? "Moderado" : "Intenso"}`,
        });
      }
    } catch (err) {
      console.error("Error humanizing:", err);
      toast({ title: "Erro ao humanizar", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    }
    setIsHumanizing(false);
  };

  const handleUndoHumanize = () => {
    if (originalHtml) {
      setGeneratedHtml(originalHtml);
      setIsHumanized(false);
      toast({ title: "Versão original restaurada" });
    }
  };

  const handleHumanizeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsHumanizeUploading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      toast({ title: "Erro ao ler arquivo", variant: "destructive" });
      setIsHumanizeUploading(false);
    };
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/studio/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ fileData: base64, fileName: file.name, fileType: file.type }),
        });
        if (res.ok) {
          const data = await res.json();
          setHumanizeUploadText(data.text || "");
        } else {
          toast({ title: "Erro ao ler arquivo", variant: "destructive" });
        }
      } catch {
        toast({ title: "Erro ao processar arquivo", variant: "destructive" });
      } finally {
        setIsHumanizeUploading(false);
      }
    };
    reader.readAsDataURL(file);
    if (humanizeFileRef.current) humanizeFileRef.current.value = "";
  };

  const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const handleHumanizeUploaded = async () => {
    if (!humanizeUploadText.trim()) return;
    const htmlContent = escapeHtml(humanizeUploadText).split("\n").filter(l => l.trim()).map(l => `<p>${l}</p>`).join("\n");
    setGeneratedHtml(htmlContent);
    setOriginalHtml(htmlContent);
    setIsHumanizing(true);
    setIsPreviewMaximized(true);
    try {
      const res = await fetch("/api/studio/humanize", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: htmlContent, intensity: humanizeIntensity }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Falha ao humanizar");
      }
      const result = await res.json();
      if (result.content) {
        setGeneratedHtml(result.content);
        setIsHumanized(true);
        toast({ title: "Peça humanizada!", description: `Nível: ${humanizeIntensity === "leve" ? "Leve" : humanizeIntensity === "moderado" ? "Moderado" : "Intenso"}` });
      }
    } catch (err) {
      toast({ title: "Erro ao humanizar", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    }
    setIsHumanizing(false);
  };

  const copyField = async (text: string, fieldId: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const copyAllProtocolData = async () => {
    if (!protocolData) return;
    const lines: string[] = [];
    lines.push("=== DADOS INICIAIS ===");
    lines.push(`Matéria: ${protocolData.dadosIniciais.materia}`);
    lines.push(`Jurisdição: ${protocolData.dadosIniciais.jurisdicao}`);
    lines.push(`Classe Judicial: ${protocolData.dadosIniciais.classeJudicial}`);
    lines.push("");
    lines.push("=== ASSUNTO ===");
    if (protocolData.assunto?.sugestao) lines.push(`Assunto: ${protocolData.assunto.sugestao}`);
    if (protocolData.assunto?.codigo) lines.push(`Código CNJ: ${protocolData.assunto.codigo}`);
    lines.push("");
    lines.push("=== PROCURADOR ===");
    lines.push(`Nome: ${protocolData.procurador.nome}`);
    lines.push(`${protocolData.procurador.oab}`);
    lines.push("");
    const formatParte = (p: ProtocolParteData, idx: number, polo: string) => {
      lines.push(`--- ${polo} ${idx + 1} ---`);
      if (p.nome) lines.push(`Nome: ${p.nome}`);
      if (p.tipoPessoa) lines.push(`Tipo: ${p.tipoPessoa === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}`);
      if (p.documentoTipo && p.documentoNumero) lines.push(`${p.documentoTipo}: ${p.documentoNumero}`);
      if (p.rg) lines.push(`RG: ${p.rg}`);
      if (p.genitora) lines.push(`Mãe: ${p.genitora}`);
      if (p.genitor) lines.push(`Pai: ${p.genitor}`);
      if (p.sexo) lines.push(`Sexo: ${p.sexo}`);
      if (p.dataNascimento) lines.push(`Nascimento: ${p.dataNascimento}`);
      if (p.estadoCivil) lines.push(`Estado Civil: ${p.estadoCivil}`);
      if (p.profissao) lines.push(`Profissão: ${p.profissao}`);
      if (p.nacionalidade) lines.push(`Nacionalidade: ${p.nacionalidade}`);
      if (p.naturalidadeEstado) lines.push(`Naturalidade: ${p.naturalidadeMunicipio || ''}/${p.naturalidadeEstado}`);
      const endereco = [p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.estado, p.cep].filter(Boolean).join(', ');
      if (endereco) lines.push(`Endereço: ${endereco}`);
      if (p.email) lines.push(`Email: ${p.email}`);
      if (p.telefone) lines.push(`Telefone: ${p.telefone}`);
    };
    if (protocolData.poloAtivo?.length) {
      lines.push("=== POLO ATIVO ===");
      protocolData.poloAtivo.forEach((p, i) => formatParte(p, i, "Parte"));
      lines.push("");
    }
    if (protocolData.poloPassivo?.length) {
      lines.push("=== POLO PASSIVO ===");
      protocolData.poloPassivo.forEach((p, i) => formatParte(p, i, "Parte"));
      lines.push("");
    }
    lines.push("=== CARACTERÍSTICAS ===");
    lines.push(`Justiça Gratuita: ${protocolData.caracteristicas.justicaGratuita ? 'Sim' : 'Não'}`);
    lines.push(`Tutela Antecipada: ${protocolData.caracteristicas.tutelaAntecipada ? 'Sim' : 'Não'}`);
    if (protocolData.caracteristicas.valorCausa) lines.push(`Valor da Causa: R$ ${protocolData.caracteristicas.valorCausa}`);
    lines.push(`Segredo de Justiça: ${protocolData.caracteristicas.segredoJustica ? 'Sim' : 'Não'}`);
    if (protocolData.caracteristicas.prioridade) lines.push(`Prioridade: ${protocolData.caracteristicas.prioridade}`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ title: "Todos os dados copiados!" });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleExtractProtocolData = async (): Promise<ProtocolData | null> => {
    setIsExtractingProtocol(true);
    try {
      const response = await fetch("/api/studio/extract-protocol-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          extractedTexts: uploadedFiles.filter(f => f.extractedText).map(f => f.extractedText),
          systemEntities: selectedSystemEntities,
          templateType: selectedModel,
          instructionText,
          selectedAttorney,
          calcItems,
          generatedHtml,
          checklistDocTexts,
        }),
      });
      if (!response.ok) throw new Error("Extraction failed");
      const data = await response.json();
      setProtocolData(data);
      return data;
    } catch (error) {
      console.error("Error extracting protocol data:", error);
      toast({ title: "Erro ao extrair dados para protocolo", variant: "destructive" });
      return null;
    } finally {
      setIsExtractingProtocol(false);
    }
  };

  const handleOpenProtocolChecklist = async () => {
    if (showProtocolChecklist) {
      setShowProtocolChecklist(false);
      return;
    }
    setShowProtocolChecklist(true);
    if (!protocolData) {
      await handleExtractProtocolData();
    }
  };

  const handleOpenPjeWithChecklist = async (pjeUrl: string) => {
    let currentData = protocolData;
    if (!currentData) {
      currentData = await handleExtractProtocolData();
    }
    const sw = window.screen.availWidth || window.screen.width;
    const sh = window.screen.availHeight || window.screen.height;
    const sl = (window.screen as any).availLeft || 0;
    const st = (window.screen as any).availTop || 0;
    const pjeW = Math.floor(sw * 0.75);
    const clW = sw - pjeW;

    const checklistWin = window.open("", "ChecklistPJe", `width=${clW},height=${sh},left=${sl + pjeW},top=${st},scrollbars=yes,resizable=yes`);
    const pjeWin = window.open(pjeUrl, "PJeProtocolo", `width=${pjeW},height=${sh},left=${sl},top=${st},scrollbars=yes,resizable=yes`);
    if (!pjeWin || !checklistWin) { toast({ title: "Permita pop-ups para abrir o PJe e o Checklist", variant: "destructive" }); return; }

    if (currentData) {
      writeChecklistWindow(checklistWin, currentData);
    } else {
      checklistWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Checklist PJe</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#64748b}</style>
        </head><body><div style="text-align:center"><div style="font-size:32px;margin-bottom:12px">❌</div><p>Erro ao extrair dados. Tente novamente.</p></div></body></html>`);
      checklistWin.document.close();
    }
  };

  const writeChecklistWindow = (w: Window, dataOverride?: ProtocolData | null) => {
    const pd = dataOverride || protocolData;
    if (!pd) return;
    const renderPartes = (polo: ProtocolParteData[], titulo: string, cor: string) => {
      if (!polo || polo.length === 0) return "";
      return `<div style="margin-top:12px"><h3 style="color:${cor};font-size:13px;font-weight:700;margin-bottom:8px">${titulo}</h3>${polo.map((p) => {
        const fields = [
          { l: "Nome Civil", v: p.nome }, { l: p.documentoTipo || "CPF", v: p.documentoNumero },
          { l: "RG", v: p.rg }, { l: "Mãe", v: p.genitora }, { l: "Pai", v: p.genitor },
          { l: "Sexo", v: p.sexo }, { l: "Nascimento", v: p.dataNascimento },
          { l: "Estado Civil", v: p.estadoCivil }, { l: "Profissão", v: p.profissao },
          { l: "Nacionalidade", v: p.nacionalidade }, { l: "Nat. UF", v: p.naturalidadeEstado },
          { l: "Nat. Município", v: p.naturalidadeMunicipio }, { l: "CEP", v: p.cep },
          { l: "Estado", v: p.estado }, { l: "Cidade", v: p.cidade },
          { l: "Bairro", v: p.bairro }, { l: "Logradouro", v: p.logradouro },
          { l: "Número", v: p.numero }, { l: "Complemento", v: p.complemento },
          { l: "Email", v: p.email }, { l: "Telefone", v: p.telefone },
        ].filter(f => f.v);
        return `<div style="border:1px solid #ddd;border-radius:6px;padding:8px;margin-bottom:8px;background:#fff">
          <div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:6px">
            <strong>${p.nome || 'N/A'}</strong><span style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:11px">${p.tipoPessoa === 'PJ' ? 'PJ' : 'PF'}</span>
          </div>
          ${fields.map(f => `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:12px">
            <span><span style="color:#888">${f.l}: </span><strong class="cv">${f.v}</strong></span>
            <button onclick="cc(this)" style="border:none;background:none;cursor:pointer;padding:2px 4px;font-size:11px;color:#3b82f6">📋</button>
          </div>`).join("")}
        </div>`;
      }).join("")}</div>`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Checklist PJe - LexAI</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f8fafc;color:#1e293b}
  .hdr{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px}
  .hdr h1{font-size:15px;margin:0;font-weight:600}
  .cnt{padding:12px}
  .sec{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px}
  .field{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;margin-bottom:4px}
  .field .lbl{font-size:11px;color:#64748b}
  .field .val{font-weight:600;font-size:13px}
  .field button{border:none;background:none;cursor:pointer;font-size:13px;padding:2px 6px}
  .blue-field{background:#eff6ff;border-color:#bfdbfe}
  .amber-field{background:#fffbeb;border-color:#fde68a;color:#92400e;font-size:12px;padding:8px;border-radius:6px}
  .copied{color:#16a34a !important;font-weight:bold}
  .cv{user-select:all}
  .tab-bar{display:flex;gap:2px;margin-bottom:10px;background:#f1f5f9;border-radius:6px;padding:2px}
  .tab-btn{flex:1;text-align:center;padding:6px;font-size:11px;border:none;background:none;cursor:pointer;border-radius:4px;font-weight:500;color:#64748b}
  .tab-btn.active{background:#fff;color:#1e293b;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .tab-content{display:none}.tab-content.active{display:block}
</style></head><body>
<div class="hdr">
  <span style="font-size:18px">📋</span>
  <h1>Checklist PJe</h1>
  <span style="margin-left:auto;font-size:11px;opacity:.8">Copie cada campo para o PJe →</span>
</div>
<div class="cnt">
  <div class="tab-bar">
    <button class="tab-btn active" onclick="showTab('dados',this)">Dados Iniciais</button>
    <button class="tab-btn" onclick="showTab('assuntos',this)">Assuntos</button>
    <button class="tab-btn" onclick="showTab('partes',this)">Partes</button>
    <button class="tab-btn" onclick="showTab('caract',this)">Características</button>
  </div>
  <div id="tab-dados" class="tab-content active"><div class="sec">
    ${[
      { l: "Matéria", v: pd.dadosIniciais.materia },
      { l: "Jurisdição", v: pd.dadosIniciais.jurisdicao },
      { l: "Classe Judicial", v: pd.dadosIniciais.classeJudicial },
    ].map(f => `<div class="field"><div><div class="lbl">${f.l}*</div><div class="val cv">${f.v}</div></div><button onclick="cc(this)">📋</button></div>`).join("")}
    ${(() => {
      const reuDoc = pd.poloPassivo?.map(p => p.documentoNumero).filter(Boolean).join(", ");
      return reuDoc ? `<div class="field" style="background:#fef2f2;border-color:#fca5a5"><div><div class="lbl" style="color:#dc2626">📌 CPF/CNPJ do Réu*</div><div class="val cv" style="font-size:14px">${reuDoc}</div></div><button onclick="cc(this)">📋</button></div>` : `<div class="field" style="background:#fef2f2;border-color:#fca5a5"><div><div class="lbl" style="color:#dc2626">📌 CPF/CNPJ do Réu*</div><div class="val" style="color:#94a3b8;font-size:12px">Não encontrado nos documentos</div></div></div>`;
    })()}
    <div class="field" style="background:#fffbeb;border-color:#fde68a"><div><div class="lbl" style="color:#b45309">💰 Valor da Causa*</div><div class="val cv" style="font-size:14px">${pd.caracteristicas.valorCausa ? "R$ " + pd.caracteristicas.valorCausa : "Não informado"}</div></div><button onclick="cc(this)">📋</button></div>
    ${pd.jurisdicoesTJDFT && pd.jurisdicoesTJDFT.length > 0 ? `
      <div class="field blue-field" style="flex-direction:column;align-items:stretch">
        <div class="lbl" style="margin-bottom:4px">📍 Fórum / Jurisdição TJDFT*</div>
        ${pd.jurisdicoesTJDFT.map(f => `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0"><span class="cv" style="font-size:12px">${f}</span><button onclick="cc(this)" style="border:none;background:none;cursor:pointer;font-size:11px">📋</button></div>`).join("")}
      </div>` : ""}
  </div></div>
  <div id="tab-assuntos" class="tab-content"><div class="sec">
    ${pd.assunto?.sugestao ? `
      <div class="field"><div><div class="lbl">Assunto Sugerido*</div><div class="val cv">${pd.assunto.sugestao}</div>${pd.assunto.codigo ? `<div style="font-size:11px;color:#64748b">Código CNJ: ${pd.assunto.codigo}</div>` : ""}</div><button onclick="cc(this)">📋</button></div>
      <div class="amber-field">⚠️ Pesquise no PJe pelo assunto sugerido</div>
    ` : `<div class="amber-field">Pesquise na tabela de assuntos do PJe.</div>`}
  </div></div>
  <div id="tab-partes" class="tab-content"><div class="sec">
    <div class="field blue-field"><div><div class="lbl">Procurador</div><div class="val cv">${pd.procurador.nome}</div><div style="font-size:11px" class="cv">${pd.procurador.oab}</div></div><button onclick="cc(this)">📋</button></div>
  </div>
  ${renderPartes(pd.poloAtivo, "👤 POLO ATIVO (Autor)", "#15803d")}
  ${renderPartes(pd.poloPassivo, "👥 POLO PASSIVO (Réu)", "#dc2626")}
  </div>
  <div id="tab-caract" class="tab-content"><div class="sec">
    ${[
      { l: "Justiça Gratuita?", v: pd.caracteristicas.justicaGratuita ? "Sim" : "Não" },
      { l: "Tutela Antecipada?", v: pd.caracteristicas.tutelaAntecipada ? "Sim" : "Não" },
      { l: "Valor da Causa", v: pd.caracteristicas.valorCausa || "Não informado" },
      { l: "Segredo de Justiça", v: pd.caracteristicas.segredoJustica ? "Sim" : "Não" },
      { l: "Prioridade", v: pd.caracteristicas.prioridade || "Nenhuma" },
    ].map(f => `<div class="field"><div><div class="lbl">${f.l}</div><div class="val cv">${f.v}</div></div><button onclick="cc(this)">📋</button></div>`).join("")}
  </div></div>
</div>
<script>
function showTab(id,btn){document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));document.getElementById('tab-'+id).classList.add('active');btn.classList.add('active')}
function cc(btn){const row=btn.closest('.field')||btn.parentElement;const valEl=row.querySelector('.val,.cv');if(!valEl)return;navigator.clipboard.writeText(valEl.textContent.trim()).then(()=>{const o=btn.textContent;btn.textContent='✅';btn.classList.add('copied');setTimeout(()=>{btn.textContent=o;btn.classList.remove('copied')},1500)})}
</script></body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const handleOpenChecklistWindow = () => {
    if (!protocolData) return;
    const w = window.open("", "ChecklistPJe", "width=520,height=700,scrollbars=yes,resizable=yes");
    if (!w) { toast({ title: "Permita pop-ups para abrir o checklist em nova janela", variant: "destructive" }); return; }
    writeChecklistWindow(w);
  };

  const handleChecklistDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingChecklistDoc(true);
    try {
      for (const file of Array.from(files)) {
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("File read failed"));
          reader.readAsDataURL(file);
        });
        const resp = await fetch("/api/studio/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ fileData, fileName: file.name, fileType: file.type }),
        });
        if (!resp.ok) throw new Error("OCR failed");
        const data = await resp.json();
        if (data.text) {
          setChecklistDocTexts(prev => [...prev, data.text]);
          setChecklistDocNames(prev => [...prev, file.name]);
        }
      }
      toast({ title: "Documento(s) carregado(s) com sucesso" });
    } catch (error) {
      console.error("Error uploading checklist doc:", error);
      toast({ title: "Erro ao carregar documento", variant: "destructive" });
    } finally {
      setIsUploadingChecklistDoc(false);
      if (checklistFileRef.current) checklistFileRef.current.value = "";
    }
  };

  const handlePopupDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    popupDragRef.current = { startX: e.clientX, startY: e.clientY, origX: popupPos.x, origY: popupPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!popupDragRef.current) return;
      const dx = ev.clientX - popupDragRef.current.startX;
      const dy = ev.clientY - popupDragRef.current.startY;
      setPopupPos({ x: popupDragRef.current.origX + dx, y: popupDragRef.current.origY + dy });
    };
    const onUp = () => {
      popupDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const fmtCur = (v: number) => v.toLocaleString("pt-BR", {style:"currency",currency:"BRL"});

  const handleCalcAddItem = () => {
    const valor = parseFloat(calcValorOriginal.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
    if (valor <= 0) return;

    const typeLabels: Record<string, string> = {
      correcao: "Correção Monetária",
      juros: "Juros de Mora",
      atualizacao: "Atualização de Débito",
      honorarios: "Honorários Advocatícios",
    };

    const id = Date.now().toString();
    const existingTypes = calcItems.map(i => i.type);
    const hasAtualizacao = existingTypes.includes("atualizacao");
    const hasCorrecaoOrJuros = existingTypes.includes("correcao") || existingTypes.includes("juros");

    if (calcType === "atualizacao" && hasCorrecaoOrJuros) {
      if (!confirm("Atenção: Você já adicionou Correção Monetária e/ou Juros de Mora separadamente.\n\nA 'Atualização de Débito' já inclui correção + juros combinados. Adicionar ambos pode duplicar valores no memorial.\n\nDeseja continuar mesmo assim?")) return;
    }
    if ((calcType === "correcao" || calcType === "juros") && hasAtualizacao) {
      if (!confirm("Atenção: Você já adicionou 'Atualização de Débito', que já inclui correção monetária e juros combinados.\n\nAdicionar " + (calcType === "correcao" ? "Correção Monetária" : "Juros de Mora") + " separadamente pode duplicar valores.\n\nDeseja continuar mesmo assim?")) return;
    }

    if (calcType === "honorarios") {
      const perc = parseFloat(calcPercentualHonorarios) / 100;
      const honorarios = valor * perc;
      setCalcItems(prev => [...prev, {
        id, type: calcType, label: typeLabels[calcType],
        valorOriginal: valor, valorTotal: honorarios,
        details: `${calcPercentualHonorarios}% ${calcTipoHonorarios === "exito" ? "sobre êxito" : "fixo"}`,
        breakdown: [
          `Base de Cálculo: ${fmtCur(valor)}`,
          `Percentual: ${calcPercentualHonorarios}%`,
          `Tipo: ${calcTipoHonorarios === "exito" ? "Sobre Êxito" : "Fixo"}`,
          `Valor dos Honorários: ${fmtCur(honorarios)}`,
        ],
      }]);
      setCalcValorOriginal("");
      return;
    }

    if (!calcDataInicio || !calcDataFim) return;
    const start = new Date(calcDataInicio + "T00:00:00");
    const end = new Date(calcDataFim + "T00:00:00");
    const diffMs = end.getTime() - start.getTime();
    const totalMeses = diffMs / (1000 * 60 * 60 * 24 * 30.44);
    if (totalMeses < 0) return;
    const mesesInt = Math.floor(totalMeses);
    const diasRest = Math.round((totalMeses - mesesInt) * 30);
    const periodoStr = `${mesesInt} meses e ${diasRest} dias`;
    const dataInicioFmt = calcDataInicio.split("-").reverse().join("/");
    const dataFimFmt = calcDataFim.split("-").reverse().join("/");

    if (calcType === "correcao") {
      const rate = CALC_INDEX_RATES[calcIndice]?.monthly || 0.0045;
      const fator = Math.pow(1 + rate, totalMeses);
      const valorCorrigido = valor * fator;
      const indiceAcumulado = ((fator - 1) * 100).toFixed(2).replace(".", ",");
      setCalcItems(prev => [...prev, {
        id, type: calcType, label: typeLabels[calcType],
        valorOriginal: valor, valorTotal: valorCorrigido,
        details: `${calcIndice} ${indiceAcumulado}% (${periodoStr})`,
        breakdown: [
          `Valor Original: ${fmtCur(valor)}`,
          `Período: ${dataInicioFmt} a ${dataFimFmt} (${periodoStr})`,
          `Índice: ${calcIndice}`,
          `Índice Acumulado: ${indiceAcumulado}%`,
          `Correção Monetária: ${fmtCur(valorCorrigido - valor)}`,
          `Valor Corrigido: ${fmtCur(valorCorrigido)}`,
        ],
      }]);
    } else if (calcType === "juros") {
      const taxa = parseFloat(calcTaxaJuros) / 100;
      const juros = valor * taxa * totalMeses;
      setCalcItems(prev => [...prev, {
        id, type: calcType, label: typeLabels[calcType],
        valorOriginal: valor, valorTotal: valor + juros,
        details: `${calcTaxaJuros}% a.m. (${periodoStr})`,
        breakdown: [
          `Valor Principal: ${fmtCur(valor)}`,
          `Período: ${dataInicioFmt} a ${dataFimFmt} (${periodoStr})`,
          `Taxa: ${calcTaxaJuros}% ao mês`,
          `Juros Acumulados: ${fmtCur(juros)}`,
          `Valor com Juros: ${fmtCur(valor + juros)}`,
        ],
      }]);
    } else if (calcType === "atualizacao") {
      const rate = CALC_INDEX_RATES[calcIndice]?.monthly || 0.0045;
      const fator = Math.pow(1 + rate, totalMeses);
      const valorCorrigido = valor * fator;
      const taxa = parseFloat(calcTaxaJuros) / 100;
      const juros = valorCorrigido * taxa * totalMeses;
      const multa = calcIncluirMulta ? valorCorrigido * 0.1 : 0;
      const total = valorCorrigido + juros + multa;
      const indiceAcumulado = ((fator - 1) * 100).toFixed(2).replace(".", ",");
      const breakdownLines = [
        `Valor Original: ${fmtCur(valor)}`,
        `Período: ${dataInicioFmt} a ${dataFimFmt} (${periodoStr})`,
        `Índice: ${calcIndice} (${indiceAcumulado}%)`,
        `Valor Corrigido: ${fmtCur(valorCorrigido)}`,
        `Juros de Mora (${calcTaxaJuros}% a.m.): ${fmtCur(juros)}`,
      ];
      if (multa > 0) breakdownLines.push(`Multa (10%): ${fmtCur(multa)}`);
      breakdownLines.push(`Valor Total Atualizado: ${fmtCur(total)}`);
      setCalcItems(prev => [...prev, {
        id, type: calcType, label: typeLabels[calcType],
        valorOriginal: valor, valorTotal: total,
        details: `${calcIndice} + ${calcTaxaJuros}% a.m.${calcIncluirMulta ? ' + multa' : ''} (${periodoStr})`,
        breakdown: breakdownLines,
      }]);
    }
    setCalcValorOriginal("");
  };

  const handleCalcRemoveItem = (id: string) => {
    setCalcItems(prev => prev.filter(item => item.id !== id));
  };

  const calcGrandTotal = calcItems.reduce((sum, item) => sum + item.valorTotal, 0);

  const generateMemorialHtml = () => {
    if (calcItems.length === 0) return "";
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    let html = `<div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; page-break-before: always;">`;
    html += `<br>`;
    html += `<p style="text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px;">MEMÓRIA DE CÁLCULO</p>`;
    html += `<p style="text-align: center; font-size: 10pt; color: #555; margin-bottom: 16px;">(Art. 524, §1º, do CPC)</p>`;
    html += `<hr style="border: 2px solid #222; margin-bottom: 24px;">`;

    calcItems.forEach((item, idx) => {
      html += `<p style="font-size: 12pt; font-weight: bold; margin: 20px 0 8px 0; text-decoration: underline;">${idx + 1}. ${item.label.toUpperCase()}</p>`;
      html += `<table style="width: 100%; border-collapse: collapse; margin: 8px 0 16px 0; font-size: 11pt; border: 1px solid #999;">`;
      item.breakdown.forEach((line, lineIdx) => {
        const [key, ...valueParts] = line.split(": ");
        const value = valueParts.join(": ");
        const isTotal = line.toLowerCase().includes("valor total") || line.toLowerCase().includes("valor corrigido") || line.toLowerCase().includes("valor com juros") || line.toLowerCase().includes("valor dos honorários");
        const bgColor = isTotal ? '#e8e8e8' : (lineIdx % 2 === 0 ? '#ffffff' : '#f8f8f8');
        html += `<tr style="background-color: ${bgColor}; ${isTotal ? 'font-weight: bold;' : ''}">`;
        html += `<td style="padding: 6px 12px; border: 1px solid #ccc; width: 55%;">${key}</td>`;
        html += `<td style="padding: 6px 12px; border: 1px solid #ccc; text-align: right;">${value}</td>`;
        html += `</tr>`;
      });
      html += `</table>`;
    });

    html += `<hr style="border: 2px solid #222; margin: 24px 0 12px 0;">`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13pt; border: 2px solid #222;">`;
    html += `<tr style="font-weight: bold; background-color: #ddd;">`;
    html += `<td style="padding: 10px 12px; border: 2px solid #222;">VALOR TOTAL DA MEMÓRIA DE CÁLCULO</td>`;
    html += `<td style="padding: 10px 12px; border: 2px solid #222; text-align: right; font-size: 14pt;">${fmtCur(calcGrandTotal)}</td>`;
    html += `</tr></table>`;
    html += `<br><br>`;
    html += `<p style="text-align: right; font-size: 11pt;">Brasília/DF, ${dateStr}.</p>`;
    html += `<br><br>`;
    html += `<p style="text-align: center; font-size: 11pt;">_____________________________________________</p>`;
    html += `<p style="text-align: center; font-size: 11pt; font-weight: bold;">[ADVOGADO_NOME]</p>`;
    html += `<p style="text-align: center; font-size: 10pt;">[ADVOGADO_OAB]</p>`;
    html += `</div>`;
    return html;
  };

  const handleCalcInsertInPiece = () => {
    if (calcItems.length === 0) return;
    const memorial = generateMemorialHtml();
    if (generatedHtml) {
      setGeneratedHtml(prev => prev + `<br><br>${memorial}`);
    } else {
      setInstructionText(prev => {
        const lines = calcItems.map((item, i) => `${i+1}. ${item.label}: ${fmtCur(item.valorOriginal)} → ${fmtCur(item.valorTotal)} (${item.details})`);
        return prev + `\n\nMEMÓRIA DE CÁLCULO:\n${lines.join("\n")}\nVALOR TOTAL: ${fmtCur(calcGrandTotal)}\n`;
      });
    }
  };

  const totalSourcesSelected = selectedJurisprudence.length + selectedDoctrine.length;
  const selectedModelLabel = PIECE_MODELS.find((m) => m.value === selectedModel)?.label;

  const renderToolboxContent = () => {
    switch (activeToolTab) {
      case 'arquivos':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Arquivos Fonte</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="btn-upload-file"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-file-upload"
              />
            </div>
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum arquivo carregado</p>
                <p className="text-xs mt-1">Suporta PDF, DOC, DOCX e imagens</p>
              </div>
            ) : (
              <div className="space-y-3">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`p-3 rounded-lg ${file.isReferenceModel ? 'bg-amber-100 border-2 border-amber-400' : 'bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm truncate max-w-[120px]">{file.name}</span>
                        {file.isReferenceModel && (
                          <Badge variant="outline" className="bg-amber-200 text-amber-800 text-[10px]">
                            Modelo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant={file.isReferenceModel ? "default" : "outline"}
                              onClick={() => {
                                const newIsRef = !file.isReferenceModel;
                                setUploadedFiles(prev => prev.map(f => 
                                  f.id === file.id ? { ...f, isReferenceModel: newIsRef } : f
                                ));
                                const isDocxFile = /\.(doc|docx)$/i.test(file.name) || file.type?.includes("word");
                                if (isDocxFile && file.data) {
                                  setTimeout(() => extractTextFromFile(file.id, file.data, file.name, file.type, newIsRef), 100);
                                }
                              }}
                              className={`h-7 w-7 p-0 ${file.isReferenceModel ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                              data-testid={`btn-toggle-model-${file.id}`}
                            >
                              <LayoutTemplate className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{file.isReferenceModel ? 'Remover como modelo de referência' : 'Usar como modelo de referência (a IA seguirá a estrutura deste documento)'}</p>
                          </TooltipContent>
                        </Tooltip>
                        {!file.extractedText && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExtractText(file.id)}
                            disabled={file.isExtracting}
                            className="text-xs h-7 px-2"
                            data-testid={`btn-ocr-file-${file.id}`}
                          >
                            {file.isExtracting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <FileText className="w-3 h-3 mr-1" />
                                OCR
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveFile(file.id)}
                          className="h-7 w-7 p-0"
                          data-testid={`btn-remove-file-${file.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {file.isExtracting && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200 text-xs flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                        <span className="text-blue-700">Extraindo texto (OCR)...</span>
                      </div>
                    )}
                    {file.extractedText && file.documents && file.documents.length > 1 && (
                      <div className="mt-2 p-2 bg-white rounded border text-xs space-y-1">
                        <p className="text-muted-foreground font-medium">Documentos identificados ({file.documents.length}):</p>
                        {file.documents.map((doc, idx) => (
                          <label key={idx} className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={doc.selected}
                              onChange={() => toggleDocumentSegment(file.id, idx)}
                              className="mt-0.5 rounded border-border"
                              data-testid={`doc-segment-${file.id}-${idx}`}
                            />
                            <div className="min-w-0">
                              <span className="font-medium">{doc.type}</span>
                              <p className="text-muted-foreground truncate">{doc.text.substring(0, 80)}...</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {file.extractedText && (!file.documents || file.documents.length <= 1) && (
                      <div className="mt-2 p-2 bg-white rounded border text-xs max-h-24 overflow-y-auto">
                        <p className="text-muted-foreground mb-1 font-medium">Texto extraído:</p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{file.extractedText.substring(0, 500)}{file.extractedText.length > 500 ? '...' : ''}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'juris':
        return (
          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar jurisprudência (Tribunais, JusBrasil, Escavador)..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearchJurisprudence(searchQuery)}
                data-testid="input-search-juris"
              />
              <Button
                onClick={() => handleSearchJurisprudence(searchQuery)}
                disabled={!searchQuery.trim() || isSearching}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="btn-search-juris"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {selectedJurisprudence.length > 0 && (
              <div className="bg-purple-50 p-2 rounded-lg">
                <p className="text-xs text-purple-700 font-medium mb-2">
                  {selectedJurisprudence.length} selecionado(s)
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedJurisprudence.map((r) => (
                    <Badge
                      key={r.id}
                      variant="secondary"
                      className="text-xs cursor-pointer"
                      onClick={() => toggleJurisprudenceSelection(r)}
                    >
                      {r.title.substring(0, 30)}... <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="h-[300px]">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  <span className="mt-3 text-muted-foreground text-sm">Buscando...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((result) => {
                    const isSelected = selectedJurisprudence.some((r) => r.id === result.id);
                    return (
                      <div
                        key={result.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-purple-50 border-purple-300' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleJurisprudenceSelection(result)}
                        data-testid={`juris-result-${result.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-2">{result.title}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {result.court && (
                                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
                                  result.url?.includes('jusbrasil.com') ? 'border-orange-300 text-orange-700 bg-orange-50' :
                                  result.url?.includes('escavador.com') ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                  'border-blue-300 text-blue-700 bg-blue-50'
                                }`}>
                                  {result.url?.includes('jusbrasil.com') ? 'JusBrasil' :
                                   result.url?.includes('escavador.com') ? 'Escavador' :
                                   result.court}
                                </Badge>
                              )}
                              {result.relevance && (
                                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
                                  result.relevance === 'alta' ? 'border-green-300 text-green-700' :
                                  result.relevance === 'media' ? 'border-yellow-300 text-yellow-700' :
                                  'border-gray-300 text-gray-500'
                                }`}>
                                  {result.relevance === 'alta' ? 'Alta' : result.relevance === 'media' ? 'Média' : 'Baixa'}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {result.summary}
                            </p>
                            {result.url && (
                              <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => window.open(result.url, '_blank')}
                                  data-testid={`juris-open-${result.id}`}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Abrir
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    const text = `${result.title}\n${result.court || ''}\n${result.url}`;
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                  }}
                                  data-testid={`juris-share-${result.id}`}
                                >
                                  <Share2 className="w-3 h-3 mr-1" />
                                  WhatsApp
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Gavel className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Pesquise jurisprudência para incluir na peça</p>
                </div>
              )}
            </ScrollArea>
          </div>
        );

      case 'doutrina':
        return (
          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar doutrina..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearchDoctrine(searchQuery)}
                data-testid="input-search-doctrine"
              />
              <Button
                onClick={() => handleSearchDoctrine(searchQuery)}
                disabled={!searchQuery.trim() || isSearching}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="btn-search-doctrine"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {selectedDoctrine.length > 0 && (
              <div className="bg-emerald-50 p-2 rounded-lg">
                <p className="text-xs text-emerald-700 font-medium mb-2">
                  {selectedDoctrine.length} selecionado(s)
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedDoctrine.map((r) => (
                    <Badge
                      key={r.id}
                      variant="secondary"
                      className="text-xs cursor-pointer"
                      onClick={() => toggleDoctrineSelection(r)}
                    >
                      {r.title.substring(0, 30)}... <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="h-[300px]">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="mt-3 text-muted-foreground text-sm">Buscando...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((result) => {
                    const isSelected = selectedDoctrine.some((r) => r.id === result.id);
                    return (
                      <div
                        key={result.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-50 border-emerald-300' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleDoctrineSelection(result)}
                        data-testid={`doctrine-result-${result.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-2">{result.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {result.summary}
                            </p>
                            {result.url && (
                              <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => window.open(result.url, '_blank')}
                                  data-testid={`doctrine-open-${result.id}`}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Abrir
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    const text = `${result.title}\n${result.summary?.substring(0, 100) || ''}\n${result.url}`;
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                  }}
                                  data-testid={`doctrine-share-${result.id}`}
                                >
                                  <Share2 className="w-3 h-3 mr-1" />
                                  WhatsApp
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Pesquise doutrina para incluir na peça</p>
                </div>
              )}
            </ScrollArea>
          </div>
        );

      case 'modelos':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-medium text-sm">Selecione o Modelo de Peça</h3>
            <div className="grid grid-cols-2 gap-2">
              {PIECE_MODELS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => setSelectedModel(model.value)}
                  className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                    selectedModel === model.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid={`model-${model.value}`}
                >
                  {model.label}
                </button>
              ))}
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium text-sm mb-2">Advogado Responsável</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedAttorney("ronald")}
                  className={`p-2 rounded-lg border text-xs transition-colors ${
                    selectedAttorney === "ronald"
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid="attorney-ronald"
                >
                  Dr. Ronald Serra<br />
                  <span className="opacity-75">OAB/DF 23.947</span>
                </button>
                <button
                  onClick={() => setSelectedAttorney("pedro")}
                  className={`p-2 rounded-lg border text-xs transition-colors ${
                    selectedAttorney === "pedro"
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid="attorney-pedro"
                >
                  Dr. Pedro Marques<br />
                  <span className="opacity-75">OAB/DF 57.058</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'timbrado':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Template Word (Timbrado)</h3>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => wordTemplateFileInputRef.current?.click()}
                  data-testid="btn-upload-template"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
              </div>
              <input
                ref={wordTemplateFileInputRef}
                type="file"
                accept=".doc,.docx"
                className="hidden"
                onChange={handleWordTemplateUpload}
                data-testid="input-template-upload"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useDefaultLetterhead"
                  checked={useDefaultLetterhead}
                  onChange={(e) => {
                    setUseDefaultLetterhead(e.target.checked);
                    if (!e.target.checked) {
                      setWordTemplateFile(null);
                    } else {
                      fetch("/api/studio/default-letterhead", { headers: getAuthHeaders(), credentials: "include" })
                        .then(res => res.json())
                        .then(data => {
                          if (data.name && data.data) {
                            setWordTemplateFile({ name: data.name, data: data.data });
                          }
                        })
                        .catch(console.error);
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300"
                  data-testid="checkbox-default-letterhead"
                />
                <label htmlFor="useDefaultLetterhead" className="text-sm font-medium text-green-700 dark:text-green-400">
                  Usar timbrado padrão do escritório
                </label>
              </div>
            </div>

            {wordTemplateFile ? (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Stamp className="w-5 h-5 text-primary" />
                  <span className="text-sm">{wordTemplateFile.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setWordTemplateFile(null);
                    setUseDefaultLetterhead(false);
                  }}
                  data-testid="btn-remove-template"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Stamp className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum template carregado</p>
                <p className="text-xs mt-1">Upload um arquivo .docx com timbrado</p>
              </div>
            )}
            
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium mb-1">Como usar:</p>
              <p>No seu arquivo Word, insira <code className="bg-background px-1 rounded">{'{CONTEUDO}'}</code> onde deseja que a peça seja inserida.</p>
              <p className="mt-1">O timbrado (cabeçalho, logo, rodapé) será preservado.</p>
            </div>

          </div>
        );

      case 'calculos':
        return (
          <div className="p-4 space-y-3">
            <h3 className="font-medium text-sm">Calculadora Judicial</h3>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
              <strong>Dica:</strong> Use <strong>Atualização</strong> para cálculo completo (correção + juros + multa). Só adicione Correção ou Juros separados se forem sobre valores distintos.
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { id: 'correcao' as const, label: 'Correção' },
                { id: 'juros' as const, label: 'Juros' },
                { id: 'atualizacao' as const, label: 'Atualização' },
                { id: 'honorarios' as const, label: 'Honorários' },
              ].map(t => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={calcType === t.id ? "default" : "outline"}
                  onClick={() => { setCalcType(t.id); }}
                  className="text-xs h-7"
                  data-testid={`calc-type-${t.id}`}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  placeholder="0,00"
                  value={calcValorOriginal}
                  onChange={(e) => setCalcValorOriginal(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="calc-valor"
                />
              </div>

              {calcType !== "honorarios" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Data Início</Label>
                    <Input
                      type="date"
                      value={calcDataInicio}
                      onChange={(e) => setCalcDataInicio(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="calc-data-inicio"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Data Fim</Label>
                    <Input
                      type="date"
                      value={calcDataFim}
                      onChange={(e) => setCalcDataFim(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="calc-data-fim"
                    />
                  </div>
                </div>
              )}

              {(calcType === "correcao" || calcType === "atualizacao") && (
                <div>
                  <Label className="text-xs">Índice</Label>
                  <Select value={calcIndice} onValueChange={setCalcIndice}>
                    <SelectTrigger className="h-8 text-sm" data-testid="calc-indice">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CALC_INDEX_RATES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(calcType === "juros" || calcType === "atualizacao") && (
                <div>
                  <Label className="text-xs">Taxa Juros (% a.m.)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={calcTaxaJuros}
                    onChange={(e) => setCalcTaxaJuros(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="calc-taxa-juros"
                  />
                </div>
              )}

              {calcType === "atualizacao" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="calc-multa"
                    checked={calcIncluirMulta}
                    onChange={(e) => setCalcIncluirMulta(e.target.checked)}
                    className="rounded border-border"
                    data-testid="calc-multa"
                  />
                  <Label htmlFor="calc-multa" className="text-xs cursor-pointer">Incluir multa 10%</Label>
                </div>
              )}

              {calcType === "honorarios" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Percentual (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={calcPercentualHonorarios}
                      onChange={(e) => setCalcPercentualHonorarios(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="calc-percentual"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={calcTipoHonorarios} onValueChange={setCalcTipoHonorarios}>
                      <SelectTrigger className="h-8 text-sm" data-testid="calc-tipo-hon">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exito">Sobre Êxito</SelectItem>
                        <SelectItem value="fixo">Fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Button
              size="sm"
              onClick={handleCalcAddItem}
              className="w-full"
              data-testid="calc-adicionar"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar ao Memorial
            </Button>

            {calcItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-xs">Memorial de Cálculo</h4>
                  <Badge variant="secondary" className="text-[10px]">{calcItems.length} {calcItems.length === 1 ? 'item' : 'itens'}</Badge>
                </div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {calcItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs gap-1">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{idx + 1}. {item.label}</span>
                        <div className="text-muted-foreground truncate">{item.details}</div>
                        <div className="font-bold text-primary">{fmtCur(item.valorTotal)}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCalcRemoveItem(item.id)}
                        className="h-6 w-6 p-0 flex-shrink-0"
                        data-testid={`calc-remove-${item.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium">TOTAL GERAL:</span>
                    <span className="font-bold text-primary text-sm" data-testid="calc-total-geral">
                      {fmtCur(calcGrandTotal)}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleCalcInsertInPiece}
                  className="w-full text-xs h-8"
                  data-testid="calc-inserir-memorial"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  {generatedHtml ? "Inserir Memorial na Peça" : "Inserir nas Instruções"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCalcItems([])}
                  className="w-full text-xs h-7"
                  data-testid="calc-limpar"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Limpar Memorial
                </Button>
              </div>
            )}
          </div>
        );

      case 'dados':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-medium text-sm">Dados do Sistema</h3>
            <p className="text-xs text-muted-foreground">Busque clientes e devedores cadastrados para usar seus dados na peça.</p>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nome ou CPF/CNPJ..."
                value={systemSearchQuery}
                onChange={(e) => setSystemSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSystem(systemSearchQuery)}
                className="h-8 text-sm"
                data-testid="input-system-search"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSearchSystem(systemSearchQuery)}
                disabled={isSearchingSystem}
                className="h-8"
                data-testid="btn-system-search"
              >
                {isSearchingSystem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {selectedSystemEntities.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-green-700">Selecionados ({selectedSystemEntities.length})</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelectedSystemEntities([])} data-testid="btn-clear-system">
                    Limpar
                  </Button>
                </div>
                {selectedSystemEntities.map((e) => {
                  const missingFields = [];
                  if (!e.document) missingFields.push('CPF/CNPJ');
                  if (!e.address) missingFields.push('Endereço');
                  if (!e.phone) missingFields.push('Telefone');
                  if (!e.email) missingFields.push('Email');
                  return (
                    <div key={`${e.entityType}-${e.id}`} className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-muted-foreground">
                            {e.entityType === 'client' ? 'Cliente' : 'Devedor'} · {e.document || 'Sem documento'}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleSystemEntity(e)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      {missingFields.length > 0 && (
                        <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-amber-700">Dados faltando no cadastro: {missingFields.join(', ')}. Complete no módulo Clientes para que a IA preencha corretamente.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {systemSearchResults.length > 0 && (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-1">
                  {systemSearchResults.map((entity) => {
                    const isSelected = selectedSystemEntities.some(e => e.id === entity.id && e.entityType === entity.entityType);
                    return (
                      <div
                        key={`${entity.entityType}-${entity.id}`}
                        className={`p-2 rounded border cursor-pointer transition-colors text-xs ${
                          isSelected ? 'bg-green-50 border-green-300' : 'bg-card hover:bg-muted/50 border-border'
                        }`}
                        onClick={() => toggleSystemEntity(entity)}
                        data-testid={`system-entity-${entity.entityType}-${entity.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{entity.name}</div>
                          <Badge variant={entity.entityType === 'client' ? 'default' : 'secondary'} className="text-[10px]">
                            {entity.entityType === 'client' ? 'Cliente' : 'Devedor'}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground mt-0.5 space-y-0.5">
                          {entity.document && <div>Doc: {entity.document}</div>}
                          {entity.phone && <div>Tel: {entity.phone}</div>}
                          {entity.email && <div>Email: {entity.email}</div>}
                          {entity.address && <div>End: {entity.address}{entity.city ? `, ${entity.city}` : ''}{entity.state ? `/${entity.state}` : ''}{entity.zipCode ? ` - ${entity.zipCode}` : ''}</div>}
                          {entity.clientName && <div>Cliente: {entity.clientName}</div>}
                        </div>
                        {isSelected && (
                          <div className="mt-1 text-green-600 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3" /> Selecionado
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {systemSearchResults.length === 0 && systemSearchQuery && !isSearchingSystem && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                Nenhum resultado encontrado para "{systemSearchQuery}"
              </div>
            )}
          </div>
        );

      case 'humanizar':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              <h3 className="font-medium text-sm">Humanizar Peça Existente</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Faça upload de uma peça pronta (Word ou PDF) e humanize-a para parecer escrita por advogado humano. Citações de jurisprudência, artigos de lei e citações literais são preservadas intactas.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Intensidade</label>
                <div className="space-y-1">
                  {[
                    { value: "leve", label: "Leve", desc: "Ajustes sutis, 95% preservado" },
                    { value: "moderado", label: "Moderado", desc: "Reescrita parcial, 50% alterado" },
                    { value: "intenso", label: "Intenso", desc: "Reescrita total, estilo único" },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-start gap-2 p-2 rounded cursor-pointer border text-sm ${humanizeIntensity === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-gray-50'}`} data-testid={`humanize-upload-level-${opt.value}`}>
                      <input type="radio" name="humanize-upload-intensity" value={opt.value} checked={humanizeIntensity === opt.value} onChange={() => setHumanizeIntensity(opt.value)} className="mt-0.5" />
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer" onClick={() => humanizeFileRef.current?.click()} data-testid="humanize-upload-area">
                <input ref={humanizeFileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleHumanizeFileUpload} data-testid="humanize-file-input" />
                {isHumanizeUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                    <p className="text-sm text-muted-foreground">Extraindo texto...</p>
                  </div>
                ) : humanizeUploadText ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-700">Arquivo carregado</p>
                    <p className="text-xs text-muted-foreground">{humanizeUploadText.length} caracteres extraídos</p>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setHumanizeUploadText(""); }} data-testid="humanize-clear-upload">
                      Limpar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Arraste ou clique para upload</p>
                    <p className="text-xs text-muted-foreground">PDF ou Word (.docx)</p>
                  </div>
                )}
              </div>
              {humanizeUploadText && (
                <div className="space-y-2">
                  <Textarea
                    value={humanizeUploadText}
                    onChange={(e) => setHumanizeUploadText(e.target.value)}
                    placeholder="Ou cole o texto da peça aqui..."
                    className="min-h-[120px] text-xs"
                    data-testid="humanize-text-area"
                  />
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleHumanizeUploaded} disabled={isHumanizing || !humanizeUploadText.trim()} data-testid="btn-humanize-uploaded">
                    {isHumanizing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    {isHumanizing ? "Humanizando..." : "Humanizar Peça"}
                  </Button>
                </div>
              )}
              {!humanizeUploadText && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex-1 h-px bg-border"></div>
                    <span>ou cole o texto</span>
                    <div className="flex-1 h-px bg-border"></div>
                  </div>
                  <Textarea
                    value={humanizeUploadText}
                    onChange={(e) => setHumanizeUploadText(e.target.value)}
                    placeholder="Cole o texto da peça aqui..."
                    className="min-h-[120px] text-xs"
                    data-testid="humanize-paste-area"
                  />
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="studio" className="gap-2" data-testid="tab-studio">
                <Sparkles className="w-4 h-4" />
                Studio
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
                <History className="w-4 h-4" />
                Histórico ({pieces.length})
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-2" data-testid="tab-templates">
                <LayoutTemplate className="w-4 h-4" />
                Modelos ({templates.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="studio" className="flex-1 m-0 flex flex-col gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isToolboxOpen ? "default" : "outline"}
                          size="icon"
                          onClick={() => setIsToolboxOpen(!isToolboxOpen)}
                          className="flex-shrink-0"
                          data-testid="btn-toggle-toolbox"
                        >
                          {isToolboxOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">{isToolboxOpen ? "Fechar Ferramentas" : "Abrir Ferramentas"}</p>
                        <p className="text-xs text-muted-foreground">
                          Acesse pesquisa de jurisprudência, doutrina, arquivos, modelos e timbrado
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <Textarea
                        value={instructionText}
                        onChange={(e) => setInstructionText(e.target.value)}
                        placeholder="Descreva detalhadamente a peça que deseja gerar. Inclua informações do caso, partes envolvidas, tese a ser defendida..."
                        className="min-h-[100px] resize-none flex-1"
                        data-testid="textarea-instructions"
                      />
                      <div className="flex flex-col gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setShowCaseDialog(true)}
                                className="flex-shrink-0 h-10"
                                data-testid="btn-case-notes"
                              >
                                <Briefcase className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="font-semibold">Registrar Fatos do Caso</p>
                              <p className="text-xs text-muted-foreground">
                                Grave informações do caso por voz ou texto. A IA irá organizar e extrair os fatos relevantes para o documento.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={handleSuggestSearch}
                                disabled={!instructionText.trim() || instructionText.length < 10 || isLoadingSuggestions}
                                className="flex-shrink-0 h-10"
                                data-testid="btn-suggest-search"
                              >
                                {isLoadingSuggestions ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Lightbulb className="w-4 h-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="font-semibold">Sugerir Pesquisas</p>
                              <p className="text-xs text-muted-foreground">
                                {instructionText.length < 10 
                                  ? "Digite pelo menos 10 caracteres nas instruções para usar" 
                                  : "A IA irá analisar suas instruções e sugerir termos para buscar jurisprudência e doutrina relevantes"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    {(suggestedJurisTerms.length > 0 || suggestedDoctrineTerms.length > 0) && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                          <Lightbulb className="w-4 h-4" />
                          Termos sugeridos pela IA
                        </div>
                        {suggestedJurisTerms.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-700 flex items-center gap-1">
                              <Gavel className="w-3 h-3" /> Jurisprudência:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {suggestedJurisTerms.map((term, i) => (
                                <Badge
                                  key={`juris-${i}`}
                                  variant="secondary"
                                  className="cursor-pointer hover:bg-purple-100 hover:text-purple-800 transition-colors"
                                  onClick={() => handleSuggestedTermClick(term, 'juris')}
                                  data-testid={`suggested-juris-${i}`}
                                >
                                  {term}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {suggestedDoctrineTerms.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-700 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" /> Doutrina:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {suggestedDoctrineTerms.map((term, i) => (
                                <Badge
                                  key={`doctrine-${i}`}
                                  variant="secondary"
                                  className="cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors"
                                  onClick={() => handleSuggestedTermClick(term, 'doutrina')}
                                  data-testid={`suggested-doctrine-${i}`}
                                >
                                  {term}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-2">
                        {selectedModelLabel && (
                          <Badge variant="secondary" className="gap-1" data-testid="badge-model">
                            <LayoutTemplate className="w-3 h-3" />
                            {selectedModelLabel}
                          </Badge>
                        )}
                        {wordTemplateFile && (
                          <Badge variant="outline" className="gap-1" data-testid="badge-branding">
                            <Stamp className="w-3 h-3" />
                            Timbrado carregado
                          </Badge>
                        )}
                        {totalSourcesSelected > 0 && (
                          <Badge variant="outline" className="gap-1" data-testid="badge-sources">
                            <BookOpen className="w-3 h-3" />
                            {totalSourcesSelected} fonte(s)
                          </Badge>
                        )}
                        {uploadedFiles.length > 0 && (
                          <Badge variant="outline" className="gap-1" data-testid="badge-files">
                            <FileText className="w-3 h-3" />
                            {uploadedFiles.length} arquivo(s)
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {draftSavedAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-draft-saved">
                            <Check className="w-3 h-3 text-green-500" />
                            Rascunho salvo automaticamente
                          </span>
                        )}
                        {hasDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearDraft}
                            className="text-xs text-muted-foreground gap-1 h-7"
                            data-testid="btn-clear-draft"
                          >
                            <Trash2 className="w-3 h-3" />
                            Novo documento
                          </Button>
                        )}
                        <Button
                          onClick={handleGenerate}
                          disabled={!instructionText.trim() || !selectedModel || isGenerating}
                          className="gap-2"
                          data-testid="btn-generate"
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Gerando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Gerar Peça
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {generatedHtml ? (
              <div className="flex gap-4 flex-1">
                {showSourcesPanel && (
                  <Card className="w-96 flex-shrink-0" data-testid="sources-panel">
                    <CardHeader className="pb-2 flex-row justify-between items-center">
                      <CardTitle className="text-sm">Fontes & Ferramentas</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSourcesPanel(false)}
                        className="h-6 w-6"
                        data-testid="btn-hide-sources"
                      >
                        <PanelLeftClose className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="flex border-b overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent" style={{ scrollbarWidth: 'thin' }}>
                        {[
                          { id: 'arquivos' as ToolTab, label: 'Arquivos', icon: FolderOpen },
                          { id: 'dados' as ToolTab, label: 'Cadastro', icon: Briefcase },
                          { id: 'juris' as ToolTab, label: 'Juris', icon: Gavel },
                          { id: 'doutrina' as ToolTab, label: 'Doutrina', icon: BookOpen },
                          { id: 'modelos' as ToolTab, label: 'Peças Processuais', icon: LayoutTemplate },
                          { id: 'timbrado' as ToolTab, label: 'Timbrado', icon: Stamp },
                          { id: 'calculos' as ToolTab, label: 'Cálculos', icon: Calculator },
                          { id: 'humanizar' as ToolTab, label: 'Humanizar', icon: Wand2 },
                        ].map((tab) => (
                          <TooltipProvider key={tab.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => {
                                    setActiveToolTab(tab.id);
                                    setSearchQuery("");
                                    setSearchResults([]);
                                  }}
                                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap flex-shrink-0 ${
                                    activeToolTab === tab.id
                                      ? 'border-primary text-primary bg-primary/5'
                                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                  }`}
                                  data-testid={`toolbox-tab-${tab.id}`}
                                >
                                  <tab.icon className="w-3.5 h-3.5" />
                                  {tab.label}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>{tab.label}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                      <ScrollArea className="h-[calc(100vh-24rem)]">
                        {renderToolboxContent()}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {isPreviewMaximized && (
                  <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col" data-testid="fullscreen-preview-overlay">
                    <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-background shadow-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        <span className="font-semibold text-lg">Visualização</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={pieceTitle}
                          onChange={(e) => setPieceTitle(e.target.value)}
                          placeholder="Título da peça..."
                          className="w-60"
                          data-testid="input-piece-title-fullscreen"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportWord(generatedHtml, pieceTitle || "Peça Jurídica")}
                          data-testid="btn-export-word-fullscreen"
                        >
                          <FileDown className="w-4 h-4 mr-2" />
                          Word
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSavePiece}
                          disabled={!pieceTitle.trim() || savePieceMutation.isPending}
                          data-testid="btn-save-piece-fullscreen"
                        >
                          {savePieceMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          Salvar
                        </Button>
                        <div className="relative">
                          <Button
                            variant={isHumanized ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowHumanizeOptions(!showHumanizeOptions)}
                            disabled={isHumanizing}
                            className={isHumanized ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                            data-testid="btn-humanize-toggle-fs"
                          >
                            {isHumanizing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                            {isHumanizing ? "Humanizando..." : isHumanized ? "Humanizada" : "Humanizar"}
                          </Button>
                          {showHumanizeOptions && (
                            <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg p-3 z-50 w-64">
                              <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-emerald-600" />
                                <span className="font-medium text-sm">Anti-detecção IA</span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-3">Reescreve a peça para parecer escrita por advogado humano</p>
                              <div className="space-y-1.5 mb-3">
                                {[
                                  { value: "leve", label: "Leve", desc: "Ajustes sutis, 95% preservado" },
                                  { value: "moderado", label: "Moderado", desc: "Reescrita parcial, 50% alterado" },
                                  { value: "intenso", label: "Intenso", desc: "Reescrita total, estilo único" },
                                ].map(opt => (
                                  <label key={opt.value} className={`flex items-start gap-2 p-2 rounded cursor-pointer border ${humanizeIntensity === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-gray-50'}`}>
                                    <input type="radio" name="humanize-intensity-fs" value={opt.value} checked={humanizeIntensity === opt.value} onChange={() => setHumanizeIntensity(opt.value)} className="mt-0.5" />
                                    <div><span className="text-sm font-medium">{opt.label}</span><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleHumanize} disabled={isHumanizing} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                                  {isHumanizing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                                  Aplicar
                                </Button>
                                {isHumanized && (
                                  <Button size="sm" variant="outline" onClick={handleUndoHumanize}>
                                    <Undo2 className="w-3 h-3 mr-1" /> Desfazer
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" data-testid="btn-protocolar-menu-fs">
                              <Stamp className="w-4 h-4 mr-2" />
                              Protocolar
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenPjeWithChecklist("https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth?response_type=code&client_id=pje-tjdft-1g&redirect_uri=https%3A%2F%2Fpje.tjdft.jus.br%2Fpje%2Flogin.seam&state=e5b16a9d-db9e-4464-8aa6-d75bf8e90879&login=true&scope=openid")} data-testid="btn-protocol-tjdft-fullscreen">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              PJe TJDFT + Checklist
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPjeWithChecklist("https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth?response_type=code&client_id=pje-trf1-1g&redirect_uri=https%3A%2F%2Fpje1g.trf1.jus.br%2Fpje%2Flogin.seam%3Bjsessionid%3DjOszUS9xtjYwxPN-RM9c3s71TLmdpfR5oj86hzFP.pje1gprdwf09?cid%3D6798&state=8de84578-9e50-4ec5-8914-8624b73e322a&login=true&scope=openid")} data-testid="btn-protocol-trf1-fullscreen">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              PJe TRF1 + Checklist
                            </DropdownMenuItem>
                            {generatedHtml && (
                              <DropdownMenuItem onClick={handleOpenProtocolChecklist} disabled={isExtractingProtocol} data-testid="btn-protocol-checklist-fullscreen">
                                {isExtractingProtocol ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                                Checklist PJe
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsPreviewMaximized(false)}
                          className="gap-1.5"
                          data-testid="btn-exit-fullscreen"
                        >
                          <Minimize2 className="w-4 h-4" />
                          Voltar
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6" style={{ overflowX: 'auto' }}>
                      <div
                        className="mx-auto bg-white shadow-lg border relative"
                        style={{
                          maxWidth: '210mm',
                          width: '100%',
                          minWidth: '600px',
                          minHeight: '297mm',
                          fontFamily: 'Times New Roman, serif',
                          fontSize: '12pt',
                          lineHeight: '1.5',
                        }}
                      >
                        {wordTemplateFile && (
                          <div 
                            className="bg-gradient-to-b from-gray-100 to-transparent border-b border-dashed border-gray-300"
                            style={{ height: '45mm', padding: '5mm 20mm', marginBottom: '5mm' }}
                          >
                            <div className="flex items-center justify-center h-full">
                              <div className="text-center text-gray-400 text-sm">
                                <Stamp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="font-medium">{wordTemplateFile.name}</p>
                                <p className="text-xs">Área do timbrado do escritório</p>
                              </div>
                            </div>
                          </div>
                        )}
                        <div style={{ padding: wordTemplateFile ? '0 20mm 25mm 20mm' : '25mm 20mm' }}>
                          <div
                            dangerouslySetInnerHTML={{ __html: generatedHtml }}
                            className="piece-preview-content max-w-none"
                            style={{ textAlign: 'justify', fontFamily: 'Times New Roman, serif', fontSize: '12pt', lineHeight: '2' }}
                            data-testid="fullscreen-piece-content"
                          />
                        </div>
                        {wordTemplateFile && (
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-100 to-transparent border-t border-dashed border-gray-300"
                            style={{ height: '20mm', padding: '3mm 20mm' }}
                          >
                            <div className="flex items-center justify-center h-full">
                              <p className="text-xs text-gray-400">Área de rodapé do timbrado</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <Card className="flex-1 min-w-0">
                  <CardHeader className="pb-3 flex-row justify-between items-center">
                    <div className="flex items-center gap-2">
                      {!showSourcesPanel && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowSourcesPanel(true)}
                          className="h-8 w-8"
                          data-testid="btn-show-sources"
                        >
                          <PanelLeft className="w-4 h-4" />
                        </Button>
                      )}
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Visualização
                      </CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={pieceTitle}
                        onChange={(e) => setPieceTitle(e.target.value)}
                        placeholder="Título da peça..."
                        className="w-60"
                        data-testid="input-piece-title"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportWord(generatedHtml, pieceTitle || "Peça Jurídica")}
                        data-testid="btn-export-word"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                      Word
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePiece}
                      disabled={!pieceTitle.trim() || savePieceMutation.isPending}
                      data-testid="btn-save-piece"
                    >
                      {savePieceMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar
                    </Button>
                    {isHumanized && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Humanizada
                      </span>
                    )}
                  </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsPreviewMaximized(true)}
                            className="h-8 w-8"
                            data-testid="btn-toggle-preview-maximize"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Maximizar visualização</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[calc(100vh-28rem)] overflow-y-auto overflow-x-auto">
                      <div
                        className="mx-auto bg-white shadow-lg border relative"
                        style={{
                          maxWidth: '210mm',
                          width: '100%',
                          minWidth: '600px',
                          minHeight: '297mm',
                          fontFamily: 'Times New Roman, serif',
                          fontSize: '12pt',
                          lineHeight: '1.5',
                        }}
                      >
                        {/* Área do Timbrado (Cabeçalho) */}
                        {wordTemplateFile && (
                          <div 
                            className="bg-gradient-to-b from-gray-100 to-transparent border-b border-dashed border-gray-300"
                            style={{ 
                              height: '45mm', 
                              padding: '5mm 20mm',
                              marginBottom: '5mm'
                            }}
                          >
                            <div className="flex items-center justify-center h-full">
                              <div className="text-center text-gray-400 text-sm">
                                <Stamp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="font-medium">{wordTemplateFile.name}</p>
                                <p className="text-xs">Área do timbrado do escritório</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Conteúdo do documento */}
                        <div style={{ padding: wordTemplateFile ? '0 20mm 25mm 20mm' : '25mm 20mm' }}>
                          <div
                            className="piece-inline-content max-w-none"
                            style={{ textAlign: 'justify', fontFamily: 'Times New Roman, serif', fontSize: '12pt', lineHeight: '2' }}
                            dangerouslySetInnerHTML={{ __html: generatedHtml }}
                          />
                        </div>
                        
                        {/* Área do Rodapé */}
                        {wordTemplateFile && (
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-100 to-transparent border-t border-dashed border-gray-300"
                            style={{ 
                              height: '20mm', 
                              padding: '3mm 20mm'
                            }}
                          >
                            <div className="flex items-center justify-center h-full">
                              <p className="text-xs text-gray-400">Área de rodapé do timbrado</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            ) : (
              <>
                {isToolboxOpen && (
                  <Card data-testid="toolbox">
                    <CardContent className="p-0">
                      <div className="flex border-b">
                        {[
                          { id: 'arquivos' as ToolTab, label: 'Arquivos', icon: FolderOpen, tooltip: 'Upload de documentos e PDFs para extrair texto via OCR' },
                          { id: 'dados' as ToolTab, label: 'Cadastro', icon: Briefcase, tooltip: 'Buscar dados de clientes e devedores do sistema' },
                          { id: 'juris' as ToolTab, label: 'Juris', icon: Gavel, tooltip: 'Pesquisar jurisprudência nos tribunais brasileiros' },
                          { id: 'doutrina' as ToolTab, label: 'Doutrina', icon: BookOpen, tooltip: 'Pesquisar doutrina e autores jurídicos no Google Scholar' },
                          { id: 'modelos' as ToolTab, label: 'Modelos', icon: LayoutTemplate, tooltip: 'Selecionar tipo de peça jurídica a ser gerada' },
                          { id: 'timbrado' as ToolTab, label: 'Timbrado', icon: Stamp, tooltip: 'Upload de modelo Word com papel timbrado do escritório' },
                          { id: 'calculos' as ToolTab, label: 'Cálculos', icon: Calculator, tooltip: 'Calculadora judicial: correção monetária, juros, honorários' },
                          { id: 'humanizar' as ToolTab, label: 'Humanizar', icon: Wand2, tooltip: 'Humanizar peça existente (upload)' },
                        ].map((tab) => (
                          <TooltipProvider key={tab.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => {
                                    setActiveToolTab(tab.id);
                                    setSearchQuery("");
                                    setSearchResults([]);
                                  }}
                                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                                    activeToolTab === tab.id
                                      ? 'border-primary text-primary'
                                      : 'border-transparent text-muted-foreground hover:text-foreground'
                                  }`}
                                  data-testid={`toolbox-tab-${tab.id}`}
                                >
                                  <tab.icon className="w-4 h-4" />
                                  {tab.label}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{tab.tooltip}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                      {renderToolboxContent()}
                    </CardContent>
                  </Card>
                )}

                <Card className="flex-1">
                  <CardHeader className="pb-3 flex-row justify-between items-center">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Visualização
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[calc(100vh-32rem)] overflow-y-auto overflow-x-auto">
                      <div
                        className="mx-auto bg-white shadow-lg border"
                        style={{
                          maxWidth: '210mm',
                          width: '100%',
                          minWidth: '600px',
                          minHeight: '297mm',
                          padding: '25mm 20mm',
                          fontFamily: 'Times New Roman, serif',
                          fontSize: '12pt',
                          lineHeight: '1.5',
                        }}
                      >
                        {isGenerating ? (
                          <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">Gerando sua peça jurídica...</p>
                            <p className="text-xs text-muted-foreground mt-2">Isso pode levar alguns segundos</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                            <FileText className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-medium">Sua peça aparecerá aqui</p>
                            <p className="text-sm mt-2 max-w-md text-center">
                              Preencha as instruções acima, selecione um modelo de peça e clique em "Gerar Peça" para começar.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <p>A LexAI pode cometer erros. Verifique sempre as fontes citadas. Toda produção requer validação humana.</p>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 m-0">
            <div className="h-full flex gap-4">
              <Card className="w-80 flex-shrink-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Peças Geradas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-20rem)]">
                    {piecesLoading ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Carregando...
                      </div>
                    ) : pieces.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Nenhuma peça salva ainda.</p>
                        <p className="text-xs mt-1">Use o Studio para gerar e salvar peças.</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {pieces.map((piece) => (
                          <button
                            key={piece.id}
                            onClick={() => setSelectedPiece(piece)}
                            className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${selectedPiece?.id === piece.id ? 'bg-muted' : ''}`}
                            data-testid={`piece-item-${piece.id}`}
                          >
                            <p className="font-medium text-sm truncate">{piece.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(piece.createdAt), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="flex-1">
                {selectedPiece ? (
                  <>
                    <CardHeader className="pb-3 flex-row justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{selectedPiece.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          Criado em {format(new Date(selectedPiece.createdAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleExportWord(selectedPiece.contentHtml, selectedPiece.title)}
                          data-testid="btn-export-word-history"
                        >
                          <FileDown className="w-4 h-4 mr-2" />
                          Word
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleShareWhatsApp(selectedPiece.contentHtml, selectedPiece.title)}
                          data-testid="btn-share-whatsapp"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          WhatsApp
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => deletePieceMutation.mutate(selectedPiece.id)}
                          disabled={deletePieceMutation.isPending}
                          data-testid="btn-delete-piece"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[calc(100vh-22rem)]">
                        <div 
                          className="prose prose-sm max-w-none"
                          style={{ textAlign: 'justify' }}
                          dangerouslySetInnerHTML={{ __html: selectedPiece.contentHtml }}
                        />
                      </ScrollArea>
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Selecione uma peça para visualizar</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="templates" className="flex-1 m-0">
            <div className="h-full flex gap-4">
              <Card className="w-80 flex-shrink-0">
                <CardHeader className="pb-3 flex-row justify-between items-center">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LayoutTemplate className="w-5 h-5" />
                    Modelos
                  </CardTitle>
                  <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="btn-new-template">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Criar Novo Modelo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Nome do Modelo</Label>
                            <Input 
                              value={templateForm.name} 
                              onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Ex: Petição Inicial Trabalhista"
                              data-testid="input-template-name"
                            />
                          </div>
                          <div>
                            <Label>Categoria</Label>
                            <Select value={templateForm.category} onValueChange={(v) => setTemplateForm(prev => ({ ...prev, category: v }))}>
                              <SelectTrigger data-testid="select-template-category">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TEMPLATE_CATEGORIES.map(cat => (
                                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Descrição</Label>
                          <Input 
                            value={templateForm.description} 
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Breve descrição do modelo..."
                            data-testid="input-template-description"
                          />
                        </div>
                        <div>
                          <Label>Conteúdo do Modelo</Label>
                          <Textarea 
                            value={templateForm.contentHtml} 
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, contentHtml: e.target.value }))}
                            placeholder="Digite o conteúdo do modelo aqui. Use {{variavel}} para campos dinâmicos..."
                            className="min-h-[200px]"
                            data-testid="input-template-content"
                          />
                        </div>
                        <Button 
                          onClick={() => saveTemplateMutation.mutate(templateForm)} 
                          className="w-full"
                          disabled={!templateForm.name.trim() || !templateForm.contentHtml.trim() || saveTemplateMutation.isPending}
                          data-testid="btn-save-template"
                        >
                          {saveTemplateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          Salvar Modelo
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-20rem)]">
                    {templatesLoading ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Carregando...
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">
                        <LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Nenhum modelo criado.</p>
                        <p className="text-xs mt-1">Crie modelos para agilizar a geração de peças.</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {templates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template)}
                            className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${selectedTemplate?.id === template.id ? 'bg-muted' : ''}`}
                            data-testid={`template-item-${template.id}`}
                          >
                            <p className="font-medium text-sm truncate">{template.name}</p>
                            <p className="text-xs text-muted-foreground mt-1 capitalize">{template.category}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="flex-1">
                {selectedTemplate ? (
                  <>
                    <CardHeader className="pb-3 flex-row justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{selectedTemplate.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                          Categoria: {selectedTemplate.category}
                          {selectedTemplate.description && ` • ${selectedTemplate.description}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => {
                            setInstructionText(`Use o seguinte modelo como base:\n\n${selectedTemplate.contentHtml.replace(/<[^>]*>/g, '')}`);
                            setActiveTab("studio");
                          }}
                          data-testid="btn-use-template"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Usar Modelo
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleExportWord(selectedTemplate.contentHtml, selectedTemplate.name)}
                          data-testid="btn-export-template"
                        >
                          <FileDown className="w-4 h-4 mr-2" />
                          Word
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => deleteTemplateMutation.mutate(selectedTemplate.id)}
                          disabled={deleteTemplateMutation.isPending}
                          data-testid="btn-delete-template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[calc(100vh-22rem)]">
                        <div 
                          className="prose prose-sm max-w-none whitespace-pre-wrap"
                          style={{ textAlign: 'justify' }}
                          dangerouslySetInnerHTML={{ __html: selectedTemplate.contentHtml }}
                        />
                      </ScrollArea>
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <LayoutTemplate className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Selecione um modelo para visualizar</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Case Notes Dialog */}
      <Dialog open={showCaseDialog} onOpenChange={setShowCaseDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Registro de Fatos do Caso
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Registre informações do caso por voz ou texto. A IA irá processar e extrair os fatos relevantes.
            </p>

            {/* Voice/Text Input Area */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Textarea
                  value={currentNoteText}
                  onChange={(e) => setCurrentNoteText(e.target.value)}
                  placeholder={isRecording ? "Falando..." : "Digite as informações do caso ou use o microfone..."}
                  className={`min-h-[80px] flex-1 ${isRecording ? 'border-red-500 bg-red-50' : ''}`}
                  disabled={isRecording}
                  data-testid="textarea-case-notes"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    className="h-10 w-10"
                    title={isRecording ? "Parar gravação" : "Iniciar gravação de voz"}
                    data-testid="btn-voice-record"
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => addCaseNote(currentNoteText, 'text')}
                    disabled={!currentNoteText.trim() || isRecording}
                    className="h-10 w-10"
                    title="Adicionar nota"
                    data-testid="btn-add-note"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {isRecording && (
                <div className="flex items-center gap-2 text-red-600 text-sm animate-pulse">
                  <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                  Gravando... Fale as informações do caso
                </div>
              )}
            </div>

            {/* Notes List */}
            {caseNotes.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Anotações ({caseNotes.length})
                </Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {caseNotes.map((note) => (
                    <div key={note.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded border">
                      <div className="flex-shrink-0">
                        {note.source === 'voice' ? (
                          <Mic className="w-4 h-4 text-blue-500" />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-500" />
                        )}
                      </div>
                      <p className="text-sm flex-1">{note.text}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCaseNote(note.id)}
                        className="h-6 w-6 flex-shrink-0"
                        data-testid={`btn-remove-note-${note.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Process Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCaseNotes([]);
                  setCurrentNoteText("");
                  setShowCaseDialog(false);
                }}
                data-testid="btn-cancel-case"
              >
                Cancelar
              </Button>
              <Button
                onClick={processCaseNotes}
                disabled={caseNotes.length === 0 || isProcessingCase}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="btn-process-case"
              >
                {isProcessingCase ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Processar Fatos ({caseNotes.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showProtocolChecklist && (
        <div
          className="fixed z-50 bg-white border border-slate-300 rounded-lg shadow-2xl flex flex-col"
          style={{ left: popupPos.x, top: popupPos.y, width: popupSize.w, height: popupSize.h, minWidth: 380, minHeight: 400 }}
          data-testid="checklist-popup"
        >
          <div
            className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg cursor-grab select-none"
            onMouseDown={handlePopupDragStart}
            data-testid="checklist-popup-titlebar"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 opacity-60" />
              <ClipboardList className="w-4 h-4" />
              <span className="font-semibold text-sm">Checklist PJe</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-white hover:bg-blue-500" onClick={handleExtractProtocolData} data-testid="btn-refresh-popup" title="Atualizar extração">
                <Loader2 className={`w-3.5 h-3.5 ${isExtractingProtocol ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-white hover:bg-blue-500" onClick={copyAllProtocolData} data-testid="btn-copy-all-popup" title="Copiar tudo">
                <ClipboardCheck className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-white hover:bg-blue-500" onClick={handleOpenChecklistWindow} data-testid="btn-popout-popup" title="Abrir em nova janela">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-white hover:bg-red-500" onClick={() => setShowProtocolChecklist(false)} data-testid="btn-close-popup">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
            {isExtractingProtocol ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-sm text-muted-foreground">Extraindo dados da peça e documentos...</span>
              </div>
            ) : protocolData ? (
              <>
                <div className="mb-3 p-2 bg-slate-50 border border-slate-200 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      Documentos Adicionais ({checklistDocNames.length})
                    </span>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => checklistFileRef.current?.click()} disabled={isUploadingChecklistDoc} data-testid="btn-upload-checklist-doc">
                      {isUploadingChecklistDoc ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                      Adicionar
                    </Button>
                    <input ref={checklistFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple onChange={handleChecklistDocUpload} />
                  </div>
                  {checklistDocNames.length > 0 && (
                    <div className="space-y-1">
                      {checklistDocNames.map((name, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border">
                          <span className="flex items-center gap-1 truncate"><File className="w-3 h-3 text-blue-500 shrink-0" />{name}</span>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setChecklistDocNames(prev => prev.filter((_, idx) => idx !== i)); setChecklistDocTexts(prev => prev.filter((_, idx) => idx !== i)); }} data-testid={`btn-remove-checklist-doc-${i}`}>
                            <X className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ))}
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" />
                        Clique em ⟳ para re-extrair incluindo os novos documentos
                      </p>
                    </div>
                  )}
                </div>

                <Tabs value={protocolTab} onValueChange={setProtocolTab}>
                  <TabsList className="w-full grid grid-cols-4 mb-3">
                    <TabsTrigger value="dados" className="text-xs">Dados Iniciais</TabsTrigger>
                    <TabsTrigger value="assuntos" className="text-xs">Assuntos</TabsTrigger>
                    <TabsTrigger value="partes" className="text-xs">Partes</TabsTrigger>
                    <TabsTrigger value="caract" className="text-xs">Características</TabsTrigger>
                  </TabsList>
                  <TabsContent value="dados" className="space-y-2">
                    {[
                      { label: "Matéria", value: protocolData.dadosIniciais.materia, id: "pop-materia" },
                      { label: "Jurisdição", value: protocolData.dadosIniciais.jurisdicao, id: "pop-jurisdicao" },
                      { label: "Classe Judicial", value: protocolData.dadosIniciais.classeJudicial, id: "pop-classe" },
                    ].map(f => (
                      <div key={f.id} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <div><span className="text-muted-foreground text-xs">{f.label}*</span><p className="font-medium">{f.value}</p></div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyField(f.value, f.id)} data-testid={`btn-copy-${f.id}`}>
                          {copiedField === f.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    ))}
                    {protocolData.jurisdicoesTJDFT && protocolData.jurisdicoesTJDFT.length > 0 && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                        <div className="flex items-center gap-1 mb-2">
                          <MapPin className="w-3 h-3 text-blue-600" />
                          <span className="text-muted-foreground text-xs font-medium">Fórum / Jurisdição TJDFT*</span>
                        </div>
                        <Select value={selectedForum} onValueChange={(v) => setSelectedForum(v)}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-forum-popup">
                            <SelectValue placeholder="Selecione o fórum..." />
                          </SelectTrigger>
                          <SelectContent>
                            {protocolData.jurisdicoesTJDFT.map((f) => (
                              <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedForum && (
                          <div className="flex items-center justify-between mt-2 p-1.5 bg-green-50 border border-green-200 rounded">
                            <span className="text-xs font-medium">{selectedForum}</span>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => copyField(selectedForum, 'pop-forum')} data-testid="btn-copy-pop-forum">
                              {copiedField === 'pop-forum' ? <Check className="w-2.5 h-2.5 text-green-600" /> : <Copy className="w-2.5 h-2.5" />}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="assuntos" className="space-y-2">
                    {protocolData.assunto?.sugestao ? (
                      <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-muted-foreground text-xs">Assunto Sugerido*</span>
                            <p className="font-medium">{protocolData.assunto.sugestao}</p>
                            {protocolData.assunto.codigo && <p className="text-xs text-muted-foreground">Código CNJ: {protocolData.assunto.codigo}</p>}
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyField(protocolData.assunto.sugestao || '', 'pop-assunto')} data-testid="btn-copy-pop-assunto">
                            {copiedField === 'pop-assunto' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Pesquise no PJe pelo assunto sugerido e selecione o mais adequado
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                        Não foi possível sugerir o assunto. Pesquise na tabela de assuntos do PJe.
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="partes" className="space-y-3">
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-muted-foreground text-xs">Procurador (Advogado)</span>
                          <p className="font-medium">{protocolData.procurador.nome}</p>
                          <p className="text-xs">{protocolData.procurador.oab}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyField(`${protocolData.procurador.nome} - ${protocolData.procurador.oab}`, 'pop-proc')} data-testid="btn-copy-pop-proc">
                          {copiedField === 'pop-proc' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                    {[{ polo: protocolData.poloAtivo, label: "POLO ATIVO (Autor)", prefix: "pop-ativo", color: "green", icon: <User className="w-3 h-3" /> },
                      { polo: protocolData.poloPassivo, label: "POLO PASSIVO (Réu)", prefix: "pop-passivo", color: "red", icon: <Users className="w-3 h-3" /> }]
                      .filter(p => p.polo?.length > 0).map(({ polo, label, prefix, color, icon }) => (
                      <div key={prefix}>
                        <h4 className={`font-semibold text-xs text-${color}-700 mb-2 flex items-center gap-1`}>{icon} {label}</h4>
                        {polo.map((parte: ProtocolParteData, idx: number) => (
                          <div key={`${prefix}-${idx}`} className={`border border-${color}-200 rounded p-2 mb-2 bg-white space-y-1`}>
                            <div className="flex items-center justify-between border-b pb-1 mb-1">
                              <span className="font-medium text-sm">{parte.nome || 'N/A'}</span>
                              <Badge variant="outline" className="text-xs">{parte.tipoPessoa === 'PJ' ? 'PJ' : 'PF'}</Badge>
                            </div>
                            {([
                              { label: "Nome Civil", value: parte.nome }, { label: parte.documentoTipo || "CPF", value: parte.documentoNumero },
                              { label: "RG", value: parte.rg }, { label: "Mãe", value: parte.genitora }, { label: "Pai", value: parte.genitor },
                              { label: "Sexo", value: parte.sexo }, { label: "Nascimento", value: parte.dataNascimento },
                              { label: "Estado Civil", value: parte.estadoCivil }, { label: "Profissão", value: parte.profissao },
                              { label: "Nacionalidade", value: parte.nacionalidade }, { label: "Nat. UF", value: parte.naturalidadeEstado },
                              { label: "Nat. Município", value: parte.naturalidadeMunicipio }, { label: "CEP", value: parte.cep },
                              { label: "Estado", value: parte.estado }, { label: "Cidade", value: parte.cidade },
                              { label: "Bairro", value: parte.bairro }, { label: "Logradouro", value: parte.logradouro },
                              { label: "Número", value: parte.numero }, { label: "Complemento", value: parte.complemento },
                              { label: "Email", value: parte.email }, { label: "Telefone", value: parte.telefone },
                            ] as Array<{label: string; value: string | null}>).filter(f => f.value).map((f, fi) => {
                              const fid = `${prefix}-${idx}-${fi}`;
                              return (
                                <div key={fid} className="flex items-center justify-between py-0.5 text-xs">
                                  <div className="flex-1"><span className="text-muted-foreground">{f.label}: </span><span className="font-medium">{f.value}</span></div>
                                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => copyField(f.value!, fid)} data-testid={`btn-copy-${fid}`}>
                                    {copiedField === fid ? <Check className="w-2.5 h-2.5 text-green-600" /> : <Copy className="w-2.5 h-2.5" />}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </TabsContent>
                  <TabsContent value="caract" className="space-y-2">
                    {[
                      { label: "Justiça Gratuita?", value: protocolData.caracteristicas.justicaGratuita ? "Sim" : "Não", id: "pop-jg" },
                      { label: "Tutela Antecipada/Liminar?", value: protocolData.caracteristicas.tutelaAntecipada ? "Sim" : "Não", id: "pop-tutela" },
                      { label: "Valor da Causa (R$)", value: protocolData.caracteristicas.valorCausa || "Não informado", id: "pop-valor" },
                      { label: "Segredo de Justiça", value: protocolData.caracteristicas.segredoJustica ? "Sim" : "Não", id: "pop-sigilo" },
                      { label: "Prioridade", value: protocolData.caracteristicas.prioridade || "Nenhuma", id: "pop-prior" },
                    ].map(f => (
                      <div key={f.id} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <div><span className="text-muted-foreground text-xs">{f.label}</span><p className="font-medium">{f.value}</p></div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyField(f.value, f.id)} data-testid={`btn-copy-${f.id}`}>
                          {copiedField === f.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              </>
            ) : null}
          </div>

          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{ background: 'linear-gradient(135deg, transparent 50%, #94a3b8 50%)' }}
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startY = e.clientY;
              const origW = popupSize.w;
              const origH = popupSize.h;
              const onMove = (ev: MouseEvent) => {
                setPopupSize({ w: Math.max(380, origW + (ev.clientX - startX)), h: Math.max(400, origH + (ev.clientY - startY)) });
              };
              const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            data-testid="checklist-popup-resize"
          />
        </div>
      )}
    </DashboardLayout>
  );
}
