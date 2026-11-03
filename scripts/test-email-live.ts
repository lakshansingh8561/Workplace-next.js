/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';

// 1. Load .env manually so environment is accurately set in tsx
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      let v = match[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[match[1]] = v;
    }
  }
}

import {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  getEmailProviderStatus,
} from '../src/lib/email';
import nodemailer from 'nodemailer';

async function main() {
  if (process.env.RUN_LIVE_EMAIL_TEST !== "true") {
    console.log("Safe Guard: Live email test script is disabled by default to prevent unintended email dispatches.");
    console.log("To run intentionally, execute with: RUN_LIVE_EMAIL_TEST=true npx tsx scripts/test-email-live.ts");
    process.exit(0);
  }

  console.log('=== WORKPULSE EMAIL CONFIGURATION & LIVE DELIVERY AUDIT ===\n');

  // Task 2: Safe configuration status
  const status = getEmailProviderStatus();
  console.log('1. PROVIDER STATUS:');
  console.log(`- Detected Provider: ${status.provider}`);
  console.log(`- Is Configured: ${status.isConfigured}`);
  console.log(`- Sender Configured: ${status.senderConfigured}`);
  console.log(`- Present Variables: ${status.presentVariables.join(', ')}`);
  console.log(`- Missing Variables: ${status.missingVariables.join(', ')}\n`);

  const recipient = process.env.EMAIL_USER;
  if (!recipient) {
    console.error('ERROR: EMAIL_USER is not defined in environment.');
    process.exit(1);
  }

  // Mask recipient for safe reporting (e.g. j***@gmail.com)
  const [localPart, domain] = recipient.split('@');
  const maskedRecipient = `${localPart[0]}***@${domain}`;
  console.log(`Using explicitly controlled mailbox: ${maskedRecipient}\n`);

  // Task 3: Perform real email delivery test
  console.log('2. LIVE DISPATCH TESTS:');

  // Test 3.1: Basic Test Email
  console.log('a) Testing basic email delivery via sendEmail()...');
  const basicResult = await sendEmail({
    to: recipient,
    subject: 'WorkPulse Email Delivery Verification',
    text: 'This is an automated verification test sent from WorkPulse to verify SMTP delivery.',
    html: '<p>This is an automated verification test sent from WorkPulse to verify SMTP delivery.</p>',
  });
  console.log('   Basic Email Result:', {
    success: basicResult.success,
    hasMessageId: Boolean(basicResult.messageId),
    messageId: basicResult.messageId || 'none',
    error: basicResult.error || 'none',
  });

  // Test 3.2: Password Reset Email
  console.log('\nb) Testing sendPasswordResetEmail()...');
  const resetResult = await sendPasswordResetEmail({
    to: recipient,
    resetUrl: 'http://localhost:3000/reset-password?token=audit_verification_token',
    recipientName: 'WorkPulse Administrator',
  });
  console.log('   Password Reset Result:', {
    success: resetResult.success,
    hasMessageId: Boolean(resetResult.messageId),
    messageId: resetResult.messageId || 'none',
    error: resetResult.error || 'none',
  });

  // Test 3.3: Email Verification Email
  console.log('\nc) Testing sendVerificationEmail()...');
  const verifyResult = await sendVerificationEmail({
    to: recipient,
    verifyUrl: 'http://localhost:3000/verify-email?token=audit_verification_token',
    recipientName: 'WorkPulse Administrator',
  });
  console.log('   Verification Email Result:', {
    success: verifyResult.success,
    hasMessageId: Boolean(verifyResult.messageId),
    messageId: verifyResult.messageId || 'none',
    error: verifyResult.error || 'none',
  });

  // Task 4: Error Handling Scenarios
  console.log('\n3. ERROR HANDLING SCENARIOS:');

  // Scenario 4.1: Invalid credentials
  console.log('a) Testing invalid credentials handling...');
  const badAuthTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: recipient,
      pass: 'invalid_password_xyz_123',
    },
  });
  try {
    await badAuthTransporter.sendMail({
      from: process.env.EMAIL_FROM || recipient,
      to: recipient,
      subject: 'Invalid auth test',
      text: 'Should fail',
    });
    console.log('   Unexpected: Invalid credentials test succeeded');
  } catch (err: any) {
    console.log('   Expected failure on invalid credentials:', err.code || err.message?.substring(0, 50));
  }

  // Scenario 4.2: Missing credentials in production
  console.log('\nb) Testing missing credentials in production mode...');
  const originalEnv = process.env.NODE_ENV;
  const originalPass = process.env.EMAIL_PASS;
  const originalUser = process.env.EMAIL_USER;
  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_USER;
    const missingCredsResult = await sendEmail({
      to: 'unreachable@example.com',
      subject: 'Test missing creds',
      text: 'Test',
      html: '<p>Test</p>',
    });
    console.log('   Missing creds production result:', {
      success: missingCredsResult.success,
      error: missingCredsResult.error,
    });
  } finally {
    (process.env as any).NODE_ENV = originalEnv;
    process.env.EMAIL_PASS = originalPass;
    process.env.EMAIL_USER = originalUser;
  }

  // Scenario 4.3: Invalid recipient address
  console.log('\nc) Testing invalid recipient syntax...');
  try {
    const invalidRecipientResult = await sendEmail({
      to: 'invalid-email-syntax-without-at',
      subject: 'Invalid syntax test',
      text: 'Test',
      html: '<p>Test</p>',
    });
    console.log('   Invalid recipient result:', {
      success: invalidRecipientResult.success,
      error: invalidRecipientResult.error,
    });
  } catch (err: any) {
    console.log('   Caught error on invalid recipient:', err.message);
  }

  // Scenario 4.4: Network timeout / unreachable host
  console.log('\nd) Testing unreachable host / network timeout...');
  const timeoutTransporter = nodemailer.createTransport({
    host: '10.255.255.1', // Non-routable IP
    port: 465,
    secure: true,
    connectionTimeout: 1000,
    greetingTimeout: 1000,
    socketTimeout: 1000,
    auth: {
      user: 'test@example.com',
      pass: 'test',
    },
  });
  try {
    await timeoutTransporter.sendMail({
      from: 'test@example.com',
      to: 'test@example.com',
      subject: 'Timeout test',
      text: 'Test',
    });
    console.log('   Unexpected: Timeout test succeeded');
  } catch (err: any) {
    console.log('   Expected failure on network timeout:', err.code || err.message?.substring(0, 50));
  }

  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
