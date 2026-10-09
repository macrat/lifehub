/**
 * 外の配布元（気象庁・祝日の ics・Chromium のアーカイブ）を GET し、2xx でなければ投げる。
 * 取り直しはどれも「取れなければ何も書かずに投げ、手元の値を前回のまま残す」ので、失敗の扱いをここに揃える。
 */
export async function fetchOk(url: string, init?: { signal?: AbortSignal }): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}
