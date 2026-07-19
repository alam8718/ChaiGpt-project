# ChaiGPT — Project Review: Bugs & Improvement Suggestions

**Date:** 2026-07-19
**Scope:** Full codebase review — app routes, API route, server actions, hooks, components, Prisma schema, config.
**Automated checks:** `npx tsc --noEmit` → ✅ clean. `yarn lint` → ❌ 2 errors, 4 warnings (details in [finding #9](#9-lint-errors-and-warnings)).

## Summary

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 2 | 🟠 Bug | Composer permanently disabled after a stream error | `features/conversation/components/conversation-view.tsx` |
| 3 | 🟠 Bug | Per-conversation `systemPrompt` override is ignored | `app/api/chat/route.ts` |
| 4 | 🟠 Bug | Visiting `/` creates a DB row on every GET render | `app/(root)/page.tsx` |
| 5 | 🟠 Bug | `notFound()` swallows every error (DB outage → 404) | `app/(root)/c/[id]/page.tsx` |
| 6 | 🟠 Bug (latent) | Message edit updates `content` but not `parts` — edit never reaches the AI | `features/messages/actions/messages-action.ts` |
| 7 | 🟡 Bug (latent) | SYSTEM/TOOL roles silently mapped to `"user"` when loading | `features/ai/actions/chat-store.ts` |
| 8 | 🟡 Bug | Unvalidated request body — invalid JSON → unhandled 500 | `app/api/chat/route.ts` |
| 9 | 🟡 Quality | Lint: 2 errors + 4 warnings, `yarn lint` exits non-zero | multiple files |
| 10 | 🟡 Quality | Dead code: unused message hooks and server actions | `features/messages/`, `features/conversation/hooks/` |
| 11 | 🟡 Quality | Duplicated, divergent logic (ownership check, auto-title) | `features/*/actions/` |
| 12 | 🟢 Minor | Page metadata still says "Create Next App" | `app/layout.tsx` |
| 13–19 | 🔵 Suggestion | Performance, robustness, and UX improvements | see below |

---

## Bugs

### 2. Composer permanently disabled after a stream error

[features/conversation/components/conversation-view.tsx:71](../features/conversation/components/conversation-view.tsx#L71):

```tsx
isSending={status !== "ready"}
```

When a request fails, `useChat` status becomes `"error"` and stays there — it never returns to `"ready"`. The toast shows the error, but the composer stays disabled until a full page reload.

**Fix:** `isSending={status === "submitted" || status === "streaming"}`.

### 3. Per-conversation `systemPrompt` override is ignored

The schema defines `Conversation.systemPrompt` and the conversation row is already loaded in the route, but [app/api/chat/route.ts:65](../app/api/chat/route.ts#L65) always uses the global prompt:

```ts
system: systemPrompt,   // should be: conversation.systemPrompt ?? systemPrompt
```

Note the `model` override on the line above *is* honored — this one was simply missed.

### 4. Visiting `/` creates a DB row on every GET render

[app/(root)/page.tsx:9](../app/(root)/page.tsx#L9) calls `startNewChat()` (a DB insert) as a side effect of rendering a server component. Every visit to `/` — logo click, "New chat" click, the redirect after deleting the active chat, a browser refresh — creates a new empty **"New Chat"** conversation. These pile up in the sidebar and the database. GET/render should be side-effect free.

**Fix options:**
- Reuse the newest conversation that has zero messages instead of always creating one.
- Or render the empty-chat UI at `/` and only create the conversation when the first message is sent.

### 5. `notFound()` swallows every error

[app/(root)/c/[id]/page.tsx:17-21](../app/(root)/c/%5Bid%5D/page.tsx#L17-L21):

```ts
try {
  await getConversation(id)
} catch (error) {
  notFound()
}
```

Any failure — database outage, missing onboarding row from `requireUser()`, transient Prisma error — is presented as a 404. **Fix:** only call `notFound()` when the conversation genuinely doesn't exist (e.g. have `getConversation` return `null` for not-found and let real errors propagate to an error boundary).

### 6. Message edit updates `content` but not `parts` (latent)

[features/messages/actions/messages-action.ts:120-123](../features/messages/actions/messages-action.ts#L120-L123) updates only `content` on edit, but `loadChatMessages` ([chat-store.ts:45](../features/ai/actions/chat-store.ts#L45)) prefers the stored `parts` JSON over `content`. So an edited message would still send the **old** text to the model. Latent today because `updateMessage` is unused (see #10), but it will bite the moment editing is wired up. **Fix:** also rewrite `parts` to `[{ type: "text", text: trimmed }]`.

### 7. SYSTEM/TOOL roles silently mapped to `"user"` (latent)

[features/ai/actions/chat-store.ts:44](../features/ai/actions/chat-store.ts#L44):

```ts
role: row.role === "ASSISTANT" ? "assistant" : "user",
```

The `MessageRole` enum includes `SYSTEM` and `TOOL`; any such row would be replayed to the model as a user message. Harmless today (only USER/ASSISTANT are written), but the schema invites it. **Fix:** handle all enum members explicitly (or narrow the enum).

### 8. Unvalidated request body on `/api/chat`

[app/api/chat/route.ts:30](../app/api/chat/route.ts#L30): `await req.json()` throws on malformed JSON → unhandled 500. The `message` shape (`parts` array, text length) is also never validated — a huge or malformed payload goes straight to the DB and the OpenAI API. **Fix:** wrap parsing in try/catch (or use `zod`), validate with the AI SDK's `validateUIMessages`, and cap message length.

### 9. Lint errors and warnings

`yarn lint` currently fails (exit 1):

- **Errors** (`react-hooks/set-state-in-effect`): [components/ui/carousel.tsx:101](../components/ui/carousel.tsx#L101) and [hooks/use-mobile.ts:19](../hooks/use-mobile.ts#L19) — both shadcn-generated; either fix the pattern or downgrade the rule for `components/ui/`.
- **Warnings** (unused vars): `createUIMessageStream` in [app/api/chat/route.ts:14](../app/api/chat/route.ts#L14), `ConversationScrollButton` in [chat-messages.tsx:9](../features/conversation/components/chat-messages.tsx#L9), `error` in [c/[id]/page.tsx:19](../app/(root)/c/%5Bid%5D/page.tsx#L19), `React` in [page.tsx:3](../app/(root)/page.tsx#L3).

---

## Code quality / dead code

### 10. Dead code

None of these are referenced anywhere outside their own files:

- All four hooks in [features/messages/hooks/use-messages.ts](../features/messages/hooks/use-messages.ts) (`useMessages`, `useCreateMessage`, `useUpdateMessage`, `useDeleteMessage`)
- `useCreateConversation` in [features/conversation/hooks/use-conversation.ts:29](../features/conversation/hooks/use-conversation.ts#L29)
- Server actions `createConversation` ([conversation-actions.ts:78](../features/conversation/actions/conversation-actions.ts#L78)) and `createMessage`/`updateMessage`/`deleteMessage` ([messages-action.ts](../features/messages/actions/messages-action.ts))

Unused `"use server"` actions are still **publicly invokable endpoints**, so dead server actions are attack surface, not just clutter. Remove them, or wire them into the UI (message edit/delete would pair naturally with fixing #6).

### 11. Duplicated, divergent logic

- `assertOwnsConversation` is copy-pasted in [conversation-actions.ts:24](../features/conversation/actions/conversation-actions.ts#L24) and [messages-action.ts:24](../features/messages/actions/messages-action.ts#L24) — extract one shared helper.
- Auto-title logic differs: [chat-store.ts:105](../features/ai/actions/chat-store.ts#L105) uses `slice(0, 48)` while [messages-action.ts:91](../features/messages/actions/messages-action.ts#L91) uses `slice(0, 48) + "…"` and also renames on empty titles. Pick one implementation.

### 12. Default metadata

[app/layout.tsx:22-23](../app/layout.tsx#L22-L23) still ships `title: "Create Next App"`. Set a real title/description (and consider a `metadata.title.template` for per-page titles).

---

## Improvement suggestions

### 13. Persistence performance in the chat route

`onEnd` ([route.ts:84-86](../app/api/chat/route.ts#L84-L86)) receives `originalMessages` + the new response, so **the entire conversation history is re-upserted sequentially on every request** — O(n) round trips that grow with conversation length. Save only the new/changed messages (e.g. everything after the last original message), and wrap `saveChatMessages` in `prisma.$transaction` so a mid-loop failure can't leave a half-saved turn.

### 14. `onBoard()` runs a DB upsert on every navigation

[app/(root)/layout.tsx:12](../app/(root)/layout.tsx#L12) upserts the Clerk user on every render of the authenticated layout. Cheaper alternatives: check existence first and only upsert when missing/changed, or sync via a Clerk webhook (`user.created`/`user.updated`) and keep the layout read-only.

### 15. Add error/loading boundaries

There is no `error.tsx`, `global-error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere. Any uncaught server error currently produces the default unstyled crash page. At minimum add a root `error.tsx` and a `loading.tsx` for `/c/[id]`.

### 16. Rate limiting / abuse protection

`/api/chat` has no rate limit and no message-size cap; each request can fan out to up to 5 model steps plus Tavily searches (`stopWhen: stepCountIs(5)`), so cost exposure per authenticated user is unbounded. Consider an upstash-style rate limiter keyed by `user.id` and a max input length (pairs with #8).

### 17. Archived conversations are unreachable

`updateConversation` supports `isArchived`, but the sidebar only lists `isArchived: false` and no UI ever shows archived chats — archiving is effectively a soft-delete with no undo. Either add an "Archived" section with unarchive, or drop the concept. (Related: the header title in `conversation-view.tsx` falls back to `"Chat"` for any conversation not in the sidebar list, which includes archived ones.)

### 18. Chat UX

- **Can't type while streaming:** the textarea is `disabled` whenever `isSending` — let users compose the next message during streaming and only disable *sending*. Consider a "Stop" button (`stop()` from `useChat`).
- **Tool steps render as empty bubbles:** [chat-messages.tsx:41-47](../features/conversation/components/chat-messages.tsx#L41-L47) renders only text parts, so while `tavilySearch` runs, the assistant message shows an empty bubble with no indication a search is happening. Render tool parts (the installed `components/ai-elements/` and Streamdown stack support this), and pass `tools` to `toUIMessageStream` in the route for properly typed tool parts.
- `ConversationScrollButton` is imported but never rendered — adding it back gives a scroll-to-bottom affordance for long chats.

### 19. Project hygiene

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
