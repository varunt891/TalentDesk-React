import bcrypt from 'bcryptjs'
import { prisma } from './src/prisma.js'

async function resetPassword() {
  const email = process.argv[2]
  const newPassword = process.argv[3]

  if (!email || !newPassword) {
    console.log('Usage: node reset_password.js <email> <newPassword>')
    process.exit(1)
  }

  const normalizedEmail = email.trim().toLowerCase()
  const profile = await prisma.profile.findUnique({
    where: { email: normalizedEmail }
  })

  if (!profile) {
    console.error(`User with email "${normalizedEmail}" not found.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.profile.update({
    where: { email: normalizedEmail },
    data: { passwordHash }
  })

  console.log(`Successfully updated password for ${normalizedEmail}!`)
  process.exit(0)
}

resetPassword().catch(err => {
  console.error(err)
  process.exit(1)
})
