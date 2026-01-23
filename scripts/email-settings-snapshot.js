require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const mask = (v) => (v ? `***${String(v).slice(-4)}` : null);

(async () => {
  try {
    const row = await prisma.emailSettings.findFirst();
    console.log('emailSettings:', row ? { ...row, SmtpPassword: mask(row.SmtpPassword) } : null);

    const env = {
      NODE_ENV: process.env.NODE_ENV || null,
      SMTP_HOST: process.env.SMTP_HOST || null,
      SMTP_PORT: process.env.SMTP_PORT || null,
      SMTP_USER: process.env.SMTP_USER || null,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD ? '[set]' : null,
      SMTP_SECURE: process.env.SMTP_SECURE || null,
      EMAIL_FROM: process.env.EMAIL_FROM || null,
      EMAIL_SALES: process.env.EMAIL_SALES || null,
      EMAIL_CC: process.env.EMAIL_CC || null,
    };
    console.log('env:', env);

    const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST;
    console.log('sendMailWithConfig disabled by isBuildTime:', isBuildTime);

    const dbSmtpUsable = row?.SmtpHost && row?.SmtpUser && row?.SmtpPassword;
    const envSmtpUsable = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD;
    console.log('DB SMTP usable:', !!dbSmtpUsable);
    console.log('ENV SMTP usable:', !!envSmtpUsable);
  } catch (error) {
    console.error('snapshot error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
