import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import { users, tenants } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      tenantId: number;
      email: string;
      name: string;
      role: string;
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      tokenUser?: {
        id: number;
        tenantId: number;
        email: string;
        name: string;
        role: string;
      };
    }
  }
}

async function ensureAuthTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      user_data JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function createAuthToken(userData: { id: number; tenantId: number; email: string; name: string; role: string }): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_tokens (token, user_id, tenant_id, user_data, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [token, userData.id, userData.tenantId, JSON.stringify(userData), expiresAt]
  );
  return token;
}

async function getAuthToken(token: string): Promise<{ id: number; tenantId: number; email: string; name: string; role: string } | null> {
  const result = await pool.query(
    `SELECT user_data FROM auth_tokens WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].user_data;
}

async function deleteAuthToken(token: string) {
  await pool.query(`DELETE FROM auth_tokens WHERE token = $1`, [token]);
}

async function deleteUserTokens(userId: number) {
  await pool.query(`DELETE FROM auth_tokens WHERE user_id = $1`, [userId]);
}

function isDevAutoAuthEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTO_LOGIN === "true";
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);

  ensureAuthTokensTable().catch(err => console.error("Error creating auth_tokens table:", err));

  app.use(
    session({
      store: new PgStore({
        pool: pool,
        createTableIfMissing: true,
      }),
      secret: "lexai-session-secret-2024",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    })
  );

  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const userData = await getAuthToken(token);
        if (userData) {
          req.tokenUser = userData;
        }
      } catch (err) {
        console.error("Token lookup error:", err);
      }
    }
    next();
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), eq(users.isActive, true)));

      if (!user) {
        return res.status(401).json({ message: "Email ou senha inválidos" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Email ou senha inválidos" });
      }

      const sessionUser = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      req.session.user = sessionUser;

      const token = await createAuthToken(sessionUser);

      const { password: _, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      await deleteAuthToken(token).catch(() => {});
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao fazer logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    const user = req.tokenUser || req.session.user;
    if (!user) {
      if (isDevAutoAuthEnabled()) {
        const devUser = {
          id: 5,
          tenantId: 1,
          email: "contato@marqueseserra.adv.br",
          name: "Dr. Ronald Serra",
          role: "socio",
        };
        req.session.user = devUser;
        return res.json(devUser);
      }
      return res.status(401).json({ message: "Não autenticado" });
    }
    res.json(user);
  });

  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    try {
      const existingUsers = await db.select().from(users).limit(1);
      if (existingUsers.length > 0) {
        return res.status(400).json({ message: "Sistema já possui usuários cadastrados" });
      }

      let [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.name, "Marques & Serra Sociedade de Advogados"));

      if (!tenant) {
        [tenant] = await db
          .insert(tenants)
          .values({
            name: "Marques & Serra Sociedade de Advogados",
            slug: "marques-serra",
            plan: "enterprise",
            isActive: true,
          })
          .returning();
      }

      const hashedPassword = await bcrypt.hash("LexAI@2024", 10);

      const [newUser] = await db
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: "ronald@marqueseserra.adv.br",
          password: hashedPassword,
          name: "Dr. Ronald Serra",
          role: "socio",
          oabNumber: "DF-23947",
          isActive: true,
        })
        .returning();

      const { password: _, ...userWithoutPassword } = newUser;
      res.json({
        message: "Usuário administrador criado com sucesso",
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error("Setup error:", error);
      res.status(500).json({ message: "Erro ao configurar sistema" });
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = req.tokenUser || req.session.user;
  if (!user) {
    if (isDevAutoAuthEnabled()) {
      req.session.user = {
        id: 5,
        tenantId: 1,
        email: "contato@marqueseserra.adv.br",
        name: "Dr. Ronald Serra",
        role: "socio",
      };
      return next();
    }
    return res.status(401).json({ message: "Não autenticado" });
  }
  if (!req.session.user && req.tokenUser) {
    req.session.user = req.tokenUser;
  }
  next();
}
