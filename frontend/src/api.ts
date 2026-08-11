async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status}: ${detail}`);
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
