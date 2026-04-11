import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, X, Send, Loader2, Sparkles, UserPlus, FileText, BarChart3, Scale, Minimize2, Maximize2, Mic, MicOff, Paperclip, Calendar, Briefcase, Users, Link, Calculator, Mail, MessageSquarePlus, Expand, Shrink, ClipboardList, FolderOpen } from "lucide-react";
import logoMs from "@/assets/images/logo-ms-new.png";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, casesApi, contractsApi, debtorsApi, studioApi } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  action?: {
    type: string;
    label: string;
    route?: string;
  };
  actions?: Array<{
    type: string;
    label: string;
    route?: string;
  }>;
}

interface UploadedDoc {
  index: number;
  fileName: string;
  classification: string;
  extractedText: string;
  file?: File;
}

const QUICK_ACTIONS = [
  { icon: UserPlus, label: "Cadastrar Cliente", prompt: "Quero cadastrar um novo cliente", action: "register_client" },
  { icon: Users, label: "Novo Devedor", prompt: "Quero cadastrar um novo devedor", action: "register_debtor" },
  { icon: Scale, label: "Novo Processo", prompt: "Preciso cadastrar um novo processo", action: "new_case" },
  { icon: FileText, label: "Gerar Peça", prompt: "Preciso gerar uma peça processual", action: "generate_piece" },
  { icon: Calculator, label: "Cálculos", prompt: "Preciso fazer cálculos judiciais", action: "calculator" },
  { icon: Link, label: "Vincular Processo", prompt: "Vincular número de processo ao devedor", action: "link_process" },
  { icon: Mail, label: "Enviar Guia", prompt: "Enviar guia de custas para cliente", action: "send_guide" },
  { icon: Briefcase, label: "Novo Contrato", prompt: "Quero cadastrar um novo contrato", action: "register_contract" },
  { icon: ClipboardList, label: "Relatório Devedor", prompt: "Gerar relatório do processo de um devedor", action: "debtor_report" },
  { icon: FolderOpen, label: "Docs Devedor", prompt: "Listar documentos de um devedor", action: "debtor_docs" },
  { icon: Calendar, label: "Agenda", prompt: "Mostrar agenda e prazos", action: "show_calendar" },
];

const PIECE_TYPES = [
  { key: "peticao_inicial", label: "Petição Inicial" },
  { key: "acao_monitoria", label: "Ação Monitória" },
  { key: "execucao", label: "Execução de Título Extrajudicial" },
  { key: "contestacao", label: "Contestação" },
  { key: "cumprimento_sentenca", label: "Cumprimento de Sentença" },
  { key: "recurso_apelacao", label: "Recurso de Apelação" },
  { key: "agravo_instrumento", label: "Agravo de Instrumento" },
  { key: "recurso_especial", label: "Recurso Especial" },
  { key: "recurso_extraordinario", label: "Recurso Extraordinário" },
  { key: "contrarrazoes", label: "Contrarrazões" },
  { key: "impugnacao_embargos_execucao", label: "Impugnação aos Embargos à Execução" },
  { key: "impugnacao_embargos_monitoria", label: "Impugnação aos Embargos à Monitória" },
  { key: "acordo_extrajudicial", label: "Acordo Extrajudicial" },
  { key: "notificacao_extrajudicial", label: "Notificação Extrajudicial" },
  { key: "habeas_corpus", label: "Habeas Corpus" },
  { key: "mandado_seguranca", label: "Mandado de Segurança" },
];

const AGENT_SYSTEM_CONTEXT = `Você é o Agente LexAI, assistente executivo inteligente do escritório Marques & Serra Sociedade de Advogados (advogados responsáveis: Ronald Ferreira Serra, OAB/DF 23.947 e Pedro César Nunes F. Marques de Sousa, OAB/DF 57.058).

CAPACIDADES COMPLETAS DO SISTEMA:
- Cadastrar clientes, devedores, processos e contratos
- Arquivar documentos vinculados a clientes e processos
- Classificar documentos automaticamente (Doc.1, Doc.2...) para petição
- Gerar petições e peças processuais diretamente (via LexAI Studio)
- Atualizar cálculos judiciais (via módulo Calculadora)
- Vincular número de processo a devedores
- Enviar guias de custas para clientes via WhatsApp
- Receber e arquivar comprovantes de custas pagas
- Preparar pacote de protocolo organizado para PJe+R
- Gerar relatórios e navegar para qualquer módulo
- Gerar relatórios processuais de devedores (análise AI dos processos vinculados)
- Listar documentos arquivados por devedor
- Analisar documentos (Word, PDF, imagens com OCR)

FLUXO DE TRABALHO COMPLETO:
1. Receba documentos → analise e classifique automaticamente
2. Cadastre clientes e devedores → archive documentos vinculados
3. Faça os cálculos judiciais → gere memória de cálculo
4. Gere a petição com os documentos classificados como contexto
5. Prepare o pacote de protocolo (peça + docs + cálculos) para PJe+R
6. Após protocolar, vincule o número do processo ao devedor
7. Envie guias de custas para o cliente pagar
8. Receba e archive comprovantes de custas pagas

REGRAS:
1. Sempre responda em português de forma breve e prática
2. Quando o usuário enviar um arquivo, ENTENDA e MEMORIZE o conteúdo para referência futura. NÃO transcreva inteiro.
3. Classifique cada documento recebido (Doc.1: Procuração, Doc.2: Contrato Social, etc.)
4. Após análise de documento, SEMPRE pergunte se deseja arquivar vinculado a um cliente/processo
5. Sugira o próximo passo do fluxo de trabalho automaticamente
6. NUNCA invente jurisprudência ou informações legais
7. Quando receber um comprovante de pagamento/custas, detecte automaticamente e sugira arquivar`;

