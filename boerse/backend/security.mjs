import { createHash, createHmac, randomBytes } from 'node:crypto';
export const token = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const bucket = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export function phone(value) {
  const result = String(value ?? '').replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(result)) throw new Error('Use the international phone format, e.g. +41791234567.');
  return result;
}
export function opaque(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Invalid or expired access details.');
  return value;
}
export function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Please check your details.');
  return value.trim();
}
export function eligible(member, invitation, invited) {
  if (!member || member.STATUS === 'blocked') return false;
  if (!invited) return member.STATUS === 'active';
  return member.STATUS === 'pending' && invitation && !invitation.USED_AT && !invitation.REVOKED_AT && new Date(invitation.EXPIRES_AT) > new Date();
}
export const cookie = (value, age) => `__Host-gugu_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export function sessionCookie(header = '') {
  const value = header.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-gugu_session='))?.split('=')[1];
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function publicMember(m) { return {id:m.ID, name:m.DISPLAY_NAME, role:m.ROLE}; }
