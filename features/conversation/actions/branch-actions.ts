"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertOwnsConversation } from "@/features/conversation/actions/conversation-actions";

export type BranchSummary = {
    id: string;
    title: string;
    createdAt: Date;
    branchPointMessageId: string | null;
};

export type BranchContext = {
    parent: { id: string; title: string } | null;
    branches: BranchSummary[];
};

/**
 * Forks a conversation at the given message: creates a new conversation
 * seeded with copies of the source's messages up to and including that
 * message, inheriting its model/systemPrompt as a snapshot.
 *
 * @throws {Error} When the conversation isn't owned by the user, or the
 * message doesn't belong to it.
 * @returns The newly created branch conversation.
 */
export async function createBranch(sourceConversationId: string, messageId: string) {
    const user = await requireUser();
    const source = await assertOwnsConversation(sourceConversationId, user.id);

    const sourceMessages = await prisma.message.findMany({
        where: { conversationId: sourceConversationId },
        orderBy: { createdAt: "asc" },
    });

    const forkIndex = sourceMessages.findIndex((message) => message.id === messageId);
    if (forkIndex === -1) {
        throw new Error("Message not found in this conversation");
    }

    const messagesToCopy = sourceMessages.slice(0, forkIndex + 1);
    const forkPointMessage = messagesToCopy[messagesToCopy.length - 1];

    const branch = await prisma.$transaction(async (tx) => {
        const newConversation = await tx.conversation.create({
            data: {
                userId: user.id,
                title: `${source.title} (branch)`,
                model: source.model,
                systemPrompt: source.systemPrompt,
                parentConversationId: source.id,
                branchPointMessageId: forkPointMessage.id,
            },
        });

        await tx.message.createMany({
            data: messagesToCopy.map((message) => ({
                conversationId: newConversation.id,
                role: message.role,
                status: message.status,
                content: message.content,
                parts: message.parts === null ? undefined : (message.parts as Prisma.InputJsonValue),
                metadata: message.metadata === null ? undefined : (message.metadata as Prisma.InputJsonValue),
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
            })),
        });

        return newConversation;
    });

    revalidatePath("/");
    return branch;
}

/**
 * Loads the parent (if this conversation is a branch) and the direct
 * branches forked from this conversation, for the branch navigator UI.
 */
export async function listBranches(conversationId: string): Promise<BranchContext> {
    const user = await requireUser();
    const conversation = await assertOwnsConversation(conversationId, user.id);

    const [parent, branches] = await Promise.all([
        conversation.parentConversationId
            ? prisma.conversation.findFirst({
                where: { id: conversation.parentConversationId, userId: user.id },
                select: { id: true, title: true },
            })
            : Promise.resolve(null),
        prisma.conversation.findMany({
            where: { parentConversationId: conversationId, userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, createdAt: true, branchPointMessageId: true },
        }),
    ]);

    return { parent, branches };
}
