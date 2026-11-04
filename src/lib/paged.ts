// PostgREST returns at most 1000 rows per request, so a plain select over the
// tournaments table silently stops at the first 1000 (issue #33). This walks
// the table page by page until a short page comes back.

export const PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

export async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => PageResult<T>,
  pageSize = PAGE_SIZE
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { data: rows, error }

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { data: rows, error: null }
  }
}
