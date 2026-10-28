import jwt from 'jsonwebtoken'
import { createHmac } from 'node:crypto'

function secret(profile) {
  return createHmac('sha256', process.env.JWT_SECRET).update(`password-reset:${profile.id}:${profile.passwordHash || ''}:${profile.token_version || 0}`).digest('hex')
}
// This token must only be delivered through a verified recovery channel.
// The public forgot-password endpoint never returns or logs it.
export function createPasswordResetToken(profile) {
  return jwt.sign({ sub: profile.id, purpose: 'reset-password' }, secret(profile), { expiresIn: '30m' })
}
export function verifyPasswordResetToken(token, profile) {
  const payload = jwt.verify(token, secret(profile), { algorithms: ['HS256'] })
  if (payload.purpose !== 'reset-password' || payload.sub !== profile.id) throw new Error('Invalid reset token')
  return payload
}
