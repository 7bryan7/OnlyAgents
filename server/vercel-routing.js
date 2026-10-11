// Vercel rewrites nested API paths to one concrete function. Carry the path
// explicitly because runtimes can expose either the original or rewritten URL.
export function restoreApiUrl(req) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.searchParams.get('__oa_path')
  url.searchParams.delete('__oa_path')
  if (url.pathname === '/api/index' && path !== null) {
    url.pathname = '/api/' + path
  }
  req.url = url.pathname + url.search
}
