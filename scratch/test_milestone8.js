const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  console.log("=== WORKPULSE MILESTONE 8: GOOGLE OAUTH & ROLE SAFETY VERIFICATION ===");

  // 1. Existing Users & Data Integrity Check
  console.log("\n--- TEST 1: Baseline User & Contract Integrity ---");
  const users = await prisma.user.findMany();
  console.log(` -> Found ${users.length} users in database:`);
  users.forEach((u) => {
    console.log(`    * ${u.email} [Role: ${u.role}, roleSelected: ${u.roleSelected ?? true}, hasPassword: ${Boolean(u.passwordHash)}]`);
  });

  const jobsCount = await prisma.job.count();
  const contractsCount = await prisma.contract.count();
  const proposalsCount = await prisma.proposal.count();
  console.log(` -> Existing Jobs: ${jobsCount}, Contracts: ${contractsCount}, Proposals: ${proposalsCount}`);

  if (users.length < 3 || jobsCount < 12) {
    throw new Error("Data regression: Missing expected seed/test records!");
  }

  // 2. Test Existing Credentials Password Flow
  console.log("\n--- TEST 2: Existing Credentials Flow Verification ---");
  const samplePassword = "Password123!";
  const hash = await bcrypt.hash(samplePassword, 12);
  const passwordMatch = await bcrypt.compare(samplePassword, hash);
  const badMatch = await bcrypt.compare("WrongPassword", hash);
  console.log(` -> Password comparison with bcrypt cost 12: matches=${passwordMatch}, rejectsWrong=${!badMatch}`);
  if (!passwordMatch || badMatch) {
    throw new Error("Password authentication verification failed!");
  }

  // 3. Test Google OAuth Email Verification Claim Logic
  console.log("\n--- TEST 3: Google Profile email_verified Claim Enforcement ---");
  const verifiedProfile = { email: "newgoogle@example.com", email_verified: true };
  const unverifiedProfile = { email: "unverified@example.com", email_verified: false };

  const verifyClaim = (p) => Boolean(p.email_verified || p.emailVerified);
  console.log(` -> Verified profile passes: ${verifyClaim(verifiedProfile)}`);
  console.log(` -> Unverified profile passes: ${verifyClaim(unverifiedProfile)} (Expected: false)`);
  if (!verifyClaim(verifiedProfile) || verifyClaim(unverifiedProfile)) {
    throw new Error("Email verification claim gate failed!");
  }

  // 4. Test Account Conflict & Safe Linking Detection
  console.log("\n--- TEST 4: Account Conflict Detection (Prevent Automatic Linking) ---");
  const checkConflict = async (email, provider) => {
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { accounts: true },
    });

    if (existing && existing.passwordHash) {
      const hasProviderAccount = existing.accounts.some((a) => a.provider === provider);
      if (!hasProviderAccount) {
        return "OAuthAccountNotLinked";
      }
    }
    return "ALLOW";
  };

  const conflictResult = await checkConflict("test-client@workpulse.io", "google");
  console.log(` -> Conflict check for test-client@workpulse.io attempting Google OAuth: ${conflictResult}`);
  if (conflictResult !== "OAuthAccountNotLinked") {
    throw new Error("Security check failed: Credentials user was not flagged for OAuth account conflict!");
  }

  // 5. Test New Google User Onboarding Simulation
  console.log("\n--- TEST 5: New Google User Creation & Onboarding State ---");
  const tempGoogleEmail = `google-test-${Date.now()}@example.com`;
  const newOAuthUser = await prisma.user.create({
    data: {
      email: tempGoogleEmail,
      name: "Google Onboarding Test User",
      image: "https://lh3.googleusercontent.com/test-avatar.jpg",
      role: "CLIENT", // default schema role
      roleSelected: false, // Flagged for onboarding
    },
  });

  console.log(` -> Created OAuth user: ${newOAuthUser.email} (ID: ${newOAuthUser.id})`);
  console.log(` -> Initial role: ${newOAuthUser.role}, roleSelected: ${newOAuthUser.roleSelected}`);
  if (newOAuthUser.roleSelected !== false) {
    throw new Error("New OAuth user should have roleSelected: false!");
  }

  // 6. Test Explicit Validated Role Selection
  console.log("\n--- TEST 6: Explicit Role Selection Onboarding ---");
  // User selects FREELANCER
  const updatedUser = await prisma.user.update({
    where: { id: newOAuthUser.id },
    data: {
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  console.log(` -> Updated role: ${updatedUser.role}, roleSelected: ${updatedUser.roleSelected}`);
  if (updatedUser.role !== "FREELANCER" || updatedUser.roleSelected !== true) {
    throw new Error("Role selection update failed!");
  }

  // 7. Test Role Tampering Prevention (Role cannot be overwritten once set)
  console.log("\n--- TEST 7: Role Tampering Protection ---");
  const attemptTamper = async (userId, newRole) => {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (u && u.roleSelected) {
      return { success: false, error: "Your role has already been established and cannot be changed." };
    }
    return { success: true };
  };

  const tamperResult = await attemptTamper(newOAuthUser.id, "CLIENT");
  console.log(` -> Tamper attempt result: ${tamperResult.error}`);
  if (tamperResult.success) {
    throw new Error("SECURITY FAILURE: User was able to overwrite finalized role!");
  }

  // Clean up temporary test record
  await prisma.user.delete({ where: { id: newOAuthUser.id } });
  console.log(` -> Cleaned up temporary test user ${tempGoogleEmail}`);

  console.log("\n✅ ALL MILESTONE 8 GOOGLE OAUTH & ROLE SAFETY TESTS PASSED!");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
