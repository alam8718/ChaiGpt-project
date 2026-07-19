"use client";

import { isTextUIPart, type UIMessage } from "ai";
import type { ChatStatus } from "ai";
import { GitBranchIcon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageActions,
  MessageAction,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { useCreateBranch } from "@/features/conversation/hooks/use-branch";

/** Extracts plain text from a `UIMessage` by joining all text parts. */
function getMessageText(message: UIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

type ChatMessagesProps = {
  conversationId: string;
  messages: UIMessage[];
  status: ChatStatus;
};

/**
 * Renders the conversation message list with markdown responses and a loading indicator.
 */
export function ChatMessages({
  conversationId,
  messages,
  status,
}: ChatMessagesProps) {
  const isWaiting =
    status === "submitted" && messages.at(-1)?.role === "user";
  const createBranch = useCreateBranch();

  return (
    <Conversation>
      <ConversationContent className="py-8">
        {messages.map((message, index) => {
          // Only the last message can still be unpersisted mid-stream (the
          // chat route saves the assistant's reply in onEnd, after it
          // finishes) — branching from it before then would 404.
          const isUnsettled = index === messages.length - 1 && status !== "ready";

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                <MessageResponse>{getMessageText(message)}</MessageResponse>
              </MessageContent>
              <MessageActions className="opacity-0 transition-opacity group-hover:opacity-100">
                <MessageAction
                  tooltip="Branch from here"
                  disabled={isUnsettled || createBranch.isPending}
                  onClick={() =>
                    createBranch.mutate({ conversationId, messageId: message.id })
                  }
                >
                  <GitBranchIcon />
                </MessageAction>
              </MessageActions>
            </Message>
          );
        })}

        {isWaiting ? (
          <Message from="assistant">
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
    </Conversation>
  );
}
