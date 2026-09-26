/** 気温の表示（"26°"）。予報に無いときは "—" */
export function formatTemp(temp: number | null): string {
  return temp === null ? '—' : `${temp}°`;
}
