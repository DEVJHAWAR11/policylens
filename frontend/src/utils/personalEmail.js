export const PERSONAL_EMAIL_ERROR =
  'Access is restricted to personal email accounts only (Gmail, Hotmail, Outlook, etc.)';

export const allowedDomains = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'msn.com',
  'protonmail.com',
  'me.com',
  'mac.com',
];

export const getEmailDomain = (email = '') => email.split('@')[1]?.toLowerCase();

export const isPersonalEmailAllowed = (email = '') =>
  allowedDomains.includes(getEmailDomain(email));
