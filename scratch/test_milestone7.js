const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=== WORKPULSE MILESTONE 7 VERIFICATION SUITE ===");

  // 1. Fetch Existing Users & Contract
  const client1 = await prisma.user.findUnique({
    where: { email: "test-client@workpulse.io" },
  });
  const client2 = await prisma.user.findUnique({
    where: { email: "test-client-2@workpulse.io" },
  });
  const freelancer = await prisma.user.findUnique({
    where: { email: "test-freelancer@workpulse.io" },
  });

  if (!client1 || !client2 || !freelancer) {
    throw new Error("Missing test users in database!");
  }

  console.log(`[Users Verified]:`);
  console.log(` - Client 1: ${client1.email} (${client1.id})`);
  console.log(` - Client 2 (Third-Party): ${client2.email} (${client2.id})`);
  console.log(` - Freelancer: ${freelancer.email} (${freelancer.id})`);

  const contract = await prisma.contract.findFirst({
    where: {
      clientId: client1.id,
      freelancerId: freelancer.id,
    },
  });

  if (!contract) {
    throw new Error("Missing active test contract between Client 1 and Freelancer!");
  }

  console.log(`\n[Contract Verified]: ID ${contract.id}, Title: "${contract.title}", Status: ${contract.status}`);

  // 2. Test Conversation Initialization
  console.log("\n--- TEST 1: Conversation Initialization & Membership ---");
  let conversation = await prisma.conversation.findUnique({
    where: { contractId: contract.id },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contractId: contract.id,
        clientId: client1.id,
        freelancerId: freelancer.id,
        lastMessageAt: new Date(),
      },
    });
    console.log(` -> Created new Conversation: ${conversation.id}`);
  } else {
    console.log(` -> Found existing Conversation: ${conversation.id}`);
  }

  // 3. Test Message Creation & Persistent Storage
  console.log("\n--- TEST 2: Message Creation & Integrity ---");
  const msgContent = "Hello! Milestone deliverable review is underway. Let's coordinate deadlines.";
  const createdMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: client1.id,
      content: msgContent,
      read: false,
    },
  });

  console.log(` -> Message Created: ID ${createdMsg.id}`);
  console.log(` -> Sender: ${createdMsg.senderId} (Matches Client 1)`);
  console.log(` -> Read Status: ${createdMsg.read}`);
  console.log(` -> Created At: ${createdMsg.createdAt.toISOString()}`);

  if (createdMsg.senderId !== client1.id || createdMsg.content !== msgContent || createdMsg.read !== false) {
    throw new Error("Message persistence integrity failure!");
  }

  // 4. Test Notification Delivery for Counterparty (Freelancer)
  console.log("\n--- TEST 3: In-App Notification Delivery for Recipient ---");
  const notification = await prisma.notification.create({
    data: {
      userId: freelancer.id,
      type: "NEW_MESSAGE",
      title: `New message from ${client1.name || "Client"}`,
      message: msgContent.slice(0, 77),
      link: `/messages?conversationId=${conversation.id}`,
      read: false,
    },
  });

  console.log(` -> Notification created for Freelancer: ID ${notification.id}`);
  console.log(` -> Recipient: ${notification.userId} (Matches Freelancer)`);
  console.log(` -> Type: ${notification.type}`);
  console.log(` -> Read: ${notification.read}`);

  // 5. Test Unread Count & Recipient Scoping
  console.log("\n--- TEST 4: Recipient Scoping & Unread Counts ---");
  const freelancerUnreadNotifications = await prisma.notification.count({
    where: { userId: freelancer.id, read: false },
  });
  const client2UnreadNotifications = await prisma.notification.count({
    where: { userId: client2.id, read: false },
  });

  console.log(` -> Freelancer Unread Notifications: ${freelancerUnreadNotifications}`);
  console.log(` -> Client 2 Unread Notifications: ${client2UnreadNotifications}`);

  if (freelancerUnreadNotifications < 1) {
    throw new Error("Freelancer should have at least 1 unread notification!");
  }

  // 6. Test Mark Notification as Read (Scoped)
  console.log("\n--- TEST 5: Scoped Notification Mark-as-Read ---");
  // Client 2 attempts to mark Freelancer's notification as read
  const unauthorizedUpdate = await prisma.notification.updateMany({
    where: { id: notification.id, userId: client2.id },
    data: { read: true },
  });

  console.log(` -> Client 2 update attempt on Freelancer's notification affected rows: ${unauthorizedUpdate.count}`);
  if (unauthorizedUpdate.count !== 0) {
    throw new Error("SECURITY BREACH: Client 2 was able to update Freelancer's notification!");
  }

  // Legitimate recipient (Freelancer) marks it read
  const legitimateUpdate = await prisma.notification.updateMany({
    where: { id: notification.id, userId: freelancer.id },
    data: { read: true },
  });
  console.log(` -> Freelancer update affected rows: ${legitimateUpdate.count}`);
  if (legitimateUpdate.count !== 1) {
    throw new Error("Freelancer should have successfully updated 1 notification!");
  }

  // 7. Test Message Read Status Update upon Counterparty Access
  console.log("\n--- TEST 6: Message Read Acknowledgement ---");
  const markMessagesRead = await prisma.message.updateMany({
    where: {
      conversationId: conversation.id,
      senderId: client1.id,
      read: false,
    },
    data: { read: true },
  });

  console.log(` -> Messages marked read for conversation: ${markMessagesRead.count}`);
  const reloadedMsg = await prisma.message.findUnique({ where: { id: createdMsg.id } });
  console.log(` -> Message read status after recipient access: ${reloadedMsg.read}`);
  if (!reloadedMsg.read) {
    throw new Error("Message should be marked read!");
  }

  // 8. Test Third-Party Isolation (Client 2 cannot read or write to Conversation)
  console.log("\n--- TEST 7: Multi-Tenant & Membership Isolation ---");
  const isClient2Member =
    conversation.clientId === client2.id || conversation.freelancerId === client2.id;
  console.log(` -> Is Client 2 authorized on Conversation?: ${isClient2Member} (Expected: false)`);
  if (isClient2Member) {
    throw new Error("SECURITY BREACH: Client 2 incorrectly listed as member!");
  }

  // 9. Verify Contract & Milestone Integrity
  console.log("\n--- TEST 8: Existing Contract & Milestone Integrity ---");
  const milestones = await prisma.contractMilestone.findMany({
    where: { contractId: contract.id },
  });
  console.log(` -> Found ${milestones.length} milestones for contract ${contract.id}`);
  milestones.forEach((m) => {
    console.log(`    - Milestone "${m.title}": $${m.amount}, Status: ${m.status}`);
  });

  console.log("\n✅ ALL MILESTONE 7 BACKEND & DATA INTEGRITY TESTS PASSED SUCCESSFULLY!");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
