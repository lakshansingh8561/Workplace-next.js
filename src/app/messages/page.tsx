import { Suspense } from "react";
import { Metadata } from "next";
import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import {
  getConversationsAction,
  getOrCreateConversationForContractAction,
} from "@/lib/actions/message";
import { MessagingLayout } from "@/components/messages/MessagingLayout";

export const metadata: Metadata = {
  title: "Messages | WorkPulse",
  description: "Secure contract messaging and collaboration between clients and freelancers on WorkPulse.",
};

interface MessagesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function MessagesContent({ searchParams }: MessagesPageProps) {
  await connection();
  const user = await requireUser("/login?callbackUrl=/messages");

  const resolvedParams = await searchParams;
  const contractIdParam =
    typeof resolvedParams.contractId === "string"
      ? resolvedParams.contractId
      : undefined;
  const conversationIdParam =
    typeof resolvedParams.conversationId === "string"
      ? resolvedParams.conversationId
      : undefined;

  let activeConversationId: string | null = conversationIdParam || null;

  // If contractId is provided, retrieve or initialize the conversation for that contract
  if (contractIdParam) {
    const res = await getOrCreateConversationForContractAction(contractIdParam);
    if (res.success && res.conversationId) {
      activeConversationId = res.conversationId;
    }
  }

  // Fetch all user conversations
  const conversationsRes = await getConversationsAction();
  const conversations = conversationsRes.conversations || [];

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-12">
      <MessagingLayout
        initialConversations={conversations}
        initialActiveConversationId={activeConversationId}
        currentUserId={user.id}
      />
    </main>
  );
}

export default function MessagesPage({ searchParams }: MessagesPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MessagesContent searchParams={searchParams} />
    </Suspense>
  );
}
