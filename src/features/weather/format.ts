/** 気温の表示（"26°"）。予報に無いときは "—" */
export function formatTemp(temp: number | null): string {
  return temp === null ? '—' : `${temp}°`;
}

/** 降水確率の表示（"30%"）。予報に無いときは "—" */
export function formatPop(pop: number | null): string {
  return pop === null ? '—' : `${pop}%`;
}
