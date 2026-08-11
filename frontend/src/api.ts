async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data === 'string') {
        msg = data;
      } else if (data && typeof data === 'object') {
        msg = data.error?.message || data.error || data.message || JSON.stringify(data);
      }
    } catch {
      try {
        const text = await res.text();
        if (text) msg = text;
      } catch {
        /* ignore */
      }
    }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<T>;
}

export const api = {
  get<T>(p: string): Promise<T> {
    return fetch(p).then((r) => j<T>(r));
  },
  post<T>(p: string, body?: unknown): Promise<T> {
    return fetch(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => j<T>(r));
  },
  put<T>(p: string, body?: unknown): Promise<T> {
    return fetch(p, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => j<T>(r));
  },
  del<T>(p: string): Promise<T> {
    return fetch(p, { method: 'DELETE' }).then((r) => j<T>(r));
  },
};
