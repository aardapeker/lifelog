/** Reads a Server-Sent Events stream and calls onData with each parsed `data:` JSON payload. */
export async function readSSE(body: ReadableStream<Uint8Array>, onData: (data: any) => void): Promise<void> {
  const reader = (body as unknown as ReadableStream<BufferSource>).pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');

    // events are separated by a blank line
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') onData(JSON.parse(payload));
      }
    }
  }
}
