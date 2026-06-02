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

  const now = new Date()

  const [applicationStats, recentMatches, totalMatchCount, recentApplications, upcomingInterviews] = await Promise.all([
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
        where: { userId, score: { gte: 2.75 } },
        include: { jobListing: { include: { company: true } } },
        orderBy: { score: 'desc' },
        take: 5,
      }),
      []
    ),
    safeDbQuery(
      'dashboard.totalMatchCount',
      () => prisma.jobMatch.count({ where: { userId, score: { gte: 2.75 } } }),
      0
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
    safeDbQuery(
      'dashboard.upcomingInterviews',
      () => prisma.application.findMany({
        where: { userId, interviewAt: { gte: now } },
        orderBy: { interviewAt: 'asc' },
        take: 4,
      }),
      []
    ),
  ])

  return {
    dbUser: dbUserResult.data,
    applicationStats: applicationStats.data,
    recentMatches: recentMatches.data,
    totalMatchCount: totalMatchCount.data,
    recentApplications: recentApplications.data,
    upcomingInterviews: upcomingInterviews.data,
    databaseUnavailable:
      !dbUserResult.ok || !applicationStats.ok || !recentMatches.ok || !recentApplications.ok,
  }
}
