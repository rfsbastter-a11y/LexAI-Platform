# LexAI - Legal Practice Management Platform

## Overview

LexAI is a comprehensive legal practice management platform built for Brazilian law firms. It provides case management, client tracking, contract handling, billing, and AI-powered document generation and legal research assistance. The platform features multi-tenant architecture supporting multiple law firms, integration with Brazil's DataJud public court API for automatic case tracking, and an AI assistant powered by OpenAI for legal document generation and analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Build Tool**: Vite

The frontend follows a page-based structure under `client/src/pages/` with shared components in `client/src/components/`. Custom hooks in `client/src/hooks/` encapsulate data fetching logic using React Query.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Style**: RESTful JSON endpoints under `/api/*`

The server uses a modular structure:
- `server/routes.ts` - Main API route definitions
- `server/storage.ts` - Data access layer abstracting database operations
- `server/services/` - Business logic services (AI, DataJud integration)
- `server/replit_integrations/` - Reusable modules for AI chat, image generation, and batch processing

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` using Drizzle's table definitions
- **Migrations**: Managed via `drizzle-kit push`
- **Validation**: Zod schemas auto-generated from Drizzle schemas via `drizzle-zod`

Key database entities: tenants, users, clients, contracts, cases, case_movements, deadlines, documents, invoices, conversations, messages.

### Multi-Tenant Design
The application uses row-level tenant isolation. All major entities include a `tenantId` foreign key referencing the `tenants` table. Queries filter by tenant ID to ensure data separation between law firms.

### Authentication Pattern
Currently uses a simplified tenant ID approach (hardcoded tenant ID 1 in routes). The schema supports full authentication with users table containing email, password hash, roles, and OAB (Brazilian Bar Association) numbers.

### AI Integration
- Uses OpenAI-compatible API via Replit AI Integrations
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Features: Legal chat assistant, document summarization, piece generation, data extraction
- Strict guardrails in system prompts to prevent hallucinated legal citations

### Build Process
- Development: Vite dev server with HMR proxied through Express
- Production: Vite builds static assets to `dist/public`, esbuild bundles server to `dist/index.cjs`
- Script: `script/build.ts` handles the full build pipeline

## External Dependencies

### Database
- **PostgreSQL**: Required via `DATABASE_URL` environment variable
- **Connection**: Uses `pg` driver with connection pooling
- **Session Store**: `connect-pg-simple` for Express sessions

### AI Services
- **OpenAI API**: Via Replit AI Integrations for chat, document processing, and image generation
- **Models Used**: GPT for chat/text, gpt-image-1 for image generation

### Brazilian Court Integration
- **DataJud API**: Public CNJ (National Justice Council) API at `api-publica.datajud.cnj.jus.br`
- **Purpose**: Fetches case movements and updates from Brazilian courts
- **Supported Courts**: TJSP, TJMG, TJRJ, TRT tribunals, TRF tribunals, STJ, STF

### Third-Party Libraries
- **Charts**: Recharts for dashboard visualizations
- **Date Handling**: date-fns
- **Form Validation**: React Hook Form with Zod resolvers
- **Rate Limiting**: express-rate-limit
- **Batch Processing**: p-limit and p-retry for API rate limit handling