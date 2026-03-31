import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { casesApi } from "@/lib/api";
import { format, differenceInMonths, differenceInDays, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calculator,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Send,
  Printer,
  FileText,
  ChevronDown,
  ChevronUp,
  Scale,
} from "lucide-react";

const EXTERNAL_LINKS = [
  {
    id: "tjdft",
    label: "TJDFT - Custas e Emolumentos",
    description: "Tribunal de Justiça do Distrito Federal e Territórios",
    url: "https://pagcustas.tjdft.jus.br/",
  },
  {
    id: "gru",
    label: "GRU Federal - Guia de Recolhimento da União",
    description: "Consulta e emissão de GRU junto ao Tesouro Nacional",
    url: "https://consulta.tesouro.fazenda.gov.br/gru/gru_simples.asp",
  },
  {
    id: "tjsp",
    label: "TJSP - Despesas Processuais",
    description: "Tribunal de Justiça do Estado de São Paulo",
    url: "https://www.tjsp.jus.br/IndicesTaxasJudiciarias/DespesasProcessuais",
  },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

type IndiceCorrecao = "tjdft" | "inpc";
type TipoJuros = "legais" | "fixo" | "sem";
type IncidenciaJuros = "data_valores" | "data_fixa" | "citacao";

interface Parcela {
  id: string;
  valor: number;
  data: string;
  descricao: string;
}

interface Multa {
  id: string;
  tipo: "percentual" | "monetaria";
  valor: number;
  data?: string;
  descricao: string;
}

interface Honorario {
  tipo: "percentual" | "monetario";
  valor: number;
  data?: string;
}

interface Art523 {
  tipo: "multa" | "honorario" | "ambas";
  multaPerc: number;
  honorarioPerc: number;
}

interface CustaProcessual {
  id: string;
  valor: number;
  data: string;
  descricao: string;
}

interface ParcelaCalc {
  data: string;
  descricao: string;
  valor: number;
  indiceLabel: string;
  fator: number;
  valorAtualizacao: number;
  valorAtualizado: number;
  jurosPerc: number;
  valorJuros: number;
  total: number;
}

interface CalcResult {
  parcelas: ParcelaCalc[];
  totalParcelas: number;
  multasPerc: number;
  multasMon: number;
  totalMultas: number;
  honorariosVal: number;
  art523MultaVal: number;
  art523HonVal: number;
  totalArt523: number;
  custasVal: number;
  totalGeral: number;
  dataCalculo: string;
  processo: string;
  credor: string;
  devedor: string;
  custasDetail: ParcelaCalc[];
}

function calcMonthsBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const m = differenceInMonths(end, start);
  const afterM = addMonths(start, m);
  const d = differenceInDays(end, afterM);
  return m + d / 30;
}

function getCorrectionFactor(dataValor: string, dataFim: string, indice: IndiceCorrecao): { fator: number; label: string } {
  const INPC_RATE = 0.004;
  const IPCA_RATE = 0.0045;
  const TRANSITION_DATE = "2024-09-01";

  if (indice === "inpc") {
    const months = calcMonthsBetween(dataValor, dataFim);
    const fator = Math.pow(1 + INPC_RATE, Math.max(months, 0));
    return { fator, label: "INPC" };
  }

  if (dataValor >= TRANSITION_DATE) {
    const months = calcMonthsBetween(dataValor, dataFim);
    const fator = Math.pow(1 + IPCA_RATE, Math.max(months, 0));
    return { fator, label: "IPCA" };
  }

  if (dataFim <= TRANSITION_DATE) {
    const months = calcMonthsBetween(dataValor, dataFim);
    const fator = Math.pow(1 + INPC_RATE, Math.max(months, 0));
    return { fator, label: "INPC" };
  }

  const monthsInpc = calcMonthsBetween(dataValor, TRANSITION_DATE);
  const monthsIpca = calcMonthsBetween(TRANSITION_DATE, dataFim);
  const fator = Math.pow(1 + INPC_RATE, Math.max(monthsInpc, 0)) * Math.pow(1 + IPCA_RATE, Math.max(monthsIpca, 0));
  return { fator, label: "INPC/IPCA" };
}

function getJurosRate(dataInicio: string, dataFim: string, tipoJuros: TipoJuros, juroFixo: number, indice: IndiceCorrecao): number {
  if (tipoJuros === "sem") return 0;
  if (tipoJuros === "fixo") {
    const months = calcMonthsBetween(dataInicio, dataFim);
    return Math.max(months, 0) * (juroFixo / 100);
  }

  const D1 = "2003-01-11";
  const D2 = "2024-08-30";

  let totalRate = 0;
  const start = dataInicio;
  const end = dataFim;

  if (start < D1) {
    const segEnd = end < D1 ? end : D1;
    const m = calcMonthsBetween(start, segEnd);
    totalRate += Math.max(m, 0) * 0.005;
  }

  const seg2Start = start > D1 ? start : D1;
  if (indice === "tjdft") {
    if (seg2Start < D2) {
      const segEnd = end < D2 ? end : D2;
      if (seg2Start < segEnd) {
        const m = calcMonthsBetween(seg2Start, segEnd);
        totalRate += Math.max(m, 0) * 0.01;
      }
    }
    if (end > D2) {
      const segStart = seg2Start > D2 ? seg2Start : D2;
      const m = calcMonthsBetween(segStart, end);
      totalRate += Math.max(m, 0) * 0.01;
    }
  } else {
    if (seg2Start < end) {
      const m = calcMonthsBetween(seg2Start, end);
      totalRate += Math.max(m, 0) * 0.01;
    }
  }

  return totalRate;
}

