import { db } from "./db";
import { tenants, users, clients, contracts, cases, caseMovements, deadlines, whatsappConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDemoData() {
  console.log("Checking for existing demo data...");

  const existingTenant = await db.select().from(tenants).where(eq(tenants.slug, "demo-escritorio"));
  
  if (existingTenant.length > 0) {
    console.log("Demo data already exists, ensuring admin user exists...");
    await ensureAdminUser(existingTenant[0].id);
    return;
  }

  console.log("Seeding demo data...");

  // Create demo tenant
  const [tenant] = await db.insert(tenants).values({
    name: "Marques & Serra Sociedade de Advogados",
    slug: "demo-escritorio",
    plan: "enterprise",
    isActive: true,
  }).returning();

  console.log("Created tenant:", tenant.name);

  // Create demo users
  const hashedPassword = bcrypt.hashSync("lexai2024", 10);

  const [socio] = await db.insert(users).values({
    tenantId: tenant.id,
    email: "roberta@barrosesilva.adv.br",
    password: hashedPassword,
    name: "Dra. Roberta Silva",
    role: "socio",
    oabNumber: "MG-123456",
    isActive: true,
  }).returning();

  await db.insert(users).values([
    {
      tenantId: tenant.id,
      email: "carlos@barrosesilva.adv.br",
      password: hashedPassword,
      name: "Dr. Carlos Barros",
      role: "socio",
      oabNumber: "MG-654321",
      isActive: true,
    },
    {
      tenantId: tenant.id,
      email: "ana@barrosesilva.adv.br",
      password: hashedPassword,
      name: "Dra. Ana Mendes",
      role: "advogado",
      oabNumber: "MG-111222",
      isActive: true,
    },
    {
      tenantId: tenant.id,
      email: "pedro@barrosesilva.adv.br",
      password: hashedPassword,
      name: "Pedro Santos",
      role: "estagiario",
      isActive: true,
    },
  ]);

  console.log("Created demo users");

  // Create demo clients
  const [clientePJ] = await db.insert(clients).values({
    tenantId: tenant.id,
    type: "PJ",
    name: "Indústrias Horizonte Ltda",
    document: "12.345.678/0001-90",
    email: "juridico@horizonteltda.com.br",
    phone: "(31) 3333-4444",
    address: "Av. do Contorno, 1500, Funcionários, Belo Horizonte - MG",
    status: "ativo",
    createdBy: socio.id,
  }).returning();

  const [clientePJ2] = await db.insert(clients).values({
    tenantId: tenant.id,
    type: "PJ",
    name: "Comércio Varejista Central S.A.",
    document: "98.765.432/0001-10",
    email: "legal@cvcentral.com.br",
    phone: "(31) 3222-1111",
    address: "Rua dos Guajajaras, 800, Centro, Belo Horizonte - MG",
    status: "ativo",
    createdBy: socio.id,
  }).returning();

  const [clientePF] = await db.insert(clients).values({
    tenantId: tenant.id,
    type: "PF",
    name: "Roberto Silva",
    document: "123.456.789-00",
    email: "roberto.silva@email.com",
    phone: "(31) 99999-8888",
    status: "ativo",
    createdBy: socio.id,
  }).returning();

  console.log("Created demo clients");

  // Create demo contracts
  const [contrato1] = await db.insert(contracts).values({
    tenantId: tenant.id,
    clientId: clientePJ.id,
    type: "mensal",
    description: "Contrato de Assessoria Jurídica Contínua",
    monthlyValue: "12500.00",
    adjustmentIndex: "IGPM",
    nextAdjustmentDate: new Date("2027-01-01"),
    startDate: new Date("2023-01-01"),
    status: "ativo",
    createdBy: socio.id,
  }).returning();

  const [contrato2] = await db.insert(contracts).values({
    tenantId: tenant.id,
    clientId: clientePJ2.id,
    type: "hibrido",
    description: "Contrato Mensal + Êxito em Contencioso",
    monthlyValue: "8000.00",
    successFeePercent: "10.00",
    adjustmentIndex: "IPCA",
    nextAdjustmentDate: new Date("2026-06-01"),
    startDate: new Date("2024-01-01"),
    status: "ativo",
    createdBy: socio.id,
  }).returning();

  await db.insert(contracts).values({
    tenantId: tenant.id,
    clientId: clientePF.id,
    type: "exito",
    description: "Contrato de Êxito - Reclamação Trabalhista",
    successFeePercent: "20.00",
    startDate: new Date("2022-06-01"),
    endDate: new Date("2024-12-01"),
    status: "finalizado",
    createdBy: socio.id,
  });

  console.log("Created demo contracts");

  // Create demo cases
  const [caso1] = await db.insert(cases).values({
    tenantId: tenant.id,
    clientId: clientePJ.id,
    contractId: contrato1.id,
    caseNumber: "5001234-56.2025.8.13.0024",
    title: "Ação de Cobrança Indevida c/c Danos Morais",
    caseType: "civil",
    court: "TJMG - 12ª Vara Cível da Comarca de Belo Horizonte",
    caseClass: "Procedimento Comum Cível",
    subject: "Indenização por Dano Material",
    status: "ativo",
    riskLevel: "medio",
    estimatedValue: "250000.00",
    tags: ["Urgente", "Liminar"],
    responsibleUserId: socio.id,
    createdBy: socio.id,
  }).returning();

  const [caso2] = await db.insert(cases).values({
    tenantId: tenant.id,
    clientId: clientePF.id,
    caseNumber: "1009876-43.2024.5.03.0001",
    title: "Reclamação Trabalhista - Horas Extras",
    caseType: "trabalhista",
    court: "TRT3 - 1ª Vara do Trabalho de Belo Horizonte",
    caseClass: "Reclamação Trabalhista",
    subject: "Horas Extras e Adicional Noturno",
    status: "ativo",
    riskLevel: "baixo",
    estimatedValue: "85000.00",
    tags: ["Audiência Marcada"],
    responsibleUserId: socio.id,
    createdBy: socio.id,
  }).returning();

  const [caso3] = await db.insert(cases).values({
    tenantId: tenant.id,
    clientId: clientePJ2.id,
    contractId: contrato2.id,
    caseNumber: "0023456-78.2023.4.01.3800",
    title: "Execução Fiscal - ICMS",
    caseType: "tributario",
    court: "TRF1 - 5ª Vara Federal de Belo Horizonte",
    caseClass: "Execução Fiscal",
    subject: "Dívida Ativa - ICMS",
    status: "suspenso",
    riskLevel: "alto",
    estimatedValue: "1500000.00",
    tags: ["Complexo", "Tributário"],
    responsibleUserId: socio.id,
    createdBy: socio.id,
  }).returning();

  console.log("Created demo cases");

  // Create demo movements
  await db.insert(caseMovements).values([
    {
      caseId: caso1.id,
      date: new Date("2025-12-28"),
      type: "Intimação",
      description: "Expedição de intimação para manifestação sobre laudo pericial",
      source: "DJe",
      requiresAction: true,
      actionDeadline: new Date("2026-01-15"),
    },
    {
      caseId: caso1.id,
      date: new Date("2025-12-15"),
      type: "Juntada",
      description: "Juntada de Petição de Quesitos",
      source: "PJe",
      requiresAction: false,
    },
    {
      caseId: caso1.id,
      date: new Date("2025-12-01"),
      type: "Decisão",
      description: "Despacho ordenando perícia contábil",
      source: "Magistrado",
      requiresAction: false,
    },
    {
      caseId: caso2.id,
      date: new Date("2025-12-20"),
      type: "Intimação",
      description: "Intimação para audiência de instrução e julgamento",
      source: "DJe",
      requiresAction: true,
      actionDeadline: new Date("2026-01-10"),
    },
  ]);

  console.log("Created demo movements");

  // Create demo deadlines
  await db.insert(deadlines).values([
    {
      tenantId: tenant.id,
      caseId: caso1.id,
      title: "Manifestação sobre laudo pericial",
      description: "Prazo para manifestação sobre laudo pericial contábil",
      dueDate: new Date("2026-01-15"),
      type: "prazo",
      priority: "urgente",
      status: "pendente",
      responsibleUserId: socio.id,
      createdBy: socio.id,
    },
    {
      tenantId: tenant.id,
      caseId: caso2.id,
      title: "Audiência de Instrução e Julgamento",
      description: "Audiência trabalhista - preparar testemunhas e documentos",
      dueDate: new Date("2026-01-10"),
      type: "audiencia",
      priority: "alta",
      status: "pendente",
      responsibleUserId: socio.id,
      createdBy: socio.id,
    },
    {
      tenantId: tenant.id,
      caseId: caso3.id,
      title: "Recurso de Apelação",
      description: "Prazo para interposição de recurso",
      dueDate: new Date("2026-01-20"),
      type: "prazo",
      priority: "normal",
      status: "pendente",
      responsibleUserId: socio.id,
      createdBy: socio.id,
    },
  ]);

  console.log("Created demo deadlines");
  console.log("Demo data seeding completed!");
  console.log("");
  console.log("⚠️  AVISO: Estes são dados de DEMONSTRAÇÃO.");
  console.log("    NÃO representam casos ou clientes reais.");
  console.log("    Não devem ser confundidos com informações jurídicas verdadeiras.");

  await ensureAdminUser(tenant.id);
}

async function ensureAdminUser(tenantId: number) {
  const adminEmail = "contato@marqueseserra.adv.br";
  const existing = await db.select().from(users).where(eq(users.email, adminEmail));
  if (existing.length > 0) {
    console.log("Admin user already exists.");
  } else {
    const hashedPassword = await bcrypt.hash("LexAI@2024", 10);
    await db.insert(users).values({
      tenantId,
      email: adminEmail,
      password: hashedPassword,
      name: "Dr. Ronald Serra",
      role: "socio",
      oabNumber: "DF-23947",
      isActive: true,
    });
    console.log("Admin user created: " + adminEmail);
  }
  await ensureEstagiarioUsers(tenantId);
}

async function ensureEstagiarioUsers(tenantId: number) {
  const estagiarios = [
    { email: "jobs@marqueseserra.adv.br", name: "Jobs", phone: "5561993255095" },
    { email: "yasmin@marqueseserra.adv.br", name: "Yasmin", phone: "5561982222110" },
  ];
  const hashedPassword = await bcrypt.hash("mes2026", 10);
  for (const u of estagiarios) {
    const existing = await db.select().from(users).where(eq(users.email, u.email));
    if (existing.length === 0) {
      await db.insert(users).values({
        tenantId,
        email: u.email,
        password: hashedPassword,
        name: u.name,
        role: "estagiario",
        phone: u.phone,
        isActive: true,
      });
      console.log("Estagiário user created: " + u.email);
    }
  }
  await ensureWhatsappContacts(tenantId);
}

async function ensureWhatsappContacts(tenantId: number) {
  const contacts = [
    { phoneNumber: "5561983717842", contactName: "Ronald Serra" },
    { phoneNumber: "5561984919915", contactName: "Pedro Marques" },
    { phoneNumber: "5561993255095", contactName: "Jobs" },
    { phoneNumber: "5561982222110", contactName: "Yasmin" },
  ];
  for (const c of contacts) {
    const existing = await db.select().from(whatsappConfig)
      .where(eq(whatsappConfig.phoneNumber, c.phoneNumber));
    if (existing.length === 0) {
      await db.insert(whatsappConfig).values({
        tenantId,
        phoneNumber: c.phoneNumber,
        contactName: c.contactName,
        isActive: true,
      });
      console.log("WhatsApp contact ensured: " + c.contactName);
    }
  }
}
