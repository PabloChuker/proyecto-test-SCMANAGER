// =============================================================================
// AL FILO — Prisma Client Singleton
// Importá desde cualquier API route: import { prisma } from '@/lib/prisma'
//
// En desarrollo, Next.js hace hot-reload que crearía múltiples instancias
// de PrismaClient. Este patrón guarda la instancia en globalThis para
// reutilizarla entre reloads.
// =============================================================================

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
