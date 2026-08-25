export async function loadGzJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`no ${url}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const gzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b
  if (!gzip) {
    return JSON.parse(new TextDecoder().decode(buf)) as T
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('gzip unsupported')
  }
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  return JSON.parse(text) as T
}

export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`no ${url}`)
  return (await res.json()) as T
}
