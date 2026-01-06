import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function main() {
  const user = await prisma.users.findFirst({
    where: { OR: [{ LoginID: 'LimeAdmin' }, { Email: 'LimeAdmin' }] },
    select: { 
      ID: true, 
      LoginID: true, 
      Email: true, 
      Password: true, 
      PasswordHash: true, 
      UserType: true, 
      Status: true,
      MustResetPassword: true
    }
  })
  
  console.log('User found:', JSON.stringify(user, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2))
  
  if (user) {
    console.log('\nPassword check:')
    console.log('- Password field exists:', !!user.Password)
    console.log('- Password value:', user.Password)
    console.log('- UserType:', user.UserType)
    console.log('- UserType lowercase:', user.UserType?.toLowerCase())
    console.log('- Is Admin?:', user.UserType?.toLowerCase() === 'admin')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