let idCounter = 0;
function genId(): string {
  return `id_${Date.now()}_${++idCounter}`;
}

export default function CalculadoraPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("dados");

  const [processo, setProcesso] = useState("");
  const [credor, setCredor] = useState("");
  const [devedor, setDevedor] = useState("");
  const [dataFinalCalculo, setDataFinalCalculo] = useState("");

  const [indiceCorrecao, setIndiceCorrecao] = useState<IndiceCorrecao>("tjdft");
  const [tipoJuros, setTipoJuros] = useState<TipoJuros>("legais");
  const [juroFixoPerc, setJuroFixoPerc] = useState("1");
  const [incidenciaJuros, setIncidenciaJuros] = useState<IncidenciaJuros>("data_valores");
  const [dataFixaJuros, setDataFixaJuros] = useState("");
  const [dataCitacao, setDataCitacao] = useState("");

  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [novaParcela, setNovaParcela] = useState({ valor: "", data: "", descricao: "" });
  const [showRecorrente, setShowRecorrente] = useState(false);
  const [recorrente, setRecorrente] = useState({ valor: "", dataInicio: "", meses: "1" });
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);

  const [multas, setMultas] = useState<Multa[]>([]);
  const [showAddMulta, setShowAddMulta] = useState(false);
  const [novaMulta, setNovaMulta] = useState({ tipo: "percentual" as "percentual" | "monetaria", valor: "", data: "", descricao: "" });

  const [honorario, setHonorario] = useState<Honorario>({ tipo: "percentual", valor: 0 });
  const [honorarioPerc, setHonorarioPerc] = useState("");
  const [honorarioVal, setHonorarioVal] = useState("");
  const [honorarioData, setHonorarioData] = useState("");
  const [honorarioTipo, setHonorarioTipo] = useState<"percentual" | "monetario">("percentual");

  const [art523Enabled, setArt523Enabled] = useState(false);
  const [art523Tipo, setArt523Tipo] = useState<"multa" | "honorario" | "ambas">("ambas");
  const [art523MultaPerc, setArt523MultaPerc] = useState("10");
  const [art523HonPerc, setArt523HonPerc] = useState("10");

  const [custasProcessuais, setCustasProcessuais] = useState<CustaProcessual[]>([]);
  const [novaCusta, setNovaCusta] = useState({ valor: "", data: "", descricao: "" });

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identificacao: true,
    correcao: true,
    juros: true,
    valores: true,
    multas: false,
    honorarios: false,
    art523: false,
    custas: false,
  });

  const { data: cases = [] } = useQuery<any[]>({
    queryKey: ["cases"],
    queryFn: casesApi.getAll,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const jurosLegaisLabel = useMemo(() => {
    if (indiceCorrecao === "tjdft") {
      return "Juros legais (0,5% até 10/01/2003, 1% a partir de 11/01/2003 e Taxa legal a partir de 30/08/2024)";
    }
    return "Juros legais (0,5% até 10/01/2003, 1% a partir de 11/01/2003)";
  }, [indiceCorrecao]);

  const addParcela = () => {
    const val = parseFloat(novaParcela.valor.replace(",", ".")) || 0;
    if (val <= 0 || !novaParcela.data) return;
    setParcelas((prev) => [
      ...prev,
      { id: genId(), valor: val, data: novaParcela.data, descricao: novaParcela.descricao || "Parcela" },
    ]);
    setNovaParcela({ valor: "", data: "", descricao: "" });
  };

  const addRecorrentes = () => {
    const val = parseFloat(recorrente.valor.replace(",", ".")) || 0;
    const meses = parseInt(recorrente.meses) || 0;
    if (val <= 0 || !recorrente.dataInicio || meses <= 0) return;
    const novas: Parcela[] = [];
    for (let i = 0; i < meses; i++) {
      const d = addMonths(new Date(recorrente.dataInicio + "T00:00:00"), i);
      novas.push({
        id: genId(),
        valor: val,
        data: format(d, "yyyy-MM-dd"),
        descricao: `Parcela ${i + 1}/${meses}`,
      });
    }
    setParcelas((prev) => [...prev, ...novas]);
    setRecorrente({ valor: "", dataInicio: "", meses: "1" });
    setShowRecorrente(false);
  };

  const removeParcela = (id: string) => setParcelas((prev) => prev.filter((p) => p.id !== id));

  const addMulta = () => {
    const val = parseFloat(novaMulta.valor.replace(",", ".")) || 0;
    if (val <= 0) return;
    setMultas((prev) => [
      ...prev,
      {
        id: genId(),
        tipo: novaMulta.tipo,
        valor: val,
        data: novaMulta.tipo === "monetaria" ? novaMulta.data : undefined,
        descricao: novaMulta.descricao || (novaMulta.tipo === "percentual" ? "Multa %" : "Multa R$"),
      },
    ]);
    setNovaMulta({ tipo: "percentual", valor: "", data: "", descricao: "" });
    setShowAddMulta(false);
  };

  const removeMulta = (id: string) => setMultas((prev) => prev.filter((m) => m.id !== id));

  const addCusta = () => {
    const val = parseFloat(novaCusta.valor.replace(",", ".")) || 0;
    if (val <= 0 || !novaCusta.data) return;
    setCustasProcessuais((prev) => [
      ...prev,
      { id: genId(), valor: val, data: novaCusta.data, descricao: novaCusta.descricao || "Custa processual" },
    ]);
    setNovaCusta({ valor: "", data: "", descricao: "" });
  };

  const removeCusta = (id: string) => setCustasProcessuais((prev) => prev.filter((c) => c.id !== id));

  const handleCalculate = () => {
    if (parcelas.length === 0) return;

    const dataFim = dataFinalCalculo || todayStr();
    const juroFixo = parseFloat(juroFixoPerc) || 0;

    const parcelasCalc: ParcelaCalc[] = parcelas.map((p) => {
      const { fator, label } = getCorrectionFactor(p.data, dataFim, indiceCorrecao);
      const valorAtualizado = p.valor * fator;
      const valorAtualizacao = valorAtualizado - p.valor;

      let jurosDataInicio = p.data;
      if (incidenciaJuros === "data_fixa" && dataFixaJuros) jurosDataInicio = dataFixaJuros;
      if (incidenciaJuros === "citacao" && dataCitacao) jurosDataInicio = dataCitacao;

      const jurosPerc = getJurosRate(jurosDataInicio, dataFim, tipoJuros, juroFixo, indiceCorrecao);
      const valorJuros = valorAtualizado * jurosPerc;
      const total = valorAtualizado + valorJuros;

      return {
        data: p.data,
        descricao: p.descricao,
        valor: p.valor,
        indiceLabel: label,
        fator,
        valorAtualizacao,
        valorAtualizado,
        jurosPerc: jurosPerc * 100,
        valorJuros,
        total,
      };
    });

    const totalParcelas = parcelasCalc.reduce((s, p) => s + p.total, 0);

    let multasPerc = 0;
    multas.filter((m) => m.tipo === "percentual").forEach((m) => {
      multasPerc += totalParcelas * (m.valor / 100);
    });

    let multasMon = 0;
    const multasMonCalc: ParcelaCalc[] = [];
    multas.filter((m) => m.tipo === "monetaria").forEach((m) => {
      const d = m.data || dataFim;
      const { fator, label } = getCorrectionFactor(d, dataFim, indiceCorrecao);
      const corrigido = m.valor * fator;
      multasMon += corrigido;
      multasMonCalc.push({
        data: d,
        descricao: m.descricao,
        valor: m.valor,
        indiceLabel: label,
        fator,
        valorAtualizacao: corrigido - m.valor,
        valorAtualizado: corrigido,
        jurosPerc: 0,
        valorJuros: 0,
        total: corrigido,
      });
    });

    const totalMultas = multasPerc + multasMon;
    const subtotalABC = totalParcelas + totalMultas;

    let honorariosVal = 0;
    if (honorarioTipo === "percentual") {
      const perc = parseFloat(honorarioPerc) || 0;
      honorariosVal = subtotalABC * (perc / 100);
    } else {
      const val = parseFloat(honorarioVal.replace(",", ".")) || 0;
      if (val > 0 && honorarioData) {
        const { fator } = getCorrectionFactor(honorarioData, dataFim, indiceCorrecao);
        honorariosVal = val * fator;
      }
    }

    const subtotalABCD = subtotalABC + honorariosVal;

    let art523MultaVal = 0;
    let art523HonVal = 0;
    if (art523Enabled) {
      const mp = parseFloat(art523MultaPerc) || 0;
      const hp = parseFloat(art523HonPerc) || 0;
      if (art523Tipo === "multa" || art523Tipo === "ambas") {
        art523MultaVal = subtotalABCD * (mp / 100);
      }
      if (art523Tipo === "honorario" || art523Tipo === "ambas") {
        art523HonVal = subtotalABCD * (hp / 100);
      }
    }
    const totalArt523 = art523MultaVal + art523HonVal;

    let custasVal = 0;
    const custasDetail: ParcelaCalc[] = custasProcessuais.map((c) => {
      const { fator, label } = getCorrectionFactor(c.data, dataFim, indiceCorrecao);
      const corrigido = c.valor * fator;
      custasVal += corrigido;
      return {
        data: c.data,
        descricao: c.descricao,
        valor: c.valor,
        indiceLabel: label,
        fator,
        valorAtualizacao: corrigido - c.valor,
        valorAtualizado: corrigido,
        jurosPerc: 0,
        valorJuros: 0,
        total: corrigido,
      };
    });

    const totalGeral = subtotalABCD + totalArt523 + custasVal;

    setCalcResult({
      parcelas: parcelasCalc,
      totalParcelas,
      multasPerc,
      multasMon,
      totalMultas,
      honorariosVal,
      art523MultaVal,
      art523HonVal,
      totalArt523,
      custasVal,
      totalGeral,
      dataCalculo: dataFim,
      processo,
      credor,
      devedor,
      custasDetail,
    });

    setActiveTab("demonstrativo");
  };

  const generateMemoria = () => {
    if (!calcResult) return "";
    const now = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    let text = "MEMÓRIA DE CÁLCULO\n";
    text += "=".repeat(60) + "\n\n";
    if (calcResult.processo) text += `Processo: ${calcResult.processo}\n`;
    if (calcResult.credor) text += `Credor: ${calcResult.credor}\n`;
    if (calcResult.devedor) text += `Devedor: ${calcResult.devedor}\n`;
    text += `Data do Cálculo: ${formatDateBR(calcResult.dataCalculo)}\n\n`;

    text += "1. VALORES PRINCIPAIS\n";
    text += "-".repeat(40) + "\n";
    calcResult.parcelas.forEach((p) => {
      text += `   ${formatDateBR(p.data)} - ${p.descricao}: ${formatCurrency(p.valor)} → ${formatCurrency(p.total)}\n`;
    });
    text += `   SUBTOTAL (A): ${formatCurrency(calcResult.totalParcelas)}\n\n`;

    if (calcResult.totalMultas > 0) {
      text += "2. MULTAS\n";
      text += `   Total Multas (B): ${formatCurrency(calcResult.totalMultas)}\n\n`;
    }
    if (calcResult.honorariosVal > 0) {
      text += "3. HONORÁRIOS\n";
      text += `   Honorários (C): ${formatCurrency(calcResult.honorariosVal)}\n\n`;
    }
    if (calcResult.totalArt523 > 0) {
      text += "4. ART. 523 CPC\n";
      text += `   Art. 523 (D): ${formatCurrency(calcResult.totalArt523)}\n\n`;
    }
    if (calcResult.custasVal > 0) {
      text += "5. CUSTAS\n";
      text += `   Custas (E): ${formatCurrency(calcResult.custasVal)}\n\n`;
    }

    text += "=".repeat(60) + "\n";
    text += `TOTAL GERAL: ${formatCurrency(calcResult.totalGeral)}\n\n`;
    text += `Brasília/DF, ${now}`;
    return text;
  };

  const handleEnviarEstudio = () => {
    const mem = generateMemoria();
    if (mem) navigate(`/studio?memoria=${encodeURIComponent(mem)}`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handlePrint = () => {
    window.print();
  };

  const SectionHeader = ({ title, sectionKey, badge }: { title: string; sectionKey: string; badge?: string }) => (
    <button
      type="button"
      data-testid={`section-toggle-${sectionKey}`}
      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg"
      onClick={() => toggleSection(sectionKey)}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
        {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
      </div>
      {expandedSections[sectionKey] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  );

  return (
    <DashboardLayout>
      <div className="flex items-center gap-3 mb-6">
        <Scale className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">JurisCalc</h1>
          <p className="text-sm text-muted-foreground">Calculadora Judicial - Modelo TJDFT</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="dados" data-testid="tab-dados">Dados do Cálculo</TabsTrigger>
          <TabsTrigger value="demonstrativo" data-testid="tab-demonstrativo">Demonstrativo do Cálculo</TabsTrigger>
          <TabsTrigger value="custas-links" data-testid="tab-custas-links">Custas e Taxas</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-4 mt-4">
          {/* 1. Identificação */}
          <Card>
            <SectionHeader title="1. Identificação" sectionKey="identificacao" badge="Opcional" />
            {expandedSections.identificacao && (
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="processo">Processo</Label>
                    <Input
                      id="processo"
                      data-testid="input-processo"
                      placeholder="Nº do processo"
                      value={processo}
                      onChange={(e) => setProcesso(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="credor">Credor</Label>
                    <Input
                      id="credor"
                      data-testid="input-credor"
                      placeholder="Nome do credor"
                      value={credor}
                      onChange={(e) => setCredor(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="devedor">Devedor</Label>
                    <Input
                      id="devedor"
                      data-testid="input-devedor"
                      placeholder="Nome do devedor"
                      value={devedor}
                      onChange={(e) => setDevedor(e.target.value)}
                    />
                  </div>
                </div>
                <div className="max-w-xs">
                  <Label htmlFor="data-final">Data final do cálculo (vazio = hoje)</Label>
                  <Input
                    id="data-final"
                    data-testid="input-data-final"
                    type="date"
                    value={dataFinalCalculo}
                    onChange={(e) => setDataFinalCalculo(e.target.value)}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* 2. Correção Monetária */}
          <Card>
            <SectionHeader title="2. Correção Monetária (Índice)" sectionKey="correcao" />
            {expandedSections.correcao && (
              <CardContent className="pt-0">
                <div className="max-w-xl">
                  <Label>Índice de correção monetária</Label>
                  <Select value={indiceCorrecao} onValueChange={(v) => { setIndiceCorrecao(v as IndiceCorrecao); setTipoJuros("legais"); }}>
                    <SelectTrigger data-testid="select-indice-correcao">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tjdft">Índices oficiais TJDFT (INPC até 31/08/2024, IPCA a partir de 01/09/2024)</SelectItem>
                      <SelectItem value="inpc">INPC (Durante todo o período)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            )}
          </Card>

          {/* 3. Juros */}
          <Card>
            <SectionHeader title="3. Juros" sectionKey="juros" />
            {expandedSections.juros && (
              <CardContent className="space-y-4 pt-0">
                <div className="max-w-xl">
                  <Label>Tipo de juros</Label>
                  <Select value={tipoJuros} onValueChange={(v) => setTipoJuros(v as TipoJuros)}>
                    <SelectTrigger data-testid="select-tipo-juros">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legais">{jurosLegaisLabel}</SelectItem>
                      <SelectItem value="fixo">Percentual fixo</SelectItem>
                      <SelectItem value="sem">Sem juros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoJuros === "fixo" && (
                  <div className="max-w-xs">
                    <Label htmlFor="juro-fixo">Taxa mensal (%)</Label>
                    <Input
                      id="juro-fixo"
                      data-testid="input-juro-fixo"
                      type="number"
                      step="0.01"
                      value={juroFixoPerc}
                      onChange={(e) => setJuroFixoPerc(e.target.value)}
                    />
                  </div>
                )}

                {tipoJuros !== "sem" && (
                  <div className="max-w-xl">
                    <Label>Incidência dos juros</Label>
                    <Select value={incidenciaJuros} onValueChange={(v) => setIncidenciaJuros(v as IncidenciaJuros)}>
                      <SelectTrigger data-testid="select-incidencia-juros">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="data_valores">A partir da data dos valores</SelectItem>
                        <SelectItem value="data_fixa">A partir de uma data fixa</SelectItem>
                        <SelectItem value="citacao">A partir da citação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {tipoJuros !== "sem" && incidenciaJuros === "data_fixa" && (
                  <div className="max-w-xs">
                    <Label htmlFor="data-fixa-juros">Data fixa para juros</Label>
                    <Input
                      id="data-fixa-juros"
                      data-testid="input-data-fixa-juros"
                      type="date"
                      value={dataFixaJuros}
                      onChange={(e) => setDataFixaJuros(e.target.value)}
                    />
                  </div>
                )}

                {tipoJuros !== "sem" && incidenciaJuros === "citacao" && (
                  <div className="max-w-xs">
                    <Label htmlFor="data-citacao">Data da citação</Label>
                    <Input
                      id="data-citacao"
                      data-testid="input-data-citacao"
                      type="date"
                      value={dataCitacao}
                      onChange={(e) => setDataCitacao(e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* 4. Valores (Parcelas) */}
          <Card>
            <SectionHeader title="4. Valores (Parcelas)" sectionKey="valores" badge={parcelas.length > 0 ? `${parcelas.length}` : undefined} />
            {expandedSections.valores && (
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <Label htmlFor="parcela-valor">Valor (R$)</Label>
                    <Input
                      id="parcela-valor"
                      data-testid="input-parcela-valor"
                      placeholder="0,00"
                      value={novaParcela.valor}
                      onChange={(e) => setNovaParcela({ ...novaParcela, valor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="parcela-data">Data do valor</Label>
                    <Input
                      id="parcela-data"
                      data-testid="input-parcela-data"
                      type="date"
                      value={novaParcela.data}
                      onChange={(e) => setNovaParcela({ ...novaParcela, data: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="parcela-desc">Descrição</Label>
                    <Input
                      id="parcela-desc"
                      data-testid="input-parcela-descricao"
                      placeholder="Ex: Salário Jan/2023"
                      value={novaParcela.descricao}
                      onChange={(e) => setNovaParcela({ ...novaParcela, descricao: e.target.value })}
                    />
                  </div>
                  <Button onClick={addParcela} data-testid="button-add-parcela">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowRecorrente(!showRecorrente)} data-testid="button-toggle-recorrente">
                    <Plus className="w-3 h-3 mr-1" /> Parcelas recorrentes
                  </Button>
                </div>

                {showRecorrente && (
                  <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                    <p className="text-sm font-medium">Adicionar parcelas mensais recorrentes</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <Label>Valor mensal (R$)</Label>
                        <Input
                          data-testid="input-recorrente-valor"
                          placeholder="0,00"
                          value={recorrente.valor}
                          onChange={(e) => setRecorrente({ ...recorrente, valor: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Data início</Label>
                        <Input
                          data-testid="input-recorrente-data"
                          type="date"
                          value={recorrente.dataInicio}
                          onChange={(e) => setRecorrente({ ...recorrente, dataInicio: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Nº de meses</Label>
                        <Input
                          data-testid="input-recorrente-meses"
                          type="number"
                          min="1"
                          value={recorrente.meses}
                          onChange={(e) => setRecorrente({ ...recorrente, meses: e.target.value })}
                        />
                      </div>
                      <Button onClick={addRecorrentes} data-testid="button-add-recorrentes">
                        Gerar parcelas
                      </Button>
                    </div>
                  </div>
                )}

                {parcelas.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-left">
                          <th className="p-2 font-medium">Data</th>
                          <th className="p-2 font-medium">Descrição</th>
                          <th className="p-2 font-medium text-right">Valor</th>
                          <th className="p-2 font-medium text-center w-20">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map((p, i) => (
                          <tr key={p.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"} data-testid={`row-parcela-${p.id}`}>
                            <td className="p-2">{formatDateBR(p.data)}</td>
                            <td className="p-2">{p.descricao}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(p.valor)}</td>
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParcela(p.id)} data-testid={`button-remove-parcela-${p.id}`}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted font-semibold">
                          <td className="p-2" colSpan={2}>Total</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(parcelas.reduce((s, p) => s + p.valor, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* 5. Multas */}
          <Card>
            <SectionHeader title="5. Multas" sectionKey="multas" badge={multas.length > 0 ? `${multas.length}` : undefined} />
            {expandedSections.multas && (
              <CardContent className="space-y-4 pt-0">
                {multas.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`row-multa-${m.id}`}>
                    <div>
                      <span className="text-sm font-medium">{m.descricao}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({m.tipo === "percentual" ? `${m.valor}%` : formatCurrency(m.valor)})
                        {m.data && ` - ${formatDateBR(m.data)}`}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMulta(m.id)} data-testid={`button-remove-multa-${m.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}

                {showAddMulta ? (
                  <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={novaMulta.tipo} onValueChange={(v) => setNovaMulta({ ...novaMulta, tipo: v as any })}>
                          <SelectTrigger data-testid="select-multa-tipo"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentual">Percentual (%)</SelectItem>
                            <SelectItem value="monetaria">Monetária (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{novaMulta.tipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}</Label>
                        <Input
                          data-testid="input-multa-valor"
                          placeholder={novaMulta.tipo === "percentual" ? "10" : "0,00"}
                          value={novaMulta.valor}
                          onChange={(e) => setNovaMulta({ ...novaMulta, valor: e.target.value })}
                        />
                      </div>
                    </div>
                    {novaMulta.tipo === "monetaria" && (
                      <div className="max-w-xs">
                        <Label>Data (para correção)</Label>
                        <Input
                          data-testid="input-multa-data"
                          type="date"
                          value={novaMulta.data}
                          onChange={(e) => setNovaMulta({ ...novaMulta, data: e.target.value })}
                        />
                      </div>
                    )}
                    <div>
                      <Label>Descrição</Label>
                      <Input
                        data-testid="input-multa-descricao"
                        placeholder="Descrição da multa"
                        value={novaMulta.descricao}
                        onChange={(e) => setNovaMulta({ ...novaMulta, descricao: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addMulta} data-testid="button-confirm-multa">Adicionar</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAddMulta(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowAddMulta(true)} data-testid="button-add-multa">
                    <Plus className="w-3 h-3 mr-1" /> Adicionar multa
                  </Button>
                )}
              </CardContent>
            )}
          </Card>

          {/* 6. Honorários */}
          <Card>
            <SectionHeader title="6. Honorários" sectionKey="honorarios" />
            {expandedSections.honorarios && (
              <CardContent className="space-y-4 pt-0">
                <div className="max-w-sm">
                  <Label>Tipo de honorário</Label>
                  <Select value={honorarioTipo} onValueChange={(v) => setHonorarioTipo(v as any)}>
                    <SelectTrigger data-testid="select-honorario-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">Percentual sobre o débito</SelectItem>
                      <SelectItem value="monetario">Valor monetário fixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {honorarioTipo === "percentual" ? (
                  <div className="max-w-xs">
                    <Label htmlFor="hon-perc">Percentual (%)</Label>
                    <Input
                      id="hon-perc"
                      data-testid="input-honorario-percentual"
                      type="number"
                      step="0.1"
                      placeholder="20"
                      value={honorarioPerc}
                      onChange={(e) => setHonorarioPerc(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input
                        data-testid="input-honorario-valor"
                        placeholder="0,00"
                        value={honorarioVal}
                        onChange={(e) => setHonorarioVal(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Data (para correção)</Label>
                      <Input
                        data-testid="input-honorario-data"
                        type="date"
                        value={honorarioData}
                        onChange={(e) => setHonorarioData(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* 7. Art. 523 CPC */}
          <Card>
            <SectionHeader title="7. Consectários da Mora (art. 523, §1º do CPC)" sectionKey="art523" />
            {expandedSections.art523 && (
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="art523-enabled"
                    data-testid="checkbox-art523"
                    checked={art523Enabled}
                    onChange={(e) => setArt523Enabled(e.target.checked)}
                    className="rounded border-border"
                  />
                  <Label htmlFor="art523-enabled" className="cursor-pointer">Incluir consectários do art. 523 CPC</Label>
                </div>

                {art523Enabled && (
                  <>
                    <div className="max-w-sm">
                      <Label>Tipo</Label>
                      <Select value={art523Tipo} onValueChange={(v) => setArt523Tipo(v as any)}>
                        <SelectTrigger data-testid="select-art523-tipo"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multa">Multa art. 523 CPC</SelectItem>
                          <SelectItem value="honorario">Honorário de cumprimento de sentença art. 523 CPC</SelectItem>
                          <SelectItem value="ambas">Ambas (multa e honorário art. 523 CPC)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(art523Tipo === "multa" || art523Tipo === "ambas") && (
                        <div>
                          <Label>Multa (%)</Label>
                          <Input
                            data-testid="input-art523-multa"
                            type="number"
                            step="0.1"
                            value={art523MultaPerc}
                            onChange={(e) => setArt523MultaPerc(e.target.value)}
                          />
                        </div>
                      )}
                      {(art523Tipo === "honorario" || art523Tipo === "ambas") && (
                        <div>
                          <Label>Honorário (%)</Label>
                          <Input
                            data-testid="input-art523-honorario"
                            type="number"
                            step="0.1"
                            value={art523HonPerc}
                            onChange={(e) => setArt523HonPerc(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            )}
          </Card>

          {/* 8. Custas */}
          <Card>
            <SectionHeader title="8. Custas e Despesas Processuais" sectionKey="custas" badge={custasProcessuais.length > 0 ? `${custasProcessuais.length}` : undefined} />
            {expandedSections.custas && (
              <CardContent className="space-y-4 pt-0">
                {custasProcessuais.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`row-custa-${c.id}`}>
                    <div>
                      <span className="text-sm font-medium">{c.descricao}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatCurrency(c.valor)} - {formatDateBR(c.data)}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCusta(c.id)} data-testid={`button-remove-custa-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input
                      data-testid="input-custa-valor"
                      placeholder="0,00"
                      value={novaCusta.valor}
                      onChange={(e) => setNovaCusta({ ...novaCusta, valor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input
                      data-testid="input-custa-data"
                      type="date"
                      value={novaCusta.data}
                      onChange={(e) => setNovaCusta({ ...novaCusta, data: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input
                      data-testid="input-custa-descricao"
                      placeholder="Ex: Custas iniciais"
                      value={novaCusta.descricao}
                      onChange={(e) => setNovaCusta({ ...novaCusta, descricao: e.target.value })}
                    />
                  </div>
                  <Button variant="outline" onClick={addCusta} data-testid="button-add-custa">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <div className="flex justify-center pt-4">
            <Button
              size="lg"
              className="px-12"
              onClick={handleCalculate}
              disabled={parcelas.length === 0}
              data-testid="button-calcular"
            >
              <Calculator className="w-5 h-5 mr-2" /> Calcular
            </Button>
          </div>
        </TabsContent>

        {/* Demonstrativo Tab */}
        <TabsContent value="demonstrativo" className="mt-4">
          {!calcResult ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg text-muted-foreground" data-testid="text-no-calc">Preencha os dados e clique em Calcular</p>
                <Button variant="link" className="mt-2" onClick={() => setActiveTab("dados")} data-testid="button-go-dados">
                  Ir para Dados do Cálculo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6 print:space-y-4">
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(generateMemoria())} data-testid="button-copiar">
                  <Copy className="w-4 h-4 mr-1" /> Copiar
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-imprimir">
                  <Printer className="w-4 h-4 mr-1" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={handleEnviarEstudio} data-testid="button-enviar-estudio">
                  <Send className="w-4 h-4 mr-1" /> Enviar para Estúdio
                </Button>
                <Button variant="outline" size="sm" onClick={() => { const m = generateMemoria(); const blob = new Blob([m], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "memoria_calculo.txt"; a.click(); }} data-testid="button-gerar-memoria">
                  <FileText className="w-4 h-4 mr-1" /> Gerar Memória de Cálculo
                </Button>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-center text-lg">DEMONSTRATIVO DE CÁLCULO</CardTitle>
                  {(calcResult.processo || calcResult.credor || calcResult.devedor) && (
                    <div className="text-center text-sm text-muted-foreground space-y-0.5 mt-2">
                      {calcResult.processo && <p>Processo: {calcResult.processo}</p>}
                      {calcResult.credor && <p>Credor: {calcResult.credor}</p>}
                      {calcResult.devedor && <p>Devedor: {calcResult.devedor}</p>}
                      <p>Data do Cálculo: {formatDateBR(calcResult.dataCalculo)}</p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* A - Valores Principais */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">A) Demonstrativo dos Valores Principais</h3>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted text-left">
                            <th className="p-2 font-medium">Data</th>
                            <th className="p-2 font-medium">Descrição</th>
                            <th className="p-2 font-medium text-right">Valor</th>
                            <th className="p-2 font-medium text-center">Índice</th>
                            <th className="p-2 font-medium text-right">Fator</th>
                            <th className="p-2 font-medium text-right">Atualização</th>
                            <th className="p-2 font-medium text-right">Val. Atualizado</th>
                            <th className="p-2 font-medium text-right">Juros %</th>
                            <th className="p-2 font-medium text-right">Val. Juros</th>
                            <th className="p-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calcResult.parcelas.map((p, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"} data-testid={`row-demo-parcela-${i}`}>
                              <td className="p-2 whitespace-nowrap">{formatDateBR(p.data)}</td>
                              <td className="p-2">{p.descricao}</td>
                              <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(p.valor)}</td>
                              <td className="p-2 text-center">{p.indiceLabel}</td>
                              <td className="p-2 text-right font-mono">{p.fator.toFixed(6)}</td>
                              <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(p.valorAtualizacao)}</td>
                              <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(p.valorAtualizado)}</td>
                              <td className="p-2 text-right font-mono">{p.jurosPerc.toFixed(2)}%</td>
                              <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(p.valorJuros)}</td>
                              <td className="p-2 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(p.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted font-semibold text-sm">
                            <td className="p-2" colSpan={9}>Subtotal (A) - Principal + Juros</td>
                            <td className="p-2 text-right font-mono" data-testid="text-total-parcelas">{formatCurrency(calcResult.totalParcelas)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* B - Multas */}
                  {calcResult.totalMultas > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">B) Multas</h3>
                      <div className="border rounded-lg p-4 space-y-2">
                        {calcResult.multasPerc > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Multas percentuais</span>
                            <span className="font-mono font-semibold">{formatCurrency(calcResult.multasPerc)}</span>
                          </div>
                        )}
                        {calcResult.multasMon > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Multas monetárias (corrigidas)</span>
                            <span className="font-mono font-semibold">{formatCurrency(calcResult.multasMon)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-bold border-t pt-2">
                          <span>Subtotal (B) - Multas</span>
                          <span className="font-mono" data-testid="text-total-multas">{formatCurrency(calcResult.totalMultas)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* C - Honorários */}
                  {calcResult.honorariosVal > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">C) Honorários</h3>
                      <div className="border rounded-lg p-4">
                        <div className="flex justify-between text-sm font-bold">
                          <span>Subtotal (C) - Honorários</span>
                          <span className="font-mono" data-testid="text-total-honorarios">{formatCurrency(calcResult.honorariosVal)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* D - Art. 523 */}
                  {calcResult.totalArt523 > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">D) Art. 523 CPC - Consectários da Mora</h3>
                      <div className="border rounded-lg p-4 space-y-2">
                        {calcResult.art523MultaVal > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Multa art. 523 CPC</span>
                            <span className="font-mono font-semibold">{formatCurrency(calcResult.art523MultaVal)}</span>
                          </div>
                        )}
                        {calcResult.art523HonVal > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Honorário art. 523 CPC</span>
                            <span className="font-mono font-semibold">{formatCurrency(calcResult.art523HonVal)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-bold border-t pt-2">
                          <span>Subtotal (D) - Art. 523 CPC</span>
                          <span className="font-mono" data-testid="text-total-art523">{formatCurrency(calcResult.totalArt523)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* E - Custas */}
                  {calcResult.custasVal > 0 && (
                    <div>
                      <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">E) Custas e Despesas Processuais</h3>
                      <div className="border rounded-lg overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted text-left">
                              <th className="p-2 font-medium">Data</th>
                              <th className="p-2 font-medium">Descrição</th>
                              <th className="p-2 font-medium text-right">Valor</th>
                              <th className="p-2 font-medium text-center">Índice</th>
                              <th className="p-2 font-medium text-right">Fator</th>
                              <th className="p-2 font-medium text-right">Val. Corrigido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {calcResult.custasDetail.map((c, i) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                <td className="p-2 whitespace-nowrap">{formatDateBR(c.data)}</td>
                                <td className="p-2">{c.descricao}</td>
                                <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(c.valor)}</td>
                                <td className="p-2 text-center">{c.indiceLabel}</td>
                                <td className="p-2 text-right font-mono">{c.fator.toFixed(6)}</td>
                                <td className="p-2 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(c.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted font-semibold text-sm">
                              <td className="p-2" colSpan={5}>Subtotal (E) - Custas</td>
                              <td className="p-2 text-right font-mono" data-testid="text-total-custas">{formatCurrency(calcResult.custasVal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Agrupamento Final */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide">Agrupamento dos Valores Apurados</h3>
                    <div className="border-2 border-primary/30 rounded-lg p-4 space-y-2 bg-primary/5">
                      <div className="flex justify-between text-sm">
                        <span>(A) Principal + Juros</span>
                        <span className="font-mono font-semibold">{formatCurrency(calcResult.totalParcelas)}</span>
                      </div>
                      {calcResult.totalMultas > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>(B) Multas</span>
                          <span className="font-mono font-semibold">{formatCurrency(calcResult.totalMultas)}</span>
                        </div>
                      )}
                      {calcResult.honorariosVal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>(C) Honorários</span>
                          <span className="font-mono font-semibold">{formatCurrency(calcResult.honorariosVal)}</span>
                        </div>
                      )}
                      {calcResult.totalArt523 > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>(D) Art. 523 CPC</span>
                          <span className="font-mono font-semibold">{formatCurrency(calcResult.totalArt523)}</span>
                        </div>
                      )}
                      {calcResult.custasVal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>(E) Custas e Despesas</span>
                          <span className="font-mono font-semibold">{formatCurrency(calcResult.custasVal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold border-t-2 border-primary/30 pt-3 mt-3">
                        <span>TOTAL GERAL</span>
                        <span className="font-mono text-primary" data-testid="text-total-geral">{formatCurrency(calcResult.totalGeral)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Custas e Taxas Tab */}
        <TabsContent value="custas-links" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Links Úteis - Custas e Taxas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {EXTERNAL_LINKS.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors group"
                    data-testid={`link-external-${link.id}`}
                  >
                    <div>
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">{link.label}</p>
                      <p className="text-xs text-muted-foreground">{link.description}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
