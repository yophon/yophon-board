export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * JSON API wrapper. Throws `ApiError` with the server-provided `{ error }`
 * message when available, so callers can surface meaningful errors instead
 * of a bare status code. `status` is 0 for network-level failures.
 */
export async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
  } catch {
    throw new ApiError(0, '网络连接失败')
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json() as { error?: unknown }
      if (typeof data?.error === 'string' && data.error) message = data.error
    } catch { /* non-JSON error body; keep the status text */ }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}
