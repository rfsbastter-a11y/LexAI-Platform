import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDemoData } from "./seed";
import { setupAuth } from "./auth";
import { emailService } from "./services/email";
import { zohoMailService } from "./services/zohoMail";
import { startDatajudSyncService } from "./services/datajudSync";
import { startDailyCron } from "./services/dailyCron";
import { startSyncSchedule } from "./services/dbSync";

process.on("uncaughtException", (err) => {
  const msg = err.message || "";
  const isBaileysError = msg.includes("authenticate data") ||
    msg.includes("Unsupported state") ||
    msg.includes("Connection Failure") ||
    msg.includes("Connection Closed") ||
    msg.includes("connection errored") ||
    msg.includes("Stream Errored") ||
    msg.includes("Timed Out") ||
    err.stack?.includes("baileys") ||
    err.stack?.includes("noise-handler") ||
    err.stack?.includes("WebSocketClient");
  if (isBaileysError) {
    console.error("[WhatsApp] Baileys error caught - app continues running:", msg);
  } else {
    console.error("[UNCAUGHT EXCEPTION]", msg, err.stack);
  }
});

process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || String(reason);
  const stack = reason?.stack || "";
  const isBaileysError = msg.includes("Connection Failure") ||
    msg.includes("Connection Closed") ||
    msg.includes("connection errored") ||
    msg.includes("Stream Errored") ||
    msg.includes("Timed Out") ||
    stack.includes("baileys") ||
    stack.includes("noise-handler") ||
    stack.includes("WebSocketClient");
  if (isBaileysError) {
    console.error("[WhatsApp] Baileys rejection caught - app continues running:", msg);
  } else {
    console.error("[UNHANDLED REJECTION]", msg);
  }
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize email services
  emailService.initialize();
  zohoMailService.initialize();

  // Seed demo data on startup
  try {
    await seedDemoData();
  } catch (error) {
    console.error("Error seeding demo data:", error);
  }

  setupAuth(app);

  await registerRoutes(httpServer, app);

  const { runDataMigrationIfNeeded } = await import("./services/dataMigration");
  runDataMigrationIfNeeded().catch(e => console.error("[Migration] Error:", e));

  startDatajudSyncService(1);
  startDailyCron(1);
  startSyncSchedule();

  const waEnabled = process.env.WHATSAPP_ENABLED !== "false" && (
    process.env.NODE_ENV === "production" || process.env.WHATSAPP_ENABLED === "true"
  );

  if (!waEnabled) {
    console.log("[WhatsApp] Auto-connect disabled in dev (set WHATSAPP_ENABLED=true to enable).");
  }

  if (waEnabled) {
    setTimeout(async () => {
      try {
        const { whatsappService } = await import("./services/whatsapp");
        const hasCreds = await whatsappService.hasCredentials(1);
        if (hasCreds) {
          console.log("[WhatsApp] PostgreSQL credentials found. Auto-connecting...");
          await whatsappService.initialize(1, false);
          console.log("[WhatsApp] Auto-connect initiated successfully.");
        } else {
          console.log("[WhatsApp] No saved credentials. Connect manually via Settings.");
        }
      } catch (err: any) {
        console.error("[WhatsApp] Auto-connect failed (non-fatal):", err?.message || err);
      }
    }, 5000);

    setInterval(async () => {
      try {
        const { whatsappService } = await import("./services/whatsapp");
        const status = whatsappService.getStatus();
        if (status.status === "disconnected") {
          const hasCreds = await whatsappService.hasCredentials(1);
          if (hasCreds) {
            console.log("[WhatsApp] Health check: disconnected with credentials. Reconnecting...");
            await whatsappService.initialize(1, false);
          }
        }
      } catch (err: any) {
        console.error("[WhatsApp] Health check error (non-fatal):", err?.message || err);
      }
    }, 5 * 60 * 1000);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    if (status >= 500) {
      console.error("[Express Error]", message);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
