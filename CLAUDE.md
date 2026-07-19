# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is **yarn** (yarn.lock).

- `yarn dev` — start dev server
- `yarn build` — production build
- `yarn lint` — ESLint (flat config, eslint-config-next)
- `npx prisma migrate dev` — apply/create migrations (config in `prisma.config.ts`)
- `npx prisma generate` — regenerate the Prisma client after schema changes

There is no test setup.

## Critical gotchas

- **Next.js 16**: middleware lives in `proxy.ts` at the repo root (the `middleware.ts` convention was renamed). Consult `node_modules/next/dist/docs/` before assuming App Router APIs match older Next.js.
- **Prisma client is generated into the repo** at `lib/generated/prisma/` (custom `output` in `prisma/schema.prisma`). Import types from there (via `lib/db.ts` singleton), not from `@prisma/client`.
- Path alias `@/*` maps to the repo root (there is no `src/`).
- Tailwind CSS v4: no `tailwind.config.js`; theme/CSS variables live in `app/globals.css`, PostCSS plugin only.

## Architecture

An AI chat app ("ChaiGPT"): Next.js 16 App Router, React 19, Clerk auth, Prisma 7 + Postgres (pg driver adapter), Vercel AI SDK v7 with OpenAI models and a Tavily web-search tool, shadcn/ui + Tailwind v4.

### Feature-based layout

Domain code lives in `features/<domain>/{actions,components,hooks,utils}` (domains: `ai`, `auth`, `conversation`, `home`, `messages`). Shared UI is in `components/ui/` (shadcn), `components/ai-elements/`, `components/providers/`. Server mutations are server actions (`"use server"`), not API routes — the only API route is the chat stream.

### Request flow for chat

1. `app/(root)/page.tsx` creates a conversation and redirects to `/c/[id]`.
2. The client posts `{message, id}` to `app/api/chat/route.ts`, which: protects via Clerk → `requireUser()` (`features/auth/action/require-user.ts`) → verifies conversation ownership → loads history via `loadChatMessages` (`features/ai/actions/chat-store.ts`) → saves the user message → `streamText` with the Tavily `tavilySearch` tool and `stopWhen: stepCountIs(5)` → streams back a UI message response and persists the assistant message on finish.
3. Message persistence maps Prisma `Message` rows ↔ AI SDK `UIMessage` (parts stored as JSON) in `features/ai/actions/chat-store.ts`; it also auto-titles new conversations from the first user message.

### Auth

- `proxy.ts`: `clerkMiddleware` protects everything except `/sign-in(.*)`.
- `ClerkProvider` is the outermost provider in `app/layout.tsx` (then React Query, then next-themes).
- `features/auth/action/onboard.ts` upserts the Clerk user into the Prisma `User` table (keyed by `clerkId`); `requireUser()` is the standard server-side gate returning the DB user.

### AI configuration

- Model selection: `features/ai/utils/model.ts` (`getChatModel`, default `gpt-4o-mini`); per-conversation override stored on `Conversation.model`.
- System prompt: `features/ai/utils/system-prompt.ts`, with per-conversation override on `Conversation.systemPrompt`.

### Database

Schema in `prisma/schema.prisma`: `User` → `Conversation` → `Message` with cascade deletes. `Message.parts`/`metadata` are Json columns mirroring AI SDK message parts. Connection singleton in `lib/db.ts` (requires `DATABASE_URL`).

## Environment variables

Required in `.env` (no `.env.example` exists): `DATABASE_URL`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.
