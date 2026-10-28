export function pickRecorderMimeType(
  isTypeSupported: (type: string) => boolean,
): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => isTypeSupported(type)) ?? "";
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x80_00;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function startMicrophoneLevelMeter(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let frame = 0;

  const tick = () => {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    onLevel(Math.min(1, average / 80));
    frame = window.requestAnimationFrame(tick);
  };
  tick();

  return () => {
    window.cancelAnimationFrame(frame);
    audioContext.close().catch(() => undefined);
  };
}
