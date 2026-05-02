// T-21: ApiClient — Bearer token injection + 401 auto-refresh + retry

let _getToken: (() => string | null) | null = null
let _refreshToken: (() => Promise<string | null>) | null = null

export function initApiClient(
  getToken: () => string | null,
  refreshToken: () => Promise<string | null>,
): void {
  _getToken = getToken
  _refreshToken = refreshToken
}

async function withAuth(request: Request, token: string | null): Promise<Request> {
  if (!token) return request
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return new Request(request, { headers })
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = _getToken?.() ?? null
  let req = new Request(input, { credentials: 'include', ...init })
  req = await withAuth(req, token)

  let res = await fetch(req)

  if (res.status === 401 && _refreshToken) {
    const newToken = await _refreshToken()
    if (newToken) {
      req = new Request(input, { credentials: 'include', ...init })
      req = await withAuth(req, newToken)
      const retryHeaders = new Headers(req.headers)
      retryHeaders.set('X-Retry', '1')
      req = new Request(req, { headers: retryHeaders })
      res = await fetch(req)
    }
  }

  return res
}
