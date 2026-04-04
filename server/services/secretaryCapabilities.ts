export type SecretaryActionName =
  | "cadastrar_devedor"
  | "cadastrar_cliente"
  | "atualizar_cliente"
  | "atualizar_devedor"
  | "vincular_processo"
  | "cadastrar_processo"
  | "atualizar_processo"
  | "cadastrar_contrato"
  | "cadastrar_prazo"
  | "agendar_compromisso"
  | "gerar_relatorio_cliente"
  | "relatorio_devedor"
  | "listar_documentos_devedor"
  | "arquivar_documento"
  | "enviar_documento_sistema"
  | "gerar_contrato"
  | "gerar_peca_estudio"
  | "gerar_relatorio_executivo";

export type SecretaryQueryName =
  | "relatorio_cliente"
  | "lista_clientes"
  | "lista_devedores"
  | "resumo_financeiro"
  | "prazos_pendentes"
  | "processos_status"
  | "agenda"
  | "contratos"
  | "negociacoes"
  | "documentos"
  | "acordos_devedores"
  | "reunioes"
  | "prospeccao";

type SecretaryActionCapability = {
  name: SecretaryActionName;
  description: string;
  requiresSocio: boolean;
};

type SecretaryQueryCapability = {
  name: SecretaryQueryName;
  description: string;
  requiresSocio: boolean;
};

export const secretaryActionCapabilities: SecretaryActionCapability[] = [
  { name: "cadastrar_devedor", description: "Cadastrar novo devedor", requiresSocio: true },
  { name: "cadastrar_cliente", description: "Cadastrar novo cliente", requiresSocio: true },
  { name: "atualizar_cliente", description: "Atualizar dados de cliente existente", requiresSocio: true },
  { name: "atualizar_devedor", description: "Atualizar dados de devedor existente", requiresSocio: true },
  { name: "vincular_processo", description: "Vincular processo a devedor", requiresSocio: true },
  { name: "cadastrar_processo", description: "Cadastrar processo completo para cliente/devedor", requiresSocio: true },
  { name: "atualizar_processo", description: "Atualizar status, tribunal, assunto ou titulo de processo existente", requiresSocio: true },
  { name: "cadastrar_contrato", description: "Criar contrato operacional no cadastro do cliente", requiresSocio: true },
  { name: "cadastrar_prazo", description: "Registrar prazo manual vinculado ou nao a processo", requiresSocio: true },
  { name: "agendar_compromisso", description: "Criar compromisso, reuniao ou audiencia na agenda", requiresSocio: true },
  { name: "gerar_relatorio_cliente", description: "Gerar relatorio completo de um cliente", requiresSocio: false },
  { name: "relatorio_devedor", description: "Gerar relatorio detalhado dos processos de um devedor", requiresSocio: true },
  { name: "listar_documentos_devedor", description: "Listar documentos anexados a um devedor", requiresSocio: true },
  { name: "arquivar_documento", description: "Arquivar documento recebido", requiresSocio: true },
  { name: "enviar_documento_sistema", description: "Enviar documento ja arquivado no sistema para um contato", requiresSocio: true },
  { name: "gerar_contrato", description: "Gerar contrato, acordo ou termo de renegociacao", requiresSocio: true },
  { name: "gerar_peca_estudio", description: "Gerar qualquer peca juridica pelo Studio", requiresSocio: true },
  { name: "gerar_relatorio_executivo", description: "Gerar relatorio executivo completo do escritorio", requiresSocio: true },
];

export const secretaryQueryCapabilities: SecretaryQueryCapability[] = [
  { name: "relatorio_cliente", description: "Dados de um cliente especifico", requiresSocio: false },
  { name: "lista_clientes", description: "Listagem de todos os clientes", requiresSocio: true },
  { name: "lista_devedores", description: "Listagem de todos os devedores", requiresSocio: true },
  { name: "resumo_financeiro", description: "Faturas, recebimentos e valores", requiresSocio: false },
  { name: "prazos_pendentes", description: "Prazos e deadlines pendentes", requiresSocio: false },
  { name: "processos_status", description: "Processos e andamento", requiresSocio: false },
  { name: "agenda", description: "Compromissos e agenda", requiresSocio: false },
  { name: "contratos", description: "Contratos vigentes", requiresSocio: false },
  { name: "negociacoes", description: "Negociacoes de acordo", requiresSocio: true },
  { name: "documentos", description: "Documentos de cliente ou devedor", requiresSocio: false },
  { name: "acordos_devedores", description: "Acordos de devedores", requiresSocio: true },
  { name: "reunioes", description: "Reunioes registradas no sistema", requiresSocio: true },
  { name: "prospeccao", description: "Leads, rede e planos de prospeccao", requiresSocio: true },
];

export function getSecretaryActionNames(): SecretaryActionName[] {
  return secretaryActionCapabilities.map((capability) => capability.name);
}

export function getSecretaryQueryNames(): SecretaryQueryName[] {
  return secretaryQueryCapabilities.map((capability) => capability.name);
}

export function isSocioRequiredAction(action: string): boolean {
  return secretaryActionCapabilities.some((capability) => capability.name === action && capability.requiresSocio);
}

export function describeSecretaryActionCapabilities(): string {
  return secretaryActionCapabilities
    .map((capability) => `   - ${capability.name}: ${capability.description}`)
    .join("\n");
}

export function describeSecretaryQueryCapabilities(): string {
  return secretaryQueryCapabilities
    .map((capability) => `${capability.name} (${capability.description})`)
    .join(", ");
}