export function FloatingAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [awaitingInput, setAwaitingInput] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<any>({});
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDoc[]>([]);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [calculationMemory, setCalculationMemory] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Sou o Agente LexAI do escritório Marques & Serra. Posso executar todo o fluxo de trabalho: cadastrar clientes e devedores, analisar e arquivar documentos, gerar petições, fazer cálculos, vincular processos, enviar guias de custas e muito mais. Envie documentos, use os atalhos ou digite sua solicitação.",
    }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const [btnPosition, setBtnPosition] = useState(() => {
    try {
      const saved = localStorage.getItem("floatingai-pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos.x >= 0 && pos.x < window.innerWidth && pos.y >= 0 && pos.y < window.innerHeight) {
          return pos;
        }
      }
    } catch {}
    return { x: window.innerWidth - 64, y: window.innerHeight - 64 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const snapToEdge = useCallback((x: number, y: number) => {
    const btnSize = 48;
    const margin = 16;
    const maxX = window.innerWidth - btnSize - margin;
    const maxY = window.innerHeight - btnSize - margin;
    const clampedY = Math.max(margin, Math.min(y, maxY));
    const snappedX = x < window.innerWidth / 2 ? margin : maxX;
    const pos = { x: snappedX, y: clampedY };
    try { localStorage.setItem("floatingai-pos", JSON.stringify(pos)); } catch {}
    return pos;
  }, []);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    dragRef.current = { startX: clientX, startY: clientY, startPosX: btnPosition.x, startPosY: btnPosition.y, moved: false };
    setIsDragging(true);
  }, [btnPosition]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    setBtnPosition({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current) return;
    const wasDrag = dragRef.current.moved;
    if (wasDrag) {
      setBtnPosition((prev: {x: number; y: number}) => snapToEdge(prev.x, prev.y));
    }
    setIsDragging(false);
    const ref = dragRef.current;
    dragRef.current = null;
    return wasDrag;
  }, [snapToEdge]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e: TouchEvent) => { if (dragRef.current) { e.preventDefault(); handleDragMove(e.touches[0].clientX, e.touches[0].clientY); } };
    const onTouchEnd = () => handleDragEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    const onResize = () => setBtnPosition((prev: {x: number; y: number}) => snapToEdge(prev.x, prev.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [snapToEdge]);
  const queryClient = useQueryClient();

  const createClient = useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const createCase = useMutation({
    mutationFn: casesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cases"] }),
  });

  const createContract = useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const createDebtor = useMutation({
    mutationFn: debtorsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["debtors"] }),
  });

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memoria = params.get("calculationMemory");
    if (memoria) {
      setCalculationMemory(decodeURIComponent(memoria));
      const url = new URL(window.location.href);
      url.searchParams.delete("calculationMemory");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const sendToAI = useCallback(async (userContent: string, currentMessages: Message[]): Promise<string> => {
    const history = currentMessages
      .filter(m => m.content && !m.content.startsWith("🎤 Transcrevendo") && !m.content.startsWith("📎 Analisando"))
      .map(m => ({ role: m.role, content: m.content }));

    history.push({ role: "user", content: userContent });

    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: AGENT_SYSTEM_CONTEXT },
          { role: "assistant", content: "Entendido. Estou pronto para ajudar como Agente LexAI com capacidades completas." },
          ...history,
        ],
      }),
    });

    if (!response.ok) throw new Error("AI request failed");
    const data = await response.json();
    return data.content || "Não consegui processar. Tente novamente.";
  }, []);

  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const resolveClientByName = async (name: string): Promise<{ id: number; name: string } | null> => {
    try {
      const clients = await clientsApi.getAll();
      const norm = normalize(name);
      
      const exactMatch = clients.find((c: any) => {
        const cn = normalize(c.name || "");
        return cn.includes(norm) || norm.includes(cn);
      });
      if (exactMatch) return { id: exactMatch.id, name: exactMatch.name };

      const words = norm.split(/\s+/).filter((w: string) => w.length > 2);
      if (words.length > 0) {
        const fuzzyMatch = clients.find((c: any) => {
          const cn = normalize(c.name || "");
          const matched = words.filter((w: string) => cn.includes(w));
          return matched.length >= Math.min(2, words.length);
        });
        if (fuzzyMatch) return { id: fuzzyMatch.id, name: fuzzyMatch.name };
      }

      return null;
    } catch {
      return null;
    }
  };

  const resolveDebtorByName = async (name: string): Promise<{ id: number; name: string; clientId: number } | null> => {
    try {
      const debtorsList = await debtorsApi.getAll();
      const norm = normalize(name);
      const match = debtorsList.find((d: any) => {
        const dn = normalize(d.name || "");
        return dn.includes(norm) || norm.includes(dn);
      });
      if (match) return { id: match.id, name: match.name, clientId: match.clientId };
      const words = norm.split(/\s+/).filter((w: string) => w.length > 2);
      if (words.length > 0) {
        const fuzzy = debtorsList.find((d: any) => {
          const dn = normalize(d.name || "");
          return words.filter((w: string) => dn.includes(w)).length >= Math.min(2, words.length);
        });
        if (fuzzy) return { id: fuzzy.id, name: fuzzy.name, clientId: fuzzy.clientId };
      }
      return null;
    } catch {
      return null;
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size > 0) {
          setIsProcessing(true);
          const placeholderMsg: Message = { role: "user", content: "🎤 Transcrevendo áudio..." };
          setMessages(prev => [...prev, placeholderMsg]);
          
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(audioBlob);
            });

            const transcribeResponse = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioBase64: base64 }),
            });

            if (transcribeResponse.ok) {
              const { text } = await transcribeResponse.json();
              if (text && text.trim()) {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "user", content: `🎤 "${text}"` };
                  return updated;
                });

                const currentMsgs = await new Promise<Message[]>(resolve => {
                  setMessages(prev => {
                    resolve(prev);
                    return prev;
                  });
                });

                const aiResponse = await sendToAI(text, currentMsgs);
                setMessages(prev => [...prev, { role: "assistant", content: aiResponse }]);
              } else {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "user", content: "🎤 [Áudio sem conteúdo detectado]" };
                  return [...updated, { role: "assistant", content: "Não consegui detectar fala no áudio. Tente novamente falando mais perto do microfone, ou digite sua solicitação." }];
                });
              }
            } else {
              const errorData = await transcribeResponse.json().catch(() => ({}));
              console.error("Transcription error:", errorData);
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "user", content: "🎤 [Erro na transcrição]" };
                return [...updated, { role: "assistant", content: "Erro ao transcrever o áudio. Tente novamente ou digite sua solicitação." }];
              });
            }
          } catch (err) {
            console.error("Voice processing error:", err);
            setMessages(prev => [...prev, { role: "assistant", content: "Não consegui processar o áudio. Tente novamente ou digite sua solicitação." }]);
          } finally {
            setIsProcessing(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Não foi possível acessar o microfone. Verifique as permissões do navegador." }]);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const updateLastAssistantMessage = (content: string) => {
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].content.startsWith("📎 Analisando")) {
        updated[lastIdx] = { role: "assistant", content };
      } else {
        updated.push({ role: "assistant", content });
      }
      return updated;
    });
  };

  const classifyDocument = async (fileName: string, extractedText: string): Promise<string> => {
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `Classifique este documento jurídico em UMA categoria curta (max 3 palavras). Exemplos: "Procuração", "Contrato Social", "Nota Promissória", "RG/CPF", "Comprovante de Endereço", "Certidão", "Petição", "Guia de Custas", "Comprovante de Pagamento", "Cálculo Judicial", "Acordo", "Notificação". Responda APENAS com a classificação, sem explicações.\n\nArquivo: ${fileName}\nConteúdo (trecho): ${extractedText.substring(0, 2000)}` },
          ],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return (data.content || "Documento").trim().replace(/^["']|["']$/g, "");
      }
    } catch {}
    return "Documento";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setLastUploadedFile(file);
    const fileName = file.name;

    setMessages(prev => [...prev, 
      { role: "user", content: `📎 Arquivo enviado: ${fileName}` },
      { role: "assistant", content: `📎 Analisando arquivo "${fileName}"... Aguarde.` }
    ]);

    try {
      console.log(`[FloatingAI] Uploading file: ${fileName} (${file.type}, ${file.size} bytes)`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", fileName);

      const response = await fetch("/api/ai/upload-file", {
        method: "POST",
        body: formData,
      });

      console.log(`[FloatingAI] Upload response status: ${response.status}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro do servidor (${response.status})`);
      }

      const data = await response.json();
      let analysisResult = "";
      let extractedText = "";

      if (data.type === "image") {
        analysisResult = data.content || "Não foi possível analisar a imagem.";
        extractedText = data.content || "";
      } else if (data.type === "audio") {
        if (data.text && data.text.trim()) {
          extractedText = data.text;
          const currentMsgs = messages;
          analysisResult = await sendToAI(
            `O usuário enviou um arquivo de áudio "${fileName}". Transcrição do áudio:\n\n"${data.text}"\n\nAnalise o conteúdo da transcrição e responda de forma útil.`,
            currentMsgs
          );
        } else {
          analysisResult = data.error || "Não foi possível detectar fala no áudio enviado.";
        }
      } else if (data.type === "document") {
        extractedText = data.text || "";
        if (data.analysis) {
          analysisResult = data.analysis;
        } else if (data.text) {
          const currentMsgs = messages;
          analysisResult = await sendToAI(
            `O usuário enviou o arquivo "${fileName}". Aqui está o conteúdo extraído. ENTENDA o conteúdo, faça um resumo dos pontos principais e sugira ações relevantes. NÃO transcreva o documento inteiro.\n\nConteúdo:\n${data.text.substring(0, 6000)}`,
            currentMsgs
          );
        } else if (data.error) {
          analysisResult = data.error;
        } else {
          analysisResult = "Não foi possível extrair conteúdo do arquivo.";
        }
      } else if (data.type === "text") {
        analysisResult = data.content || "Não foi possível analisar o arquivo.";
        extractedText = data.content || "";
      } else {
        analysisResult = data.content || data.analysis || data.error || "Arquivo processado.";
        extractedText = data.text || data.content || "";
      }

      const classification = await classifyDocument(fileName, extractedText);
      const docIndex = uploadedDocuments.length + 1;
      const newDoc: UploadedDoc = {
        index: docIndex,
        fileName,
        classification,
        extractedText: extractedText.substring(0, 8000),
        file,
      };
      setUploadedDocuments(prev => [...prev, newDoc]);

      const isPaymentReceipt = classification.toLowerCase().includes("comprovante") || 
        classification.toLowerCase().includes("pagamento") ||
        classification.toLowerCase().includes("custas paga");

      const isDebtorDoc = ["nota promissória", "confissão de dívida", "cheque", "titulo de credito", "título de crédito"].some(
        kw => classification.toLowerCase().includes(kw) || fileName.toLowerCase().includes(kw)
      );

      let extractedDebtor: { nome: string; cpf: string; endereco: string; cidade: string; estado: string; cep: string; telefone: string; email: string; tipo: string } | null = null;
      if (isDebtorDoc && analysisResult) {
        try {
          const extractResp = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "user", content: `Extraia do texto abaixo TODOS os dados disponíveis do devedor/emitente/executado. Responda APENAS com JSON no formato: {"nome":"Nome Completo","cpf":"000.000.000-00","endereco":"Rua X, nº Y, Bairro Z","cidade":"Cidade","estado":"UF","cep":"00000-000","telefone":"(00) 00000-0000","email":"email@x.com","tipo":"PF"}. Campos não encontrados devem ficar vazios. O campo "tipo" deve ser "PF" para pessoa física ou "PJ" para pessoa jurídica.\n\n${analysisResult}\n\n${extractedText.substring(0, 3000)}` },
              ],
            }),
          });
          if (extractResp.ok) {
            const extData = await extractResp.json();
            const jsonMatch = (extData.content || "").match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.nome && parsed.nome.length > 2) {
                extractedDebtor = {
                  nome: parsed.nome,
                  cpf: parsed.cpf || "",
                  endereco: parsed.endereco || "",
                  cidade: parsed.cidade || "",
                  estado: parsed.estado || "",
                  cep: parsed.cep || "",
                  telefone: parsed.telefone || "",
                  email: parsed.email || "",
                  tipo: parsed.tipo || "PF",
                };
              }
            }
          }
        } catch {}
      }

      let docListSummary = `\n\n📄 **Doc. ${docIndex}: ${classification}** (${fileName})`;
      
      if (uploadedDocuments.length > 0) {
        docListSummary += "\n\n📋 Documentos na conversa:";
        [...uploadedDocuments, newDoc].forEach(d => {
          docListSummary += `\nDoc. ${d.index}: ${d.classification} (${d.fileName})`;
        });
      }

      let archivePrompt = "\n\nDeseja arquivar este documento vinculado a algum cliente ou processo? (informe o nome do cliente/processo ou 'não')";
      
      if (isPaymentReceipt) {
        archivePrompt = "\n\n💰 Parece ser um comprovante de pagamento/custas. Deseja arquivar vinculado a qual processo/devedor? (informe o nome ou 'não')";
      }

      updateLastAssistantMessage(analysisResult + docListSummary + archivePrompt);
      setAwaitingInput("archive_target");
      setPendingData({ fileName, classification, extractedText: extractedText.substring(0, 4000), extractedDebtor });

    } catch (err: any) {
      console.error("[FloatingAI] File processing error:", err);
      updateLastAssistantMessage(`Não consegui processar o arquivo: ${err?.message || "erro desconhecido"}. Tente novamente ou descreva o conteúdo.`);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNewConversation = () => {
    setMessages([{
      role: "assistant",
      content: "Olá! Sou o Agente LexAI do escritório Marques & Serra. Posso executar todo o fluxo de trabalho: cadastrar clientes e devedores, analisar e arquivar documentos, gerar petições, fazer cálculos, vincular processos, enviar guias de custas e muito mais. Envie documentos, use os atalhos ou digite sua solicitação.",
    }]);
    setInputValue("");
    setAwaitingInput(null);
    setPendingData({});
    setUploadedDocuments([]);
    setLastUploadedFile(null);
    setCalculationMemory(null);
    setIsProcessing(false);
    setIsProcessingFile(false);
  };

  const handleQuickAction = async (action: typeof QUICK_ACTIONS[0]) => {
    setMessages(prev => [...prev, { role: "user", content: action.prompt }]);
    
    switch (action.action) {
      case "register_client":
        setAwaitingInput("client_name");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou cadastrar um novo cliente. Informe o nome completo (ou 'pular' para deixar em branco):" 
        }]);
        break;

      case "register_debtor":
        setAwaitingInput("debtor_client");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou cadastrar um novo devedor. Para qual cliente deseja vincular? (informe o nome do cliente):" 
        }]);
        break;

      case "new_case":
        setAwaitingInput("case_number");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou cadastrar um novo processo. Informe o número do processo (formato CNJ, ex: 0001234-56.2024.8.07.0001):" 
        }]);
        break;

      case "register_contract":
        setAwaitingInput("contract_client");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou cadastrar um novo contrato. Para qual cliente? (informe o nome):" 
        }]);
        break;

      case "generate_piece": {
        const typeList = PIECE_TYPES.map((t, i) => `${i + 1}. ${t.label}`).join("\n");
        setAwaitingInput("petition_type");
        setPendingData({});
        let docsContext = "";
        if (uploadedDocuments.length > 0) {
          docsContext = "\n\n📋 Documentos disponíveis na conversa:";
          uploadedDocuments.forEach(d => {
            docsContext += `\nDoc. ${d.index}: ${d.classification} (${d.fileName})`;
          });
          docsContext += "\n\nEsses documentos serão usados como contexto automaticamente.";
        }
        if (calculationMemory) {
          docsContext += "\n\n📊 Memória de cálculo disponível - será incluída automaticamente.";
        }
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Vou gerar uma peça processual. Qual o tipo?\n\n${typeList}\n\n(Digite o número ou nome da peça):${docsContext}` 
        }]);
        break;
      }

      case "calculator":
        navigate("/calculadora");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Abrindo o módulo de Cálculos Judiciais. Após calcular, a memória de cálculo ficará disponível para incluir na petição.\n\nDica: Use o botão 'Enviar para Estúdio' na calculadora para vincular o cálculo à peça processual.",
          action: { type: "navigate", label: "Ir para Calculadora", route: "/calculadora" }
        }]);
        break;

      case "link_process":
        setAwaitingInput("link_process_number");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou vincular um processo a um devedor. Informe o número do processo (formato CNJ):" 
        }]);
        break;

      case "send_guide":
        setAwaitingInput("send_guide_client");
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Vou enviar uma guia de custas. Para qual cliente deseja enviar? (informe o nome):" 
        }]);
        break;

      case "debtor_report":
        setAwaitingInput("debtor_report_name");
        setPendingData({});
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Vou gerar o relatório do processo de um devedor. Informe o nome do devedor:"
        }]);
        break;

      case "debtor_docs":
        setAwaitingInput("debtor_docs_name");
        setPendingData({});
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Vou listar os documentos de um devedor. Informe o nome do devedor:"
        }]);
        break;

      case "show_calendar":
        navigate("/calendar");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Abrindo a agenda e prazos...",
          action: { type: "navigate", label: "Ver Agenda", route: "/calendar" }
        }]);
        break;
    }
  };

  const stateDescriptions: Record<string, string> = {
    client_name: "cadastrando um novo cliente (esperando o nome)",
    client_document: "cadastrando um novo cliente (esperando CPF/CNPJ)",
    client_email: "cadastrando um novo cliente (esperando e-mail)",
    client_phone: "cadastrando um novo cliente (esperando telefone)",
    debtor_report_name: "gerando relatório de devedor (esperando nome do devedor)",
    debtor_docs_name: "listando documentos de devedor (esperando nome do devedor)",
    debtor_client: "cadastrando um novo devedor (esperando nome do cliente vinculado)",
    debtor_name: "cadastrando um novo devedor (esperando nome do devedor)",
    debtor_document: "cadastrando um novo devedor (esperando CPF/CNPJ do devedor)",
    debtor_phone: "cadastrando um novo devedor (esperando telefone do devedor)",
    debtor_email: "cadastrando um novo devedor (esperando e-mail do devedor)",
    debtor_process: "perguntando se quer vincular um processo ao devedor",
    archive_target: "perguntando a qual cliente ou processo vincular o documento",
    auto_register_debtor: "perguntando se quer cadastrar o devedor detectado (sim/não)",
    contract_client: "cadastrando contrato (esperando nome do cliente)",
    contract_type: "cadastrando contrato (esperando tipo)",
    contract_description: "cadastrando contrato (esperando descrição)",
    case_number: "cadastrando processo (esperando número)",
    case_title: "cadastrando processo (esperando título)",
    case_type: "cadastrando processo (esperando tipo)",
    case_court: "cadastrando processo (esperando vara/tribunal)",
    petition_type: "gerando petição (esperando tipo da peça)",
    petition_client: "gerando petição (esperando nome do cliente/devedor)",
    petition_facts: "gerando petição (esperando fatos e instruções)",
    link_process_number: "vinculando processo (esperando número do processo)",
    link_process_debtor: "vinculando processo (esperando nome do devedor)",
    send_guide_client: "enviando guia de custas (esperando nome do cliente)",
    send_guide_confirm: "enviando guia de custas (esperando confirmação sim/não)",
    send_guide_upload: "enviando guia de custas (esperando mensagem ou upload)",
  };

  const detectUserIntent = async (input: string, currentState: string): Promise<"answer" | "cancel" | "different_request"> => {
    const lower = input.toLowerCase().trim();

    const exactCancelPhrases = [
      "cancelar", "cancela", "cancelar isso", "desistir", "desisto",
      "abortar", "chega", "pare", "parar", "esquece", "esqueça", "esqueca",
      "deixa pra lá", "deixa pra la", "não precisa", "nao precisa",
      "não quero", "nao quero", "para com isso", "outro assunto",
      "não quero mais", "nao quero mais", "deixa quieto",
    ];
    const exactCancelWords = ["sair", "voltar", "volta", "cancela", "pare", "chega"];
    if (exactCancelPhrases.some(p => lower === p || lower.startsWith(p + " ") || lower.startsWith(p + ","))) return "cancel";
    if (exactCancelWords.some(w => lower === w)) return "cancel";

    const looksLikeName = /^[A-ZÀ-Ú][a-zà-ú]+([\s][A-ZÀ-Ú][a-zà-ú]+)*$/.test(input.trim());
    const looksLikeNumber = /^[\d.\-\/]+$/.test(input.trim().replace(/\s/g, ""));
    const looksLikeEmail = /\S+@\S+\.\S+/.test(input.trim());
    const looksLikePhone = /^[\d\s\(\)\-\+]+$/.test(input.trim()) && input.replace(/\D/g, "").length >= 8;
    const looksLikeCaseNumber = /\d{7}-\d{2}\.\d{4}/.test(input.trim());

    if (looksLikeName || looksLikeNumber || looksLikeEmail || looksLikePhone || looksLikeCaseNumber) return "answer";

    const stateDesc = stateDescriptions[currentState] || currentState;
    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Classifique a INTENÇÃO do usuário. O sistema está ${stateDesc}. O usuário escreveu: "${input}"

Responda APENAS com uma destas palavras:
- RESPOSTA: se o usuário está respondendo a pergunta do fluxo atual (fornecendo o dado esperado)
- CANCELAR: se o usuário quer parar, cancelar ou sair do fluxo atual
- OUTRO: se o usuário está fazendo um pedido diferente, mudando de assunto ou pedindo outra ação

Responda apenas: RESPOSTA, CANCELAR ou OUTRO`
          }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const classification = (data.content || "").trim().toUpperCase();
        if (classification.includes("CANCELAR")) return "cancel";
        if (classification.includes("OUTRO")) return "different_request";
      }
    } catch {}
    return "answer";
  };

  const processAwaitingInput = async (input: string) => {
    const skip = input.toLowerCase() === "pular" || input.toLowerCase() === "skip" || input.trim() === "";
    const isNo = input.toLowerCase() === "não" || input.toLowerCase() === "nao" || input.toLowerCase() === "n";

    const confirmStates = ["auto_register_debtor", "send_guide_confirm"];
    const isConfirmState = confirmStates.includes(awaitingInput || "");

    if (!isConfirmState && !skip && !isNo) {
      const intent = await detectUserIntent(input, awaitingInput || "");
      if (intent === "cancel") {
        const stateDesc = stateDescriptions[awaitingInput || ""] || "";
        setAwaitingInput(null);
        setPendingData({});
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Ok, fluxo cancelado.${stateDesc ? "" : ""}\n\nComo posso ajudar? Use os atalhos rápidos ou me diga o que precisa.` 
        }]);
        return;
      }
      if (intent === "different_request") {
        setAwaitingInput(null);
        setPendingData({});
        setMessages(prev => {
          const withoutProcessing = prev.filter(m => m.content !== "Processando...");
          return withoutProcessing;
        });
        const lowerMessage = input.toLowerCase();
        if (lowerMessage.includes("cadastrar devedor") || lowerMessage.includes("novo devedor")) {
          handleQuickAction(QUICK_ACTIONS.find(a => a.action === "register_debtor")!);
        } else if (lowerMessage.includes("cadastrar cliente") || lowerMessage.includes("novo cliente")) {
          handleQuickAction(QUICK_ACTIONS.find(a => a.action === "register_client")!);
        } else if (lowerMessage.includes("gerar peça") || lowerMessage.includes("gerar petição") || lowerMessage.includes("fazer petição")) {
          handleQuickAction(QUICK_ACTIONS.find(a => a.action === "generate_piece")!);
        } else if (lowerMessage.includes("relatório do devedor") || lowerMessage.includes("relatorio do devedor") || lowerMessage.includes("relatório devedor") || lowerMessage.includes("relatorio devedor") || lowerMessage.includes("estado do processo do devedor") || lowerMessage.includes("situação do devedor")) {
          handleQuickAction(QUICK_ACTIONS.find(a => a.action === "debtor_report")!);
        } else if (lowerMessage.includes("documentos do devedor") || lowerMessage.includes("docs do devedor") || lowerMessage.includes("listar documentos devedor") || lowerMessage.includes("documentos devedor")) {
          handleQuickAction(QUICK_ACTIONS.find(a => a.action === "debtor_docs")!);
        } else {
          setIsProcessing(true);
          try {
            const currentMsgs = messages;
            const aiResponse = await sendToAI(input, currentMsgs);
            setMessages(prev => [...prev, { role: "assistant", content: aiResponse }]);
          } catch {
            setMessages(prev => [...prev, { role: "assistant", content: "Desculpe, não consegui processar. Tente novamente." }]);
          } finally {
            setIsProcessing(false);
          }
        }
        return;
      }
    }

    switch (awaitingInput) {
      // ==================== CLIENT REGISTRATION ====================
      case "client_name":
        setPendingData((prev: any) => ({ ...prev, name: skip ? "" : input }));
        setAwaitingInput("client_document");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: skip ? "Ok, sem nome.\n\nInforme o CPF ou CNPJ (ou 'pular'):" : `Nome: ${input}\n\nInforme o CPF ou CNPJ (ou 'pular'):` 
        }]);
        break;

      case "client_document":
        setPendingData((prev: any) => ({ ...prev, document: skip ? "" : input }));
        setAwaitingInput("client_email");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: skip ? "Ok, sem documento.\n\nInforme o e-mail (ou 'pular'):" : `Documento: ${input}\n\nInforme o e-mail (ou 'pular'):` 
        }]);
        break;

      case "client_email":
        setPendingData((prev: any) => ({ ...prev, email: skip ? "" : input }));
        setAwaitingInput("client_phone");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: skip ? "Ok, sem e-mail.\n\nInforme o telefone (ou 'pular'):" : `E-mail: ${input}\n\nInforme o telefone (ou 'pular'):` 
        }]);
        break;

      case "client_phone": {
        const finalData = {
          name: pendingData.name || "",
          document: pendingData.document || "",
          email: pendingData.email || "",
          phone: skip ? "" : input,
          type: (pendingData.document && pendingData.document.replace(/\D/g, "").length > 11) ? "PJ" as const : "PF" as const,
          status: "ativo" as const,
          tenantId: 1,
        };
        
        setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando cliente..." }]);
        
        try {
          const newClient = await createClient.mutateAsync(finalData);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Cliente cadastrado com sucesso!\n\n${finalData.name ? `Nome: ${finalData.name}\n` : ""}${finalData.document ? `Documento: ${finalData.document}\n` : ""}${finalData.email ? `E-mail: ${finalData.email}\n` : ""}${finalData.phone ? `Telefone: ${finalData.phone}\n` : ""}Tipo: ${finalData.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}\n\nPróximo passo: Deseja cadastrar um devedor para este cliente?`,
            action: { type: "navigate", label: "Ver Cliente", route: `/clients/${newClient.id}` }
          }]);
        } catch (err) {
          console.error("Error creating client:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar cliente. Verifique os dados e tente novamente." }]);
        }
        
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== DEBTOR REGISTRATION ====================
      case "debtor_client": {
        let clientSearch = input.trim();
        if (clientSearch.includes(",")) {
          clientSearch = clientSearch.split(",")[0].trim();
        }
        setMessages(prev => [...prev, { role: "assistant", content: `Buscando cliente "${clientSearch}"...` }]);
        const client = await resolveClientByName(clientSearch);
        if (!client) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Cliente "${clientSearch}" não encontrado. Verifique o nome e tente novamente, ou cadastre o cliente primeiro.` 
          }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }
        setPendingData((prev: any) => ({ ...prev, clientId: client.id, clientName: client.name }));
        setAwaitingInput("debtor_name");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Cliente encontrado: ${client.name}\n\nInforme o nome completo do devedor:` 
        }]);
        break;
      }

      case "debtor_name": {
        const contextKeywords = ["documento", "anexo", "anterior", "já enviei", "arquivo", "pdf", "nota"];
        const isContextRef = contextKeywords.some(kw => input.toLowerCase().includes(kw));
        
        if (isContextRef) {
          setMessages(prev => [...prev, { role: "assistant", content: "Extraindo dados do documento analisado..." }]);
          try {
            const recentMessages = messages.slice(-15).map(m => m.content).join("\n");
            const extractResponse = await fetch("/api/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  { role: "user", content: `Analise o contexto da conversa abaixo e extraia o nome completo do devedor/emitente/parte devedora mencionado nos documentos analisados. Responda APENAS com o JSON no formato: {"nome":"Nome Completo","cpf":"000.000.000-00"} — se não encontrar CPF, deixe vazio. Sem explicações.\n\nConversa:\n${recentMessages}` },
                ],
              }),
            });
            if (extractResponse.ok) {
              const extractData = await extractResponse.json();
              const content = extractData.content || "";
              try {
                const jsonMatch = content.match(/\{[^}]+\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  const extractedName = parsed.nome || "";
                  const extractedDoc = parsed.cpf || "";
                  if (extractedName && extractedName.length > 2) {
                    setPendingData((prev: any) => ({ ...prev, debtorName: extractedName, debtorDocument: extractedDoc }));
                    const docInfo = extractedDoc ? `\nDocumento encontrado: ${extractedDoc}` : "";
                    setAwaitingInput("debtor_phone");
                    setMessages(prev => [...prev, { 
                      role: "assistant", 
                      content: `Dados extraídos do documento:\n\nNome: ${extractedName}${docInfo}\n\nInforme o telefone/WhatsApp do devedor (ou 'pular'):` 
                    }]);
                    break;
                  }
                }
              } catch {}
            }
          } catch {}
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Não consegui extrair o nome do documento. Por favor, informe o nome completo do devedor:" 
          }]);
          break;
        }
        
        setPendingData((prev: any) => ({ ...prev, debtorName: input }));
        setAwaitingInput("debtor_document");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Nome do devedor: ${input}\n\nInforme o CPF ou CNPJ do devedor (ou 'pular'):` 
        }]);
        break;
      }

      case "debtor_document": {
        const docContextRef = ["documento", "anexo", "anterior", "já enviei"].some(kw => input.toLowerCase().includes(kw));
        if (docContextRef && !skip) {
          try {
            const recentMsgs = messages.slice(-15).map(m => m.content).join("\n");
            const resp = await fetch("/api/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  { role: "user", content: `Extraia o CPF ou CNPJ do devedor/emitente mencionado nos documentos analisados abaixo. Responda APENAS com o número do documento (formato 000.000.000-00 ou 00.000.000/0001-00). Se não encontrar, responda "não encontrado".\n\n${recentMsgs}` },
                ],
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const extracted = (data.content || "").trim();
              if (extracted && !extracted.includes("não encontrado") && extracted.length >= 11) {
                setPendingData((prev: any) => ({ ...prev, debtorDocument: extracted }));
                setAwaitingInput("debtor_phone");
                setMessages(prev => [...prev, { 
                  role: "assistant", 
                  content: `Documento extraído: ${extracted}\n\nInforme o telefone/WhatsApp do devedor (ou 'pular'):` 
                }]);
                break;
              }
            }
          } catch {}
          setPendingData((prev: any) => ({ ...prev, debtorDocument: "" }));
          setAwaitingInput("debtor_phone");
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Documento não encontrado nos anexos.\n\nInforme o telefone/WhatsApp do devedor (ou 'pular'):" 
          }]);
          break;
        }
        setPendingData((prev: any) => ({ ...prev, debtorDocument: skip ? "" : input }));
        setAwaitingInput("debtor_phone");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: skip ? "Ok, sem documento.\n\nInforme o telefone/WhatsApp do devedor (ou 'pular'):" : `Documento: ${input}\n\nInforme o telefone/WhatsApp do devedor (ou 'pular'):` 
        }]);
        break;
      }

      case "debtor_phone":
        setPendingData((prev: any) => ({ ...prev, debtorPhone: skip ? "" : input }));
        setAwaitingInput("debtor_email");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: skip ? "Ok, sem telefone.\n\nInforme o e-mail do devedor (ou 'pular'):" : `Telefone: ${input}\n\nInforme o e-mail do devedor (ou 'pular'):` 
        }]);
        break;

      case "debtor_email": {
        const debtorData = {
          clientId: pendingData.clientId,
          name: pendingData.debtorName,
          document: pendingData.debtorDocument || "",
          phone: pendingData.debtorPhone || "",
          whatsapp: pendingData.debtorPhone || "",
          email: skip ? "" : input,
          type: (pendingData.debtorDocument && pendingData.debtorDocument.replace(/\D/g, "").length > 11) ? "PJ" as const : "PF" as const,
          status: "ativo" as const,
          tenantId: 1,
        };

        setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando devedor..." }]);

        try {
          const newDebtor = await createDebtor.mutateAsync(debtorData);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Devedor cadastrado com sucesso!\n\nNome: ${debtorData.name}\nCliente: ${pendingData.clientName}\n${debtorData.document ? `Documento: ${debtorData.document}\n` : ""}${debtorData.phone ? `Telefone: ${debtorData.phone}\n` : ""}${debtorData.email ? `E-mail: ${debtorData.email}\n` : ""}Tipo: ${debtorData.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}\n\nPróximo passo: Deseja enviar documentos para análise ou gerar uma petição?`,
            action: { type: "navigate", label: "Ver Cliente", route: `/clients/${pendingData.clientId}` }
          }]);
        } catch (err) {
          console.error("Error creating debtor:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar devedor. Verifique os dados e tente novamente." }]);
        }

        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== DOCUMENT ARCHIVING ====================
      case "archive_target": {
        if (isNo) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Ok, documento mantido apenas na conversa.\n\nPróximo passo: Envie mais documentos, cadastre um devedor ou gere uma petição." 
          }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }

        setMessages(prev => [...prev, { role: "assistant", content: "Processando..." }]);
        
        let archiveClientId: number | null = null;
        let archiveCaseId: number | null = null;
        let archiveLabel = "";

        const isCaseNumber = /\d{7}-\d{2}\.\d{4}/.test(input);
        
        if (isCaseNumber) {
          try {
            const allCases = await casesApi.getAll();
            const foundCase = allCases.find((c: any) => c.caseNumber?.includes(input));
            if (foundCase) {
              archiveCaseId = foundCase.id;
              archiveClientId = foundCase.clientId;
              archiveLabel = `processo ${foundCase.caseNumber}`;
            }
          } catch {}
        }

        let searchName = input;
        if (!archiveCaseId) {
          const archiveClient = await resolveClientByName(input);
          if (archiveClient) {
            archiveClientId = archiveClient.id;
            archiveLabel = `cliente ${archiveClient.name}`;
          }
        }

        if (!archiveClientId && !archiveCaseId) {
          const foundDebtor = await resolveDebtorByName(input);
          if (foundDebtor && foundDebtor.clientId) {
            archiveClientId = foundDebtor.clientId;
            archiveLabel = `devedor ${foundDebtor.name}`;
            setPendingData((prev: any) => ({
              ...prev,
              debtorName: foundDebtor.name,
              classification: prev.classification ? `${prev.classification} - Devedor ${foundDebtor.name}` : `Documento - Devedor ${foundDebtor.name}`,
            }));
          }
        }

        if (!archiveClientId && !archiveCaseId && input.length > 15) {
          try {
            const aiResp = await fetch("/api/ai/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  { role: "user", content: `O usuário quer arquivar um documento e escreveu: "${input}"\n\nExtraia APENAS o nome do cliente, empresa ou devedor mencionado. Responda somente com o nome extraído, sem explicações. Se não encontrar um nome, responda "NAO_ENCONTRADO".` },
                ],
              }),
            });
            if (aiResp.ok) {
              const aiData = await aiResp.json();
              searchName = (aiData.content || "").trim();
              if (searchName && searchName !== "NAO_ENCONTRADO" && searchName.length > 2) {
                const aiClient = await resolveClientByName(searchName);
                if (aiClient) {
                  archiveClientId = aiClient.id;
                  archiveLabel = `cliente ${aiClient.name}`;
                } else {
                  const aiDebtor = await resolveDebtorByName(searchName);
                  if (aiDebtor && aiDebtor.clientId) {
                    archiveClientId = aiDebtor.clientId;
                    archiveLabel = `devedor ${aiDebtor.name}`;
                  }
                }
              }
            }
          } catch {}
        }
        
        if (!archiveClientId && !archiveCaseId) {
          const displayName = (searchName && searchName !== "NAO_ENCONTRADO" && searchName.length > 2) ? searchName : input;
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Não encontrei "${displayName}" como cliente, processo ou devedor no sistema.\n\nDigite o nome exato do cliente, o número do processo, ou 'não' para pular o arquivamento.` 
          }]);
          return;
        }

        if (lastUploadedFile) {
          try {
            const archiveForm = new FormData();
            archiveForm.append("file", lastUploadedFile);
            archiveForm.append("title", pendingData.classification || lastUploadedFile.name);
            archiveForm.append("type", pendingData.classification?.toLowerCase() || "documento");
            if (archiveClientId) archiveForm.append("clientId", archiveClientId.toString());
            if (archiveCaseId) archiveForm.append("caseId", archiveCaseId.toString());

            const archiveResponse = await fetch("/api/documents/archive", {
              method: "POST",
              body: archiveForm,
            });

            if (archiveResponse.ok) {
              if (pendingData.extractedDebtor && archiveClientId) {
                const debtorInfo = pendingData.extractedDebtor;
                let debtorDetails = `👤 **${debtorInfo.nome}**`;
                if (debtorInfo.cpf) debtorDetails += `\n📄 ${debtorInfo.cpf}`;
                if (debtorInfo.endereco) debtorDetails += `\n📍 ${debtorInfo.endereco}${debtorInfo.cidade ? `, ${debtorInfo.cidade}` : ""}${debtorInfo.estado ? `/${debtorInfo.estado}` : ""}${debtorInfo.cep ? ` - ${debtorInfo.cep}` : ""}`;
                if (debtorInfo.telefone) debtorDetails += `\n📱 ${debtorInfo.telefone}`;
                if (debtorInfo.email) debtorDetails += `\n📧 ${debtorInfo.email}`;
                setMessages(prev => [...prev, { 
                  role: "assistant", 
                  content: `Documento arquivado com sucesso!\n\n📄 ${pendingData.classification || pendingData.fileName}\n📁 Vinculado ao ${archiveLabel}\n\nIdentifiquei o devedor no documento:\n${debtorDetails}\n\nDeseja cadastrá-lo automaticamente? (sim/não)`,
                  action: archiveClientId ? { type: "navigate", label: "Ver Cliente", route: `/clients/${archiveClientId}` } : undefined
                }]);
                setAwaitingInput("auto_register_debtor");
                setPendingData({ extractedDebtor: debtorInfo, archiveClientId });
                setLastUploadedFile(null);
                return;
              }
              setMessages(prev => [...prev, { 
                role: "assistant", 
                content: `Documento arquivado com sucesso!\n\n📄 ${pendingData.classification || pendingData.fileName}\n📁 Vinculado ao ${archiveLabel}\n\nPróximo passo: Envie mais documentos ou gere uma petição com os documentos classificados.`,
                action: archiveClientId ? { type: "navigate", label: "Ver Cliente", route: `/clients/${archiveClientId}` } : { type: "navigate", label: "Ver Processos", route: "/cases" }
              }]);
            } else {
              throw new Error("Archive failed");
            }
          } catch (err) {
            console.error("Error archiving:", err);
            setMessages(prev => [...prev, { role: "assistant", content: "Erro ao arquivar documento. Tente novamente." }]);
          }
        }

        setAwaitingInput(null);
        setPendingData({});
        setLastUploadedFile(null);
        break;
      }

      // ==================== AUTO REGISTER DEBTOR ====================
      case "auto_register_debtor": {
        if (isNo) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Ok, devedor não cadastrado.\n\nPróximo passo: Envie mais documentos ou gere uma petição." 
          }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }

        const debtorData = pendingData.extractedDebtor;
        const targetClientId = pendingData.archiveClientId;
        
        if (!debtorData || !targetClientId) {
          setMessages(prev => [...prev, { role: "assistant", content: "Erro: dados do devedor não encontrados." }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }

        setMessages(prev => [...prev, { role: "assistant", content: `Cadastrando devedor **${debtorData.nome}**...` }]);
        
        try {
          const resp = await fetch("/api/debtors", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: debtorData.nome,
              document: debtorData.cpf || "",
              phone: debtorData.telefone || "",
              email: debtorData.email || "",
              address: debtorData.endereco || "",
              city: debtorData.cidade || "",
              state: debtorData.estado || "",
              zipCode: debtorData.cep || "",
              type: debtorData.tipo || "PF",
              clientId: targetClientId,
            }),
          });
          
          if (resp.ok) {
            const newDebtor = await resp.json();
            let successDetails = `👤 **${debtorData.nome}**`;
            if (debtorData.cpf) successDetails += `\n📄 ${debtorData.cpf}`;
            if (debtorData.endereco) successDetails += `\n📍 ${debtorData.endereco}${debtorData.cidade ? `, ${debtorData.cidade}` : ""}${debtorData.estado ? `/${debtorData.estado}` : ""}`;
            if (debtorData.telefone) successDetails += `\n📱 ${debtorData.telefone}`;
            if (debtorData.email) successDetails += `\n📧 ${debtorData.email}`;
            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `Devedor cadastrado com sucesso!\n\n${successDetails}\n📁 Vinculado ao cliente\n\nDeseja vincular um processo a este devedor? (informe o número ou 'não')`,
            }]);
            setAwaitingInput("debtor_process");
            setPendingData({ debtorId: newDebtor.id, debtorName: debtorData.nome, clientId: targetClientId });
          } else {
            throw new Error("Failed to create debtor");
          }
        } catch (err) {
          console.error("Error auto-registering debtor:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar devedor. Tente manualmente pelo menu." }]);
          setAwaitingInput(null);
          setPendingData({});
        }
        return;
      }

      // ==================== CONTRACT REGISTRATION ====================
      case "contract_client":
        setPendingData((prev: any) => ({ ...prev, clientRef: input }));
        setAwaitingInput("contract_type");
        setMessages(prev => [...prev, { role: "assistant", content: `Cliente: ${input}\n\nQual o tipo do contrato?\n\n1. Honorários\n2. Consultoria\n3. Contencioso\n4. Êxito\n\n(Digite o tipo ou número):` }]);
        break;

      case "contract_type": {
        const typeMap: Record<string, string> = { "1": "honorarios", "2": "consultoria", "3": "contencioso", "4": "exito" };
        const contractType = typeMap[input] || input.toLowerCase();
        setPendingData((prev: any) => ({ ...prev, contractType }));
        setAwaitingInput("contract_description");
        setMessages(prev => [...prev, { role: "assistant", content: `Tipo: ${contractType}\n\nDescrição breve do contrato:` }]);
        break;
      }

      case "contract_description": {
        const clientForContract = await resolveClientByName(pendingData.clientRef);
        const contractData = {
          clientId: clientForContract?.id || 1,
          tenantId: 1,
          type: pendingData.contractType || "honorarios",
          description: input,
          startDate: new Date().toISOString(),
          status: "ativo" as const,
        };
        
        setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando contrato..." }]);
        
        try {
          await createContract.mutateAsync(contractData);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Contrato cadastrado!\n\nCliente: ${pendingData.clientRef}\nTipo: ${contractData.type}\nDescrição: ${input}`,
            action: { type: "navigate", label: "Ver Contratos", route: "/contracts" }
          }]);
        } catch (err) {
          console.error("Error creating contract:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar contrato. Tente novamente." }]);
        }
        
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== CASE REGISTRATION ====================
      case "case_number":
        setPendingData((prev: any) => ({ ...prev, caseNumber: input }));
        setAwaitingInput("case_title");
        setMessages(prev => [...prev, { role: "assistant", content: `Número: ${input}\n\nInforme um título breve para o processo:` }]);
        break;

      case "case_title":
        setPendingData((prev: any) => ({ ...prev, title: input }));
        setAwaitingInput("case_type");
        setMessages(prev => [...prev, { role: "assistant", content: `Título: ${input}\n\nQual o tipo do processo?\n\n1. Cível\n2. Trabalhista\n3. Tributário\n4. Criminal\n5. Federal\n6. Administrativo\n\n(Digite o tipo ou número):` }]);
        break;

      case "case_type": {
        const caseTypeMap: Record<string, string> = { "1": "civil", "2": "trabalhista", "3": "tributario", "4": "criminal", "5": "federal", "6": "administrativo" };
        const caseType = caseTypeMap[input] || input.toLowerCase();
        setPendingData((prev: any) => ({ ...prev, caseType }));
        setAwaitingInput("case_court");
        setMessages(prev => [...prev, { role: "assistant", content: `Tipo: ${caseType}\n\nQual a vara/tribunal? (ex: TJDFT - 1ª Vara Cível):` }]);
        break;
      }

      case "case_court": {
        const caseData = {
          caseNumber: pendingData.caseNumber,
          title: pendingData.title,
          court: input,
          caseType: pendingData.caseType || "civil",
          clientId: pendingData.clientId || 1,
          tenantId: 1,
          status: "ativo" as const,
        };
        
        setMessages(prev => [...prev, { role: "assistant", content: "Cadastrando processo..." }]);
        
        try {
          await createCase.mutateAsync(caseData);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Processo cadastrado!\n\nNúmero: ${caseData.caseNumber}\nTítulo: ${caseData.title}\nTipo: ${caseData.caseType}\nVara: ${caseData.court}`,
            action: { type: "navigate", label: "Ver Processos", route: "/cases" }
          }]);
        } catch (err) {
          console.error("Error creating case:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao cadastrar processo. Tente novamente." }]);
        }
        
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== PETITION GENERATION ====================
      case "petition_type": {
        const typeIndex = parseInt(input) - 1;
        let selectedType = PIECE_TYPES[typeIndex];
        if (!selectedType) {
          const lower = input.toLowerCase();
          selectedType = PIECE_TYPES.find(t => t.label.toLowerCase().includes(lower)) || PIECE_TYPES[0];
        }
        setPendingData((prev: any) => ({ ...prev, petitionType: selectedType.key, petitionLabel: selectedType.label }));
        setAwaitingInput("petition_client");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Tipo selecionado: ${selectedType.label}\n\nPara qual cliente/devedor é esta peça? (informe o nome):` 
        }]);
        break;
      }

      case "petition_client": {
        setPendingData((prev: any) => ({ ...prev, petitionClientRef: input }));
        setAwaitingInput("petition_facts");
        let contextInfo = "";
        if (uploadedDocuments.length > 0) {
          contextInfo = "\n\n📋 Documentos que serão usados como contexto:";
          uploadedDocuments.forEach(d => {
            contextInfo += `\nDoc. ${d.index}: ${d.classification}`;
          });
        }
        const studioRedirectUrl = `/studio?templateType=${encodeURIComponent(pendingData.petitionType)}&clientRef=${encodeURIComponent(input)}`;
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Cliente/Devedor: ${input}${contextInfo}\n\nDescreva os fatos e instruções para a peça (ou 'gerar' para usar apenas os documentos da conversa como base):\n\nOu abra diretamente no Estúdio para mais opções:`,
          action: { type: "navigate", label: "Abrir no Estúdio", route: studioRedirectUrl }
        }]);
        break;
      }

      case "petition_facts": {
        const useDocsOnly = input.toLowerCase() === "gerar" || input.toLowerCase() === "g";
        
        setMessages(prev => [...prev, { role: "assistant", content: `Gerando ${pendingData.petitionLabel}... Isso pode levar alguns segundos.` }]);
        setIsProcessing(true);

        try {
          let prompt = "";
          if (useDocsOnly && uploadedDocuments.length > 0) {
            prompt = `Gere uma ${pendingData.petitionLabel} completa, extraindo todos os dados de qualificação das partes (nome, CPF/CNPJ, RG, endereço, telefone, email, nacionalidade, estado civil, profissão) diretamente dos documentos anexos.`;
          } else {
            prompt = input;
          }

          if (calculationMemory) {
            prompt += `\n\nMemória de Cálculo:\n${calculationMemory}`;
          }

          prompt += `\n\nCliente/Parte: ${pendingData.petitionClientRef}`;

          const studioFiles = uploadedDocuments.map(d => ({
            name: `Doc. ${d.index}: ${d.classification} (${d.fileName})`,
            type: d.classification || "documento",
            data: "",
            extractedText: d.extractedText || "",
            isReferenceModel: false,
          }));

          const result = await studioApi.generate({
            prompt,
            templateType: pendingData.petitionType,
            attorney: "pedro",
            files: studioFiles,
            selectedJurisprudence: [],
            selectedDoctrine: [],
          });

          if (result.content) {
            const savedPiece = await studioApi.savePiece({
              title: `${pendingData.petitionLabel} - ${pendingData.petitionClientRef}`,
              pieceType: pendingData.petitionType,
              contentHtml: result.content,
              prompt: prompt.substring(0, 5000),
            });

            const pieceId = savedPiece?.id || "";

            let docsPackage = "";
            if (uploadedDocuments.length > 0) {
              docsPackage = "\n\n📦 Pacote de Protocolo (PJe+R):";
              docsPackage += `\n📄 Peça: ${pendingData.petitionLabel} - ${pendingData.petitionClientRef}`;
              uploadedDocuments.forEach(d => {
                docsPackage += `\n📎 Doc. ${d.index}: ${d.classification}`;
              });
              if (calculationMemory) {
                docsPackage += "\n📊 Memória de Cálculo incluída";
              }
              docsPackage += "\n\nAcesse o Estúdio para revisar, exportar e protocolar via PJe+R.";
            }

            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `${pendingData.petitionLabel} gerada e salva com sucesso!\n\nPeça pronta para revisão no LexAI Estúdio.${docsPackage}\n\nPróximo passo: Após protocolar, informe o número do processo para vincular ao devedor.`,
              actions: [
                { type: "navigate", label: "Abrir no Estúdio", route: `/studio?tab=history&pieceId=${pieceId}` },
                { type: "navigate", label: "PJe TJDFT", route: "https://pje.tjdft.jus.br" },
              ]
            }]);
          }
        } catch (err) {
          console.error("Error generating piece:", err);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Erro ao gerar a peça. Tente novamente ou acesse o Estúdio diretamente.",
            action: { type: "navigate", label: "Ir para Estúdio", route: "/studio" }
          }]);
        }

        setIsProcessing(false);
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== LINK PROCESS TO DEBTOR ====================
      case "link_process_number":
        setPendingData((prev: any) => ({ ...prev, processNumber: input }));
        setAwaitingInput("link_process_debtor");
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `Número do processo: ${input}\n\nPara qual devedor vincular? (informe o nome):` 
        }]);
        break;

      case "link_process_debtor": {
        setMessages(prev => [...prev, { role: "assistant", content: `Buscando devedor "${input}"...` }]);
        const debtor = await resolveDebtorByName(input);
        
        if (!debtor) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Devedor "${input}" não encontrado. Verifique o nome ou cadastre o devedor primeiro.` 
          }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }

        try {
          const caseData = {
            caseNumber: pendingData.processNumber,
            title: `Processo ${pendingData.processNumber} - ${debtor.name}`,
            court: "TJDFT",
            caseType: "civil",
            clientId: debtor.clientId,
            tenantId: 1,
            status: "ativo" as const,
          };

          await createCase.mutateAsync(caseData);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Processo vinculado com sucesso!\n\nNúmero: ${pendingData.processNumber}\nDevedor: ${debtor.name}\nCliente: ID ${debtor.clientId}\n\nPróximo passo: Deseja enviar guia de custas para o cliente pagar?`,
            action: { type: "navigate", label: "Ver Processos", route: "/cases" }
          }]);
        } catch (err) {
          console.error("Error linking process:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao vincular processo. Tente novamente." }]);
        }

        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== DEBTOR REPORT ====================
      case "debtor_report_name": {
        setMessages(prev => [...prev, { role: "assistant", content: `Buscando devedor "${input}" e gerando relatório...` }]);
        const reportDebtor = await resolveDebtorByName(input);
        if (!reportDebtor) {
          setMessages(prev => [...prev, { role: "assistant", content: `Devedor "${input}" não encontrado. Verifique o nome e tente novamente.` }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }
        try {
          const data = await debtorsApi.generateCaseReport(reportDebtor.id);
          const caseBadges = data.cases?.map((c: any) => c.caseNumber).join(", ") || "";
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `📋 **Relatório gerado para ${reportDebtor.name}**\n${caseBadges ? `Processos: ${caseBadges}\n` : ""}\n${data.report}`
          }]);
        } catch {
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao gerar relatório. Tente novamente." }]);
        }
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== DEBTOR DOCS ====================
      case "debtor_docs_name": {
        setMessages(prev => [...prev, { role: "assistant", content: `Buscando documentos do devedor "${input}"...` }]);
        const docsDebtor = await resolveDebtorByName(input);
        if (!docsDebtor) {
          setMessages(prev => [...prev, { role: "assistant", content: `Devedor "${input}" não encontrado. Verifique o nome e tente novamente.` }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }
        try {
          const docs = await debtorsApi.getDocuments(docsDebtor.id);
          if (docs.length === 0) {
            setMessages(prev => [...prev, { role: "assistant", content: `Nenhum documento encontrado para o devedor "${docsDebtor.name}".` }]);
          } else {
            const docList = docs.map((d: any) => `📄 ${d.title || "Sem título"} (${d.type || "N/I"} · ${d.createdAt ? new Date(d.createdAt).toLocaleDateString("pt-BR") : "?"})`).join("\n");
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `📎 **Documentos de ${docsDebtor.name}** (${docs.length}):\n\n${docList}`
            }]);
          }
        } catch {
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao buscar documentos. Tente novamente." }]);
        }
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      // ==================== SEND GUIDE ====================
      case "send_guide_client": {
        setMessages(prev => [...prev, { role: "assistant", content: `Buscando cliente "${input}"...` }]);
        const guideClient = await resolveClientByName(input);
        
        if (!guideClient) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Cliente "${input}" não encontrado. Verifique o nome e tente novamente.` 
          }]);
          setAwaitingInput(null);
          setPendingData({});
          return;
        }

        setPendingData((prev: any) => ({ ...prev, guideClientId: guideClient.id, guideClientName: guideClient.name }));
        
        const lastDoc = uploadedDocuments[uploadedDocuments.length - 1];
        const hasGuide = lastDoc && (
          lastDoc.classification.toLowerCase().includes("guia") || 
          lastDoc.classification.toLowerCase().includes("custas") ||
          lastDoc.classification.toLowerCase().includes("boleto")
        );

        if (hasGuide) {
          setAwaitingInput("send_guide_confirm");
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Cliente: ${guideClient.name}\n\n📄 Documento detectado: Doc. ${lastDoc.index} - ${lastDoc.classification}\n\nDeseja enviar este documento como guia de custas via WhatsApp? (sim/não)` 
          }]);
        } else {
          setAwaitingInput("send_guide_upload");
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Cliente: ${guideClient.name}\n\nEnvie a guia de custas (use o botão de anexar 📎) ou digite a mensagem para enviar por WhatsApp:` 
          }]);
        }
        break;
      }

      case "send_guide_confirm": {
        if (input.toLowerCase().startsWith("s")) {
          try {
            const clientData = await clientsApi.getById(pendingData.guideClientId);
            const phone = clientData?.phone || clientData?.whatsapp;
            
            if (phone) {
              const message = `Prezado(a) ${pendingData.guideClientName},\n\nSegue guia de custas para pagamento referente ao seu processo.\n\nAtt.,\nMarques & Serra Sociedade de Advogados`;
              
              await fetch("/api/whatsapp/send-to-number", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber: phone, message }),
              });

              setMessages(prev => [...prev, { 
                role: "assistant", 
                content: `Mensagem enviada via WhatsApp para ${pendingData.guideClientName} (${phone})!\n\nNota: A guia de custas em PDF deve ser enviada manualmente pela Secretária LexAI.\n\nPróximo passo: Quando o cliente pagar, envie o comprovante para arquivar.` 
              }]);
            } else {
              setMessages(prev => [...prev, { 
                role: "assistant", 
                content: `Cliente ${pendingData.guideClientName} não tem telefone cadastrado. Cadastre o telefone primeiro ou envie por e-mail.`,
                action: { type: "navigate", label: "Editar Cliente", route: `/clients/${pendingData.guideClientId}` }
              }]);
            }
          } catch (err) {
            console.error("Error sending guide:", err);
            setMessages(prev => [...prev, { role: "assistant", content: "Erro ao enviar guia. Verifique a conexão do WhatsApp." }]);
          }
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: "Ok, envio cancelado." }]);
        }
        setAwaitingInput(null);
        setPendingData({});
        break;
      }

      case "send_guide_upload": {
        try {
          const clientData = await clientsApi.getById(pendingData.guideClientId);
          const phone = clientData?.phone || clientData?.whatsapp;
          
          if (phone) {
            const message = input || `Prezado(a) ${pendingData.guideClientName},\n\nSegue guia de custas para pagamento.\n\nAtt.,\nMarques & Serra Sociedade de Advogados`;
            
            await fetch("/api/whatsapp/send-to-number", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber: phone, message }),
            });

            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `Mensagem enviada via WhatsApp para ${pendingData.guideClientName} (${phone})!\n\nPróximo passo: Quando o cliente pagar, envie o comprovante para arquivar.` 
            }]);
          } else {
            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `Cliente sem telefone cadastrado. Envie por outro canal ou cadastre o telefone primeiro.` 
            }]);
          }
        } catch (err) {
          console.error("Error sending:", err);
          setMessages(prev => [...prev, { role: "assistant", content: "Erro ao enviar. Verifique a conexão do WhatsApp." }]);
        }
        setAwaitingInput(null);
        setPendingData({});
        break;
      }
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");

    setMessages(prev => [...prev, { role: "user", content: userMessage }]);

    if (awaitingInput) {
      await processAwaitingInput(userMessage);
      return;
    }

    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("cadastrar devedor") || lowerMessage.includes("novo devedor") || lowerMessage.includes("registrar devedor")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "register_debtor")!);
      return;
    }

    if (lowerMessage.includes("cadastrar cliente") || lowerMessage.includes("novo cliente") || lowerMessage.includes("registrar cliente")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "register_client")!);
      return;
    }

    if (lowerMessage.includes("novo processo") || lowerMessage.includes("cadastrar processo") || lowerMessage.includes("registrar processo")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "new_case")!);
      return;
    }

    if (lowerMessage.includes("novo contrato") || lowerMessage.includes("cadastrar contrato") || lowerMessage.includes("registrar contrato")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "register_contract")!);
      return;
    }

    if (lowerMessage.includes("relatório do devedor") || lowerMessage.includes("relatorio do devedor") || lowerMessage.includes("relatório devedor") || lowerMessage.includes("relatorio devedor") || lowerMessage.includes("estado do processo do devedor") || lowerMessage.includes("situação do devedor")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "debtor_report")!);
      return;
    }

    if (lowerMessage.includes("documentos do devedor") || lowerMessage.includes("docs do devedor") || lowerMessage.includes("listar documentos devedor") || lowerMessage.includes("documentos devedor")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "debtor_docs")!);
      return;
    }

    if (lowerMessage.includes("vincular processo") || lowerMessage.includes("número do processo") || lowerMessage.includes("processo do devedor")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "link_process")!);
      return;
    }

    if (lowerMessage.includes("enviar guia") || lowerMessage.includes("enviar custas") || lowerMessage.includes("mandar boleto") || lowerMessage.includes("guia de custas")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "send_guide")!);
      return;
    }

    if (lowerMessage.includes("gerar peça") || lowerMessage.includes("gerar peca") || lowerMessage.includes("fazer petição") || lowerMessage.includes("fazer peticao") || lowerMessage.includes("gerar petição") || lowerMessage.includes("gerar peticao") || lowerMessage.includes("peça processual") || lowerMessage.includes("peca processual")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "generate_piece")!);
      return;
    }

    if (lowerMessage.includes("calcular") || lowerMessage.includes("atualização monetária") || lowerMessage.includes("atualizacao monetaria") || lowerMessage.includes("memória de cálculo") || lowerMessage.includes("memoria de calculo") || lowerMessage.includes("cálculo judicial") || lowerMessage.includes("calculo judicial")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "calculator")!);
      return;
    }

    if (lowerMessage.includes("relatório") || lowerMessage.includes("relatorio") || lowerMessage.includes("report")) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Para gerar relatórios de um cliente específico, acesse o detalhe do cliente e use a aba 'Relatórios'. Lá você pode gerar relatórios gerais, de processos, financeiros e mais.",
        actions: [
          { type: "navigate", label: "Ver Clientes", route: "/clients" },
          { type: "navigate", label: "Ver Relatórios", route: "/reports" },
        ]
      }]);
      return;
    }

    if (lowerMessage.includes("agenda") || lowerMessage.includes("prazos") || lowerMessage.includes("calendário") || lowerMessage.includes("calendario")) {
      handleQuickAction(QUICK_ACTIONS.find(a => a.action === "show_calendar")!);
      return;
    }

    if (lowerMessage.includes("faturamento") || lowerMessage.includes("financeiro") || lowerMessage.includes("cobrança") || lowerMessage.includes("fatura")) {
      navigate("/billing");
      setMessages(prev => [...prev, { role: "assistant", content: "Abrindo o módulo financeiro...", action: { type: "navigate", label: "Ver Financeiro", route: "/billing" } }]);
      return;
    }

    if (lowerMessage.includes("estúdio") || lowerMessage.includes("studio")) {
      navigate("/studio");
      setMessages(prev => [...prev, { role: "assistant", content: "Abrindo o LexAI Estúdio...", action: { type: "navigate", label: "Ir para Estúdio", route: "/studio" } }]);
      return;
    }

    if (lowerMessage.includes("cálculo") || lowerMessage.includes("calculo") || lowerMessage.includes("custas")) {
      navigate("/calculadora");
      setMessages(prev => [...prev, { role: "assistant", content: "Abrindo o módulo de Cálculos e Custas...", action: { type: "navigate", label: "Ver Cálculos", route: "/calculadora" } }]);
      return;
    }

    if (lowerMessage.includes("dashboard") || lowerMessage.includes("painel") || lowerMessage.includes("início") || lowerMessage.includes("inicio")) {
      navigate("/");
      setMessages(prev => [...prev, { role: "assistant", content: "Abrindo o painel principal..." }]);
      return;
    }

    if (lowerMessage.includes("arquivar") || lowerMessage.includes("salvar documento") || lowerMessage.includes("vincular documento")) {
      if (lastUploadedFile) {
        setAwaitingInput("archive_target");
        setPendingData({ fileName: lastUploadedFile.name });
        setMessages(prev => [...prev, { role: "assistant", content: "Para qual cliente ou processo deseja arquivar o último documento enviado?" }]);
        return;
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Envie um documento primeiro (use o botão 📎) e depois peça para arquivar." }]);
        return;
      }
    }

    if (lowerMessage.includes("documentos classificados") || lowerMessage.includes("lista de documentos") || lowerMessage.includes("docs classificados")) {
      if (uploadedDocuments.length > 0) {
        let list = "📋 Documentos classificados na conversa:\n";
        uploadedDocuments.forEach(d => {
          list += `\nDoc. ${d.index}: ${d.classification} (${d.fileName})`;
        });
        setMessages(prev => [...prev, { role: "assistant", content: list }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Nenhum documento foi enviado nesta conversa ainda. Use o botão 📎 para enviar documentos." }]);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const currentMsgs = messages;
      const aiResponse = await sendToAI(userMessage, currentMsgs);
      setMessages(prev => [...prev, { role: "assistant", content: aiResponse }]);
    } catch {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Desculpe, não consegui processar sua solicitação. Tente novamente ou use os atalhos rápidos." 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNavigate = (route: string) => {
    if (route.startsWith("http")) {
      window.open(route, "_blank");
    } else {
      navigate(route);
      setIsOpen(false);
    }
  };

  const cardPosition = useCallback(() => {
    if (isFullscreen) return { x: 0, y: 0 };
    const cardW = isMinimized ? 288 : 384;
    const cardH = isMinimized ? 56 : 550;
    const margin = 16;
    let x = btnPosition.x;
    let y = btnPosition.y - cardH + 48;
    if (x + cardW > window.innerWidth - margin) x = window.innerWidth - cardW - margin;
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (y + cardH > window.innerHeight - margin) y = window.innerHeight - cardH - margin;
    return { x, y };
  }, [btnPosition, isMinimized, isFullscreen]);

  if (!isOpen) {
    return (
      <button
        ref={btnRef}
        onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }}
        onTouchStart={(e) => { handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }}
        onClick={(e) => {
          if (dragRef.current?.moved) { e.preventDefault(); return; }
          setIsOpen(true);
        }}
        className="fixed z-50 select-none touch-none cursor-grab active:cursor-grabbing"
        style={{
          left: btnPosition.x,
          top: btnPosition.y,
          width: 48,
          height: 48,
          borderRadius: "50%",
          overflow: "hidden",
          border: "none",
          outline: "none",
          padding: 0,
          margin: 0,
          background: "transparent",
          boxShadow: "none",
          WebkitAppearance: "none",
          appearance: "none",
          transition: isDragging ? "none" : "left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        data-testid="floating-ai-button"
      >
        <img src={logoMs} alt="LexAI" style={{ width: 48, height: 48, objectFit: "cover", display: "block", borderRadius: "50%", transform: "scale(1.3)", transformOrigin: "center center" }} />
      </button>
    );
  }

  const cPos = cardPosition();

  return (
    <Card className={`fixed z-50 shadow-2xl transition-all duration-300 ${
      isFullscreen
        ? "w-full h-full rounded-none"
        : isMinimized 
          ? "w-72 h-14" 
          : "w-96 h-[550px] max-h-[85vh]"
    }`} style={isFullscreen ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: cPos.x, top: cPos.y }}>
      <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-medium">Agente LexAI</CardTitle>
            {!isMinimized && <p className="text-[10px] text-muted-foreground">Agente Executivo Completo</p>}
          </div>
        </div>
        <div className="flex gap-1">
          {!isMinimized && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={handleNewConversation}
              title="Nova Conversa"
              data-testid="button-new-conversation"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          )}
          {!isMinimized && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              data-testid="button-fullscreen-toggle"
            >
              {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => { setIsMinimized(!isMinimized); if (!isMinimized) setIsFullscreen(false); }}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => { setIsOpen(false); setIsFullscreen(false); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-0 flex flex-col h-[calc(100%-56px)]">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Ações Rápidas</p>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_ACTIONS.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] justify-start gap-1.5 hover:bg-primary hover:text-primary-foreground transition-colors px-2"
                  onClick={() => handleQuickAction(action)}
                  disabled={isProcessing || isProcessingFile}
                  data-testid={`quick-action-${action.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <action.icon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                      <Bot className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] space-y-2`}>
                    <div className={`p-2 rounded-lg text-xs ${
                      msg.role === 'assistant' 
                        ? 'bg-muted text-foreground' 
                        : 'bg-primary text-primary-foreground'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.action && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs w-full"
                        onClick={() => handleNavigate(msg.action!.route!)}
                        data-testid={`nav-btn-${i}`}
                      >
                        {msg.action.label}
                      </Button>
                    )}
                    {msg.actions && msg.actions.map((act, j) => (
                      <Button
                        key={j}
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs w-full"
                        onClick={() => handleNavigate(act.route!)}
                        data-testid={`nav-btn-${i}-${j}`}
                      >
                        {act.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {(isProcessing || isProcessingFile) && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                  </div>
                  <div className="bg-muted p-2 rounded-lg text-xs text-muted-foreground">
                    {isProcessingFile ? "Analisando arquivo..." : "Processando..."}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-3 border-t">
            {isRecording && (
              <div className="flex items-center gap-2 text-red-600 text-xs mb-2 animate-pulse">
                <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                Gravando... Clique no microfone para parar
              </div>
            )}
            {uploadedDocuments.length > 0 && (
              <div className="text-[10px] text-muted-foreground mb-1">
                📋 {uploadedDocuments.length} doc(s) classificado(s)
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".txt,.pdf,.doc,.docx,.jpg,.jpeg,.png,.csv,.mp3,.wav,.ogg,.m4a,.webm,.mp4"
                onChange={handleFileUpload}
                data-testid="floating-ai-file-input"
              />
              <Button 
                variant="outline"
                size="icon" 
                className="h-8 w-8 flex-shrink-0" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing || isProcessingFile}
                title="Anexar arquivo"
                data-testid="floating-ai-attach"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={isRecording ? "destructive" : "outline"}
                size="icon" 
                className="h-8 w-8 flex-shrink-0" 
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={isProcessing || isProcessingFile}
                title={isRecording ? "Parar gravação" : "Gravar voz"}
                data-testid="floating-ai-mic"
              >
                {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isRecording ? "Gravando..." : awaitingInput ? "Digite sua resposta..." : "Comando ou pergunta..."}
                className="h-8 text-xs"
                disabled={isProcessing || isRecording || isProcessingFile}
                data-testid="floating-ai-input"
              />
              <Button 
                size="icon" 
                className="h-8 w-8 flex-shrink-0" 
                onClick={handleSend}
                disabled={!inputValue.trim() || isProcessing || isProcessingFile}
                data-testid="floating-ai-send"
              >
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
