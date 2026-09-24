/**
 * 外の配布元（気象庁・祝日の ics）を GET し、2xx でなければ投げる。
 * 取り直しはどれも「取れなければ何も書かずに投げ、手元の値を前回のまま残す」ので、失敗の扱いをここに揃える。
 */
export async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}
