# ChaiGPT — How Clerk Authentication Works

**Date:** 2026-07-22
**Scope:** Every Clerk touchpoint in the codebase — middleware, providers, sign-in route, server-side gates, client UI, and the Clerk ↔ Prisma user mapping.
**Package:** `@clerk/nextjs` `^7.5.20` ([package.json:15](../package.json#L15))

> For first-time setup (creating a Clerk account, filling in `.env`), see the [README](../README.md#environment-setup). This document covers how the integration behaves once it's running.

---

## Touchpoints

Every file in the repo that imports from Clerk:

| Layer | File | Clerk API used |
|---|---|---|
| Middleware | [proxy.ts](../proxy.ts) | `clerkMiddleware`, `createRouteMatcher`, `auth.protect()` |
| Provider | [app/layout.tsx:7](../app/layout.tsx#L7), [:46](../app/layout.tsx#L46) | `<ClerkProvider>` |
| Route gate | [app/(root)/layout.tsx:11](<../app/(root)/layout.tsx#L11>) | `auth.protect()` |
| Sign-in page | [app/(auth)/sign-in/[[...sign-in]]/page.tsx](<../app/(auth)/sign-in/[[...sign-in]]/page.tsx>) | `<SignIn>` |
| DB sync | [features/auth/action/onboard.ts:13](../features/auth/action/onboard.ts#L13) | `currentUser()` |
| Server gate | [features/auth/action/require-user.ts:13](../features/auth/action/require-user.ts#L13) | `auth.protect()` |
| API route | [app/api/chat/route.ts:28](../app/api/chat/route.ts#L28) | `auth.protect()` |
| Client UI | [features/conversation/components/app-sidebar.tsx:253](../features/conversation/components/app-sidebar.tsx#L253) | `<UserButton>` |

That's the whole surface — eight files. Everything else in the app reaches auth indirectly, through `requireUser()`.

---

## Request lifecycle

### A page request (e.g. `/c/abc123`)

1. **Middleware** — [proxy.ts](../proxy.ts) runs first. `createRouteMatcher(["/sign-in(.*)"])` marks the only public path; every other match calls `await auth.protect()`, which redirects an unauthenticated visitor to the sign-in page.

   ```ts
   const isPublicRoute = createRouteMatcher(["/sign-in(.*)"])

   export default clerkMiddleware(async (auth, req) => {
     if (!isPublicRoute(req)) {
       await auth.protect()
     }
   })
   ```

   > **Note:** on Next.js 16 this file is `proxy.ts` at the repo root — the `middleware.ts` convention was renamed. See [CLAUDE.md](../CLAUDE.md).

2. **Root layout** — [app/layout.tsx](../app/layout.tsx) wraps the tree in `<ClerkProvider>`, which supplies session context to client components.

3. **`(root)` layout** — [app/(root)/layout.tsx](<../app/(root)/layout.tsx>) protects again and syncs the user into Postgres:

   ```ts
   await auth.protect();
   await onBoard();
   ```

4. **Page / server action** — anything needing the database calls `requireUser()` to get the **Prisma** user, then scopes its query by `user.id`.

### `POST /api/chat`

[app/api/chat/route.ts](../app/api/chat/route.ts) repeats the checks itself rather than trusting an upstream one:

1. `await auth.protect()` — rejects unauthenticated requests ([:28](../app/api/chat/route.ts#L28)).
2. `const user = await requireUser()` — resolves the Prisma user ([:36](../app/api/chat/route.ts#L36)).
3. Ownership check — the conversation is looked up by `{ id, userId: user.id }`, so a valid session cannot read someone else's thread; a miss returns `404` ([:38–46](../app/api/chat/route.ts#L38-L46)).

### Why the check appears three times

Middleware, layout, and per-action guards each cover a gap the others don't:

- **Layouts do not re-render on client-side navigation.** Moving between `/c/[id]` pages re-runs the *page*, not the `(root)` layout — so `auth.protect()` and `onBoard()` there fire when the segment first renders (full page load, or entering the group), not on every hop. (Confirmed in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:240`.)
- **Server actions are independently invokable endpoints.** A `"use server"` function can be called directly over the network without ever rendering the layout that "protects" it.

Hence the rule the codebase follows: **every server action opens with `requireUser()`**, regardless of which layout sits above it.

---

## Clerk ↔ Prisma user mapping

There are **two different user IDs**, and mixing them up is the main hazard:

| | Clerk `userId` | Prisma `User.id` |
|---|---|---|
| Format | `user_2abc…` | uuid |
| Source | Clerk session (`auth()`, `currentUser()`) | local Postgres row |
| Used by | Clerk APIs only | `Conversation.userId`, all app queries |

The bridge is the `clerkId` column ([prisma/schema.prisma:15-26](../prisma/schema.prisma#L15-L26)):

```prisma
model User {
  id        String   @id @default(uuid())
  clerkId   String   @unique
  email     String?  @unique
  firstName String?
  lastName  String?
  imageUrl  String?
  ...
  conversations Conversation[]
}
```

`Conversation.userId` points at the **Prisma** `id`, not the Clerk one. That's why data-access code never uses Clerk's `userId` directly — it calls `requireUser()` and uses `user.id`.

`onBoard()` is what keeps the row in sync, copying the profile fields on every run ([features/auth/action/onboard.ts:22-36](../features/auth/action/onboard.ts#L22-L36)):

```ts
return await prisma.user.upsert({
  where: { clerkId: clerkUser.id },
  create: { clerkId: clerkUser.id, email, firstName, lastName, imageUrl },
  update: { email, firstName, lastName, imageUrl },
});
```

---

## The two auth helpers

Both live in [features/auth/action/](../features/auth/action/) and are `"use server"`.

| | `onBoard()` | `requireUser()` |
|---|---|---|
| File | [onboard.ts](../features/auth/action/onboard.ts) | [require-user.ts](../features/auth/action/require-user.ts) |
| Clerk API | `currentUser()` (full profile) | `auth.protect()` (session only) |
| Database | **writes** — `upsert` | **reads** — `findUnique` |
| Returns | the created/updated `User` | the existing `User` |
| Throws | `"Unauthorized"` if no session; `"Failed to sync user"` on DB error | `"User not found. Complete onboarding first."` |
| Called from | [app/(root)/layout.tsx](<../app/(root)/layout.tsx>) only | 13 call sites |

`requireUser()` is the standard gate — used across `features/conversation/actions/`, `features/messages/actions/`, `features/home/actions/`, and the chat API route:

```ts
export async function requireUser() {
    const { userId } = await auth.protect();

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      throw new Error("User not found. Complete onboarding first.");
    }

    return user;
  }
```

### The pattern to copy

Every data-touching server action opens the same way — see [start-new-chat.ts:13](../features/home/actions/start-new-chat.ts#L13) or [conversation-actions.ts:46](../features/conversation/actions/conversation-actions.ts#L46):

```ts
"use server";

import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";

export async function myAction() {
  const user = await requireUser();          // auth + Prisma user in one call

  return prisma.conversation.findMany({
    where: { userId: user.id },              // always scope by the Prisma id
  });
}
```

---

## Sign-in and redirects

The only public route. Structure:

```
app/(auth)/
├── sign-in/
│   ├── layout.tsx              # centering wrapper
│   └── [[...sign-in]]/
│       └── page.tsx            # <SignIn />
```

```tsx
import {SignIn} from "@clerk/nextjs";

export default function Page(){
    return ( <SignIn forceRedirectUrl={"/"}/>)
}
```

- `[[...sign-in]]` is an **optional catch-all** segment, so Clerk can own its own sub-paths (verification steps, factor-two, SSO callbacks) under `/sign-in/*`. The middleware matcher `"/sign-in(.*)"` keeps all of them public.
- `forceRedirectUrl="/"` sends users to the landing page after signing in, and takes precedence over the fallback env vars.
- The `(auth)` route group has no layout of its own; [app/(auth)/sign-in/layout.tsx](<../app/(auth)/sign-in/layout.tsx>) provides the full-height centered box.
- **There is no sign-up route.** Only `<SignIn>` is mounted; `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` is set but no `<SignUp>` component exists in the app.

---

## Client-side surface

Aside from `<SignIn>` on the sign-in page (covered above), there are only two:

**1. The provider** — outermost of the three, inside `<body>` ([app/layout.tsx:46](../app/layout.tsx#L46)):

```tsx
<ClerkProvider>
  <QueryProvider>
    <ThemeProvider ...>
      {children}
```

**2. `<UserButton>`** — the avatar/account menu in the sidebar footer ([app-sidebar.tsx:253](../features/conversation/components/app-sidebar.tsx#L253)), sized to match the theme toggle beside it:

```tsx
<UserButton
  appearance={{
    elements: {
      avatarBox: "size-8",
    },
  }}
/>
```

Sign-out, profile management, and account switching are all handled inside this component — the app implements none of it.

---

## Environment variables

Five variables, all required (see [README](../README.md#environment-setup)):

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | public | Identifies the Clerk instance to the browser SDK |
| `CLERK_SECRET_KEY` | **secret** | Server-side API calls and session verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | public | `/sign-in` — where Clerk redirects unauthenticated users |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | public | `/` — post-sign-in landing when no redirect is specified |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | public | `/` — post-sign-up equivalent (unused; no sign-up route) |

Key values are not reproduced here; read them from `.env`, which is gitignored.
