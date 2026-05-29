import prisma from '@/lib/prisma'
import { safeDbQuery } from '@/lib/server/safe-db'

export async function getDashboardData(supabaseUserId: string) {
  const dbUserResult = await safeDbQuery(
    'dashboard.user',
    () => prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
      include: { profile: true, cvs: { where: { isActive: true }, take: 1 } },
    }),
    null,
    { retries: 1 }
  )

  const userId = dbUserResult.data?.id ?? ''

  if (!userId) {
    return {
      dbUser: dbUserResult.data,
      applicationStats: [],
      recentMatches: [],
      recentApplications: [],
      databaseUnavailable: !dbUserResult.ok,
    }
  }

  const [applicationStats, recentMatches, recentApplications] = await Promise.all([
    safeDbQuery(
      'dashboard.applicationStats',
      () => prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      []
    ),
    safeDbQuery(
      'dashboard.recentMatches',
      () => prisma.jobMatch.findMany({
        where: { userId },
        include: { jobListing: { include: { company: true } } },
        orderBy: { score: 'desc' },
        take: 5,
      }),
      []
    ),
    safeDbQuery(
      'dashboard.recentApplications',
      () => prisma.application.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      []
    ),
  ])

  return {
    dbUser: dbUserResult.data,
    applicationStats: applicationStats.data,
    recentMatches: recentMatches.data,
    recentApplications: recentApplications.data,
    databaseUnavailable: !dbUserResult.ok || !applicationStats.ok || !recentMatches.ok || !recentApplications.ok,
  }
}
