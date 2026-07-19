# ChaiGPT

An AI chat application with persistent, branchable conversations — built with Next.js 16, React 19, Clerk auth, the Vercel AI SDK v7 (OpenAI models + Tavily web search), and Prisma 7 + PostgreSQL.

## Features

- **AI Chat with Streaming** — Responses stream in real time via the Vercel AI SDK, backed by OpenAI models
- **Web Search Tool** — The assistant can call Tavily search mid-conversation for up-to-date answers
- **Persistent Conversations** — Every conversation and message is saved to Postgres via Prisma
- **Conversation Branching** — Fork a conversation from any message into a new thread; the branch inherits the model and system prompt at that point
- **Pin & Archive** — Organize conversations from the sidebar
- **Auto-Titling** — New conversations are automatically titled from the first user message
- **Per-Conversation Overrides** — Model and system prompt can be customized per conversation
- **Clerk Authentication** — All routes except `/sign-in` require a signed-in user
- **Light/Dark Theme** — System-aware theming via `next-themes`
- **Rich Markdown Rendering** — Streamed markdown, code blocks, math, and Mermaid diagrams via Streamdown

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19, Tailwind CSS v4, shadcn/ui |
| **AI** | Vercel AI SDK v7, OpenAI models, Tavily web search tool |
| **Database** | PostgreSQL + Prisma 7 (`pg` driver adapter) |
| **Auth** | Clerk |
| **Language** | TypeScript 5 |
| **Data fetching** | TanStack React Query |
| **Icons** | Lucide React |

## Prerequisites

- **Node.js** 20.9+ and **yarn**
- **PostgreSQL database** (e.g. [Neon](https://neon.tech), Supabase, or local Postgres)
- **Clerk account** ([sign up](https://clerk.com)) for authentication keys
- **OpenAI API key** ([get one](https://platform.openai.com/api-keys))
- **Tavily API key** ([get one](https://tavily.com)) for the web search tool

## Environment Setup

Create a `.env` file in the project root (there is no `.env.example` to copy from) with the following variables:

```env
# PostgreSQL connection string
DATABASE_URL=

# OpenAI API key (used for chat completions)
OPENAI_API_KEY=

# Tavily API key (used for the web search tool)
TAVILY_API_KEY=

# Clerk authentication
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=
```

**Important:** Never commit `.env` — it should be excluded via `.gitignore` and contains sensitive credentials.

## Installation & Running

### Development

```bash
# Clone the repository
git clone <repo-url>
cd chaiGpt

# Install dependencies
yarn install

# Set up environment (see Environment Setup above)

# Apply database migrations
npx prisma migrate dev

# Start the development server
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production

```bash
# Build for production
yarn build

# Start production server
yarn start
```

## Available Scripts

| Command | Purpose |
|---------|---------|
| `yarn dev` | Start development server at `http://localhost:3000` |
| `yarn build` | Create optimized production build |
| `yarn start` | Run production server |
| `yarn lint` | Lint code with ESLint |
| `npx prisma migrate dev` | Apply/create database migrations |
| `npx prisma generate` | Regenerate the Prisma client after schema changes |

## API

Most mutations (creating, listing, renaming, pinning, archiving, deleting, and branching conversations) are implemented as **server actions**, not REST endpoints — see `features/conversation/actions/`. The only HTTP API route is the chat stream:

- **`POST /api/chat`**
  - Body: `{ message: UIMessage, id: string }` — a conversation ID and the new user message
  - Requires an authenticated, owning user
  - Streams the assistant's reply (with tool calls to Tavily search as needed) as a UI message stream, and persists both the user and assistant messages when the stream ends

## Project Structure

```
app/
├── (auth)/sign-in/         # Clerk sign-in page
├── (root)/                 # Landing page + /c/[id] conversation page
├── api/chat/                # Chat streaming API route
└── layout.tsx               # Root layout (Clerk, React Query, theme providers)
components/
├── ai-elements/             # Chat/message rendering components
├── providers/                # React Query + theme providers
└── ui/                       # shadcn/ui components
features/
├── ai/                       # Model selection, system prompt, message persistence
├── auth/                     # Clerk onboarding + requireUser() gate
├── conversation/              # Sidebar, chat shell, branching, server actions
├── home/                      # New-chat flow
└── messages/                  # Message-level server actions/hooks
lib/
├── db.ts                      # Prisma client singleton
└── generated/prisma/          # Generated Prisma client (custom output path)
prisma/
└── schema.prisma               # Database schema
```

## Database Schema

### User
- `clerkId` (string, unique) — Clerk user ID
- `email`, `firstName`, `lastName`, `imageUrl` — profile fields synced from Clerk
- `createdAt` / `updatedAt` (timestamps)

### Conversation
- `title` (string) — auto-generated from the first message, or user-renamed
- `model` (string, optional) — per-conversation OpenAI model override
- `systemPrompt` (text, optional) — per-conversation system prompt override
- `isPinned` / `isArchived` (booleans)
- `parentConversationId` / `branchPointMessageId` — set when this conversation is a branch forked from another
- `lastMessageAt` (timestamp) — drives sidebar ordering

### Message
- `conversationId` (string) — parent conversation
- `role` (enum) — `USER`, `ASSISTANT`, `SYSTEM`, or `TOOL`
- `status` (enum) — `PENDING`, `COMPLETE`, or `ERROR`
- `content` (text) — plain-text content
- `parts` / `metadata` (JSON) — AI SDK UI message parts and metadata

## Troubleshooting

### Database connection error
- Verify `DATABASE_URL` is a valid PostgreSQL connection string
- Run `npx prisma migrate dev` to ensure the schema is up to date
- Run `npx prisma generate` if you see missing/stale Prisma client type errors

### Clerk authentication error
- Confirm `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set and match the same Clerk application
- Ensure `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and the fallback redirect URLs are set, or sign-in redirects may fail

### OpenAI / Tavily errors
- Confirm `OPENAI_API_KEY` and `TAVILY_API_KEY` are valid and have available quota
- These keys are consumed implicitly by their SDKs — no other configuration is needed

### Build fails
- Clear the build cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && yarn install`
- Rebuild: `yarn build`

## Development Tips

- **Hot Reload** — Changes to files under `app/`, `features/`, and `components/` auto-reload during `yarn dev`
- **TypeScript** — Full type safety enabled; run `yarn lint` to catch lint/type issues
- **Prisma client is generated into the repo** at `lib/generated/prisma/` (custom `output` in `prisma/schema.prisma`) — import types from there via `lib/db.ts`, not from `@prisma/client`
- **Next.js 16** — middleware lives in `proxy.ts` at the repo root, not `middleware.ts`
- **Tailwind CSS v4** — no `tailwind.config.js`; theme/CSS variables live in `app/globals.css`
- **Component Library** — Most UI components are from [shadcn/ui](https://ui.shadcn.com/) and can be customized directly
