/**
 * Standalone SMTP diagnostic — tests Gmail SMTP connectivity and sends a test email.
 * Usage: npx tsx scripts/test-smtp.ts
 */
import nodemailer from "nodemailer";

// Force exit after 20 seconds to prevent hanging
const timer = setTimeout(() => {
  console.error("❌ TIMEOUT: SMTP test did not complete within 20 seconds. Connection may be blocked.");
  process.exit(1);
}, 20_000);

async function main() {
  const emailUser = process.env.EMAIL_USER || "lakshansingh8561@gmail.com";
  const emailPass = (process.env.EMAIL_PASS || "fhjy uzti gwop lfsq").replace(/\s+/g, "");
  const emailFrom = process.env.EMAIL_FROM || emailUser;

  console.log("=== SMTP Diagnostic ===");
  console.log(`User: ${emailUser}`);
  console.log(`Pass length: ${emailPass.length} chars (spaces stripped)`);
  console.log(`From: ${emailFrom}`);
  console.log("");

  // Test 1: Port 465 (SSL)
  console.log("--- Test 1: smtp.gmail.com:465 (SSL) ---");
  try {
    const transporter465 = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      auth: { user: emailUser, pass: emailPass },
    });

    console.log("Verifying connection...");
    await transporter465.verify();
    console.log("✅ Port 465 connection verified successfully!");

    console.log("Sending test email to nikhil85@yopmail.com...");
    const info = await transporter465.sendMail({
      from: `WorkPulse <${emailFrom}>`,
      to: "nikhil85@yopmail.com",
      subject: "WorkPulse SMTP Test - " + new Date().toISOString(),
      text: "If you receive this, SMTP is working correctly!",
      html: "<h2>SMTP Test Successful</h2><p>If you see this email, WorkPulse email delivery is working.</p>",
    });

    console.log("✅ Email sent successfully!");
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    clearTimeout(timer);
    process.exit(0);
  } catch (err: any) {
    console.error(`❌ Port 465 failed: ${err.message}`);
    console.error(`   Error code: ${err.code || "N/A"}`);
    console.error(`   Command: ${err.command || "N/A"}`);
    console.error("");
  }

  // Test 2: Port 587 (STARTTLS)
  console.log("--- Test 2: smtp.gmail.com:587 (STARTTLS) ---");
  try {
    const transporter587 = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      auth: { user: emailUser, pass: emailPass },
    });

    console.log("Verifying connection...");
    await transporter587.verify();
    console.log("✅ Port 587 connection verified successfully!");

    console.log("Sending test email to nikhil85@yopmail.com...");
    const info = await transporter587.sendMail({
      from: `WorkPulse <${emailFrom}>`,
      to: "nikhil85@yopmail.com",
      subject: "WorkPulse SMTP Test (587) - " + new Date().toISOString(),
      text: "If you receive this, SMTP is working correctly via port 587!",
      html: "<h2>SMTP Test Successful (Port 587)</h2><p>Email delivery is working.</p>",
    });

    console.log("✅ Email sent successfully via port 587!");
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    clearTimeout(timer);
    process.exit(0);
  } catch (err: any) {
    console.error(`❌ Port 587 failed: ${err.message}`);
    console.error(`   Error code: ${err.code || "N/A"}`);
    console.error(`   Command: ${err.command || "N/A"}`);
  }

  console.error("\n❌ Both SMTP ports failed. See errors above.");
  clearTimeout(timer);
  process.exit(1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  clearTimeout(timer);
  process.exit(1);
});

