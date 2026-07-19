# ChaiGPT — Project Review: Bugs & Improvement Suggestions

**Date:** 2026-07-19
**Scope:** Full codebase review — app routes, API route, server actions, hooks, components, Prisma schema, config.
**Automated checks:** `npx tsc --noEmit` → ✅ clean. `yarn lint` → ❌ 2 errors, 3 warnings (details in [finding #4](#4-lint-errors-and-warnings)).

## Summary

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 2 | 🟡 Bug (latent) | SYSTEM/TOOL roles silently mapped to `"user"` when loading | `features/ai/actions/chat-store.ts` |
| 3 | 🟡 Bug | Unvalidated request body — invalid JSON → unhandled 500 | `app/api/chat/route.ts` |
| 4 | 🟡 Quality | Lint: 2 errors + 3 warnings, `yarn lint` exits non-zero | multiple files |
| 5 | 🟡 Quality | Dead code: unused message hooks and server actions | `features/messages/`, `features/conversation/hooks/` |
| 6 | 🟡 Quality | Duplicated, divergent logic (ownership check, auto-title) | `features/*/actions/` |
| 7 | 🟢 Minor | Page metadata still says "Create Next App" | `app/layout.tsx` |
| 8–14 | 🔵 Suggestion | Performance, robustness, and UX improvements | see below |

---

## Bugs

### 2. SYSTEM/TOOL roles silently mapped to `"user"` (latent)

[features/ai/actions/chat-store.ts:44](../features/ai/actions/chat-store.ts#L44):

```ts
role: row.role === "ASSISTANT" ? "assistant" : "user",
```

The `MessageRole` enum includes `SYSTEM` and `TOOL`; any such row would be replayed to the model as a user message. Harmless today (only USER/ASSISTANT are written), but the schema invites it. **Fix:** handle all enum members explicitly (or narrow the enum).

### 3. Unvalidated request body on `/api/chat`

[app/api/chat/route.ts:30](../app/api/chat/route.ts#L30): `await req.json()` throws on malformed JSON → unhandled 500. The `message` shape (`parts` array, text length) is also never validated — a huge or malformed payload goes straight to the DB and the OpenAI API. **Fix:** wrap parsing in try/catch (or use `zod`), validate with the AI SDK's `validateUIMessages`, and cap message length.

### 4. Lint errors and warnings

`yarn lint` currently fails (exit 1):

- **Errors** (`react-hooks/set-state-in-effect`): [components/ui/carousel.tsx:101](../components/ui/carousel.tsx#L101) and [hooks/use-mobile.ts:19](../hooks/use-mobile.ts#L19) — both shadcn-generated; either fix the pattern or downgrade the rule for `components/ui/`.
- **Warnings** (unused vars): `createUIMessageStream` in [app/api/chat/route.ts:14](../app/api/chat/route.ts#L14), `ConversationScrollButton` in [chat-messages.tsx:9](../features/conversation/components/chat-messages.tsx#L9), `React` in [page.tsx:3](../app/(root)/page.tsx#L3).

---

## Code quality / dead code

### 5. Dead code

None of these are referenced anywhere outside their own files:

- All four hooks in [features/messages/hooks/use-messages.ts](../features/messages/hooks/use-messages.ts) (`useMessages`, `useCreateMessage`, `useUpdateMessage`, `useDeleteMessage`)
- `useCreateConversation` in [features/conversation/hooks/use-conversation.ts:29](../features/conversation/hooks/use-conversation.ts#L29)
- Server actions `createConversation` ([conversation-actions.ts:78](../features/conversation/actions/conversation-actions.ts#L78)) and `createMessage`/`updateMessage`/`deleteMessage` ([messages-action.ts](../features/messages/actions/messages-action.ts))

Unused `"use server"` actions are still **publicly invokable endpoints**, so dead server actions are attack surface, not just clutter. Remove them, or wire them into the UI.

### 6. Duplicated, divergent logic

- `assertOwnsConversation` is copy-pasted in [conversation-actions.ts:24](../features/conversation/actions/conversation-actions.ts#L24) and [messages-action.ts:24](../features/messages/actions/messages-action.ts#L24) — extract one shared helper.
- Auto-title logic differs: [chat-store.ts:105](../features/ai/actions/chat-store.ts#L105) uses `slice(0, 48)` while [messages-action.ts:91](../features/messages/actions/messages-action.ts#L91) uses `slice(0, 48) + "…"` and also renames on empty titles. Pick one implementation.

### 7. Default metadata

[app/layout.tsx:22-23](../app/layout.tsx#L22-L23) still ships `title: "Create Next App"`. Set a real title/description (and consider a `metadata.title.template` for per-page titles).

---

## Improvement suggestions

### 8. Persistence performance in the chat route

`onEnd` ([route.ts:84-86](../app/api/chat/route.ts#L84-L86)) receives `originalMessages` + the new response, so **the entire conversation history is re-upserted sequentially on every request** — O(n) round trips that grow with conversation length. Save only the new/changed messages (e.g. everything after the last original message), and wrap `saveChatMessages` in `prisma.$transaction` so a mid-loop failure can't leave a half-saved turn.

### 9. `onBoard()` runs a DB upsert on every navigation

[app/(root)/layout.tsx:12](../app/(root)/layout.tsx#L12) upserts the Clerk user on every render of the authenticated layout. Cheaper alternatives: check existence first and only upsert when missing/changed, or sync via a Clerk webhook (`user.created`/`user.updated`) and keep the layout read-only.

### 10. Add error/loading boundaries

There is no `error.tsx`, `global-error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere. Any uncaught server error currently produces the default unstyled crash page. At minimum add a root `error.tsx` and a `loading.tsx` for `/c/[id]`.

### 11. Rate limiting / abuse protection

`/api/chat` has no rate limit and no message-size cap; each request can fan out to up to 5 model steps plus Tavily searches (`stopWhen: stepCountIs(5)`), so cost exposure per authenticated user is unbounded. Consider an upstash-style rate limiter keyed by `user.id` and a max input length (pairs with #3).

### 12. Archived conversations are unreachable

`updateConversation` supports `isArchived`, but the sidebar only lists `isArchived: false` and no UI ever shows archived chats — archiving is effectively a soft-delete with no undo. Either add an "Archived" section with unarchive, or drop the concept. (Related: the header title in `conversation-view.tsx` falls back to `"Chat"` for any conversation not in the sidebar list, which includes archived ones.)

### 13. Chat UX

- **Can't type while streaming:** the textarea is `disabled` whenever `isSending` — let users compose the next message during streaming and only disable *sending*. Consider a "Stop" button (`stop()` from `useChat`).
- **Tool steps render as empty bubbles:** [chat-messages.tsx:41-47](../features/conversation/components/chat-messages.tsx#L41-L47) renders only text parts, so while `tavilySearch` runs, the assistant message shows an empty bubble with no indication a search is happening. Render tool parts (the installed `components/ai-elements/` and Streamdown stack support this), and pass `tools` to `toUIMessageStream` in the route for properly typed tool parts.
- `ConversationScrollButton` is imported but never rendered — adding it back gives a scroll-to-bottom affordance for long chats.

### 14. Project hygiene

- Add a **`.env.example`** listing the required variables (CLAUDE.md already enumerates them).
- There is **no test setup**; even a minimal Vitest config covering `chat-store.ts` (the trickiest logic: part normalization, titling, upsert behavior) would pay off quickly.
- `app/(root)/page.tsx` and `c/[id]/page.tsx` use lowercase `const page = async () => {}` — rename to PascalCase function components for consistency with the rest of the codebase.

---

## What looks good

- Clean feature-based layout (`features/<domain>/{actions,components,hooks,utils}`) with consistent JSDoc.
- Ownership checks (`requireUser` + conversation scoping) are applied on every conversation-level action and the chat route.
- Correct AI SDK v7 streaming pattern: `consumeStream()` keeps persistence running even if the client disconnects, and `prepareSendMessagesRequest` sends only the last message while the server replays history.
- Sensible Prisma schema: cascade deletes, composite indexes matching the sidebar query, JSON `parts` mirroring AI SDK messages, dev-safe client singleton in `lib/db.ts`.
- TypeScript is clean (`tsc --noEmit` passes with no errors).
