import { swedishJobSourceLinks } from './sources'

export type { JobSource, JobSourceCategory } from './types'

/**
 * Compatibility wrapper for UI callers that need outbound search links.
 * Live job imports use aggregateSwedishJobs() from the same registry.
 */
export function generateJobSearchUrls(
  roles: string[],
  location: string,
  sectors: string[] = []
) {
  const liaOnly = roles.some((role) => /\b(lia|praktik|internship|trainee)\b/i.test(role))
  return swedishJobSourceLinks(roles, location, sectors, liaOnly)
}
