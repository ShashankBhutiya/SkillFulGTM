/** Servers and proxies can return HTML on failure; never leave a form stuck parsing it. */
export async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || data === null) {
    throw new Error(data?.error ?? `Request failed (${response.status}). Please try again.`);
  }
  return data;
}
