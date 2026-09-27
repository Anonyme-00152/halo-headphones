// Animated visuals: MP4 videos (WebCodecs H.264 + mp4-muxer) and the hero Lottie frames.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// Render `frames` canvases from drawFrame(p) and encode them as an H.264 MP4 blob.
export async function encodeMp4({ w, h, duration, fps = 30, drawFrame, onProgress = () => {} }) {
  const n = Math.round(duration * fps);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => (failure = e) });
  encoder.configure({ codec: 'avc1.640028', width: w, height: h, bitrate: 7_000_000, framerate: fps });
  for (let i = 0; i < n; i++) {
    if (failure) throw failure;
    const canvas = drawFrame(i / (n - 1));
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 5));
    onProgress(i + 1, n);
  }
  await encoder.flush();
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// Replace every frame of the original Lottie (same structure, timing and size) with new renders.
export async function rebuildLottie({ original, drawFrame, quality = 0.72, onProgress = () => {} }) {
  const json = JSON.parse(JSON.stringify(original));
  const images = json.assets.filter(a => typeof a.p === 'string' && a.p.startsWith('data:'));
  for (let i = 0; i < images.length; i++) {
    const canvas = drawFrame(i / (images.length - 1), images[i].w, images[i].h);
    images[i].p = canvas.toDataURL('image/webp', quality);
    onProgress(i + 1, images.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return new Blob([JSON.stringify(json)], { type: 'application/json' });
}
