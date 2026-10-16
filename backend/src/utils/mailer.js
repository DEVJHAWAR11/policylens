import axios from 'axios';
import { isProd } from '../config/env.js';

// Sends the password-reset code. Uses Resend (https://resend.com) when
// RESEND_API_KEY is set. In development without a key the code is printed to
// the console; in production without a key nothing is logged (codes are secrets).
export async function sendResetCodeEmail(to, code) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (isProd) {
      console.error('[mailer] RESEND_API_KEY not set — password reset email NOT sent.');
    } else {
      console.log(`[mailer:dev] Password reset code for ${to}: ${code}`);
    }
    return false;
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.MAIL_FROM || 'PolicyLens <onboarding@resend.dev>',
        to: [to],
        subject: 'Your PolicyLens password reset code',
        text: `Your PolicyLens password reset code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }
    );
    return true;
  } catch (err) {
    console.error('[mailer] Failed to send reset email:', err.response?.data || err.message);
    return false;
  }
}
