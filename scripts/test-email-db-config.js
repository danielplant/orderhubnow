#!/usr/bin/env node
/**
 * Test that all email types work with DB settings
 *
 * Usage: node scripts/test-email-db-config.js [test-email@example.com]
 *
 * Tests:
 * 1. DB config is complete (SMTP + From email)
 * 2. SMTP connection works
 * 3. Can send a test email
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();

const TEST_EMAIL = process.argv[2] || null;

async function main() {
  console.log('=== Email DB Config Test ===\n');

  // 1. Fetch DB settings
  console.log('1. Fetching email settings from DB...');
  const settings = await prisma.emailSettings.findFirst();

  if (!settings) {
    console.error('   ❌ No email settings found in database!');
    console.log('   → Go to Admin → Settings → Email to configure');
    process.exit(1);
  }

  console.log('   ✓ Email settings found (ID:', settings.ID, ')');

  // 2. Check required fields
  console.log('\n2. Checking required fields...');
  const checks = {
    FromEmail: settings.FromEmail,
    SmtpHost: settings.SmtpHost,
    SmtpPort: settings.SmtpPort,
    SmtpUser: settings.SmtpUser,
    SmtpPassword: settings.SmtpPassword ? '***' : null,
  };

  let allGood = true;
  for (const [field, value] of Object.entries(checks)) {
    if (value) {
      console.log(`   ✓ ${field}: ${field === 'SmtpPassword' ? '[set]' : value}`);
    } else {
      console.log(`   ❌ ${field}: NOT SET`);
      allGood = false;
    }
  }

  if (!allGood) {
    console.error('\n   ❌ Required fields missing. Configure in Admin → Settings → Email');
    process.exit(1);
  }

  // 3. Test SMTP connection
  console.log('\n3. Testing SMTP connection...');
  const transporter = nodemailer.createTransport({
    host: settings.SmtpHost,
    port: settings.SmtpPort,
    secure: settings.SmtpSecure,
    auth: {
      user: settings.SmtpUser,
      pass: settings.SmtpPassword,
    },
  });

  try {
    await transporter.verify();
    console.log('   ✓ SMTP connection successful');
  } catch (error) {
    console.error('   ❌ SMTP connection failed:', error.message);
    process.exit(1);
  }

  // 4. Send test email (if address provided)
  if (TEST_EMAIL) {
    console.log('\n4. Sending test email to:', TEST_EMAIL);
    try {
      const result = await transporter.sendMail({
        from: settings.FromName
          ? `"${settings.FromName}" <${settings.FromEmail}>`
          : settings.FromEmail,
        to: TEST_EMAIL,
        subject: 'DB Email Config Test - ' + new Date().toISOString(),
        html: `
          <h2>Email Config Test Successful</h2>
          <p>This email was sent using DB-only configuration.</p>
          <hr>
          <p><strong>Settings used:</strong></p>
          <ul>
            <li>From: ${settings.FromEmail}</li>
            <li>SMTP Host: ${settings.SmtpHost}</li>
            <li>SMTP Port: ${settings.SmtpPort}</li>
            <li>SMTP Secure: ${settings.SmtpSecure}</li>
          </ul>
          <p>Time: ${new Date().toISOString()}</p>
        `,
      });
      console.log('   ✓ Test email sent! MessageId:', result.messageId);
    } catch (error) {
      console.error('   ❌ Failed to send test email:', error.message);
      process.exit(1);
    }
  } else {
    console.log('\n4. Skipping test email send (no recipient provided)');
    console.log('   → Run with: node scripts/test-email-db-config.js your@email.com');
  }

  // 5. Summary of email notification settings
  console.log('\n5. Email notification settings:');
  console.log('   NotifyOnNewOrder:', settings.NotifyOnNewOrder ? '✓' : '✗');
  console.log('   NotifyOnOrderUpdate:', settings.NotifyOnOrderUpdate ? '✓' : '✗');
  console.log('   SendCustomerConfirmation:', settings.SendCustomerConfirmation ? '✓' : '✗');
  console.log('   SalesTeamEmails:', settings.SalesTeamEmails || '(not set)');
  console.log('   CCEmails:', settings.CCEmails || '(not set)');

  console.log('\n=== All checks passed ===');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
