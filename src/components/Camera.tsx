import { useRef, useState, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';

interface CameraProps {
  onCapture: (photoData: string) => void;
}

export default function Camera({ onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const startPreviewLoop = useCallback((video: HTMLVideoElement) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const render = () => {
      if (video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // Matte curve: black point lifted to 30, white point pulled to 220
      const blackPoint = 30;
      const whitePoint = 220;
      const range = whitePoint - blackPoint;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // High contrast S-curve
        const contrasted = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128));
        // Apply matte: remap 0–255 → blackPoint–whitePoint
        const matte = blackPoint + (contrasted / 255) * range;
        // Film grain
        const noise = (Math.random() - 0.5) * 40;
        const final = Math.min(255, Math.max(0, matte + noise));
        data[i] = final;
        data[i + 1] = final;
        data[i + 2] = final;
      }
      ctx.putImageData(imageData, 0, 0);
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  }, []);

  const stopPreviewLoop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1920 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.onloadedmetadata = () => {
          startPreviewLoop(videoRef.current!);
        };
        setIsStreaming(true);
        setError(null);
      }
    } catch {
      setError('Нет доступа к камере');
    }
  }, [startPreviewLoop]);

  const stopCamera = useCallback(() => {
    stopPreviewLoop();
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      setIsStreaming(false);
    }
  }, [stopPreviewLoop]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const capturePhoto = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !isStreaming) return;
    const photoData = canvas.toDataURL('image/jpeg', 0.92);
    const link = document.createElement('a');
    link.href = photoData;
    link.download = `obscura_${Date.now()}.jpg`;
    link.click();
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 300);
    setShotCount(prev => prev + 1);
    onCapture(photoData);
  }, [isStreaming, onCapture]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 'calc(100dvh - 45px)', background: '#000' }}
    >
      {/* Flash */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white z-30 animate-shutter-flash pointer-events-none" />
      )}

      {/* Hidden video */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Live canvas — fills full area */}
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: isStreaming ? 'block' : 'none' }}
      />

      {/* Idle */}
      {!isStreaming && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
          <div className="w-20 h-20 rounded-full border-2 border-copper/40 flex items-center justify-center">
            <Icon name="Camera" size={36} className="text-copper/50" />
          </div>
          <p className="font-special text-copper/50 text-sm tracking-widest">ОБЪЕКТИВ ЗАКРЫТ</p>
          <button
            onClick={startCamera}
            className="mt-4 px-8 py-3 font-mono-film text-xs tracking-widest text-black"
            style={{
              background: 'linear-gradient(135deg, #d4a054, #b87333)',
              border: '1px solid #8a5a20',
            }}
          >
            ВКЛЮЧИТЬ
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
          <Icon name="CameraOff" size={32} className="text-red-700/70" />
          <p className="font-mono-film text-red-700/70 text-xs text-center px-8">{error}</p>
        </div>
      )}

      {/* HUD — top */}
      {isStreaming && (
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          {/* Top gradient fade */}
          <div
            className="w-full h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)' }}
          />
          <div className="absolute top-3 left-0 right-0 px-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-blink" />
              <span className="font-mono-film text-xs text-white/70">REC</span>
            </div>
            <span className="font-mono-film text-xs text-copper/70">{time}</span>
            <span className="font-mono-film text-xs text-copper/60">
              {String(shotCount).padStart(3, '0')} / 036
            </span>
          </div>

          {/* Corner brackets */}
          <div className="absolute top-10 left-5 w-7 h-7 border-t-2 border-l-2 border-copper/60" />
          <div className="absolute top-10 right-5 w-7 h-7 border-t-2 border-r-2 border-copper/60" />
        </div>
      )}

      {/* Bottom corner brackets */}
      {isStreaming && (
        <div className="absolute bottom-28 left-0 right-0 z-10 pointer-events-none">
          <div className="absolute bottom-0 left-5 w-7 h-7 border-b-2 border-l-2 border-copper/60" />
          <div className="absolute bottom-0 right-5 w-7 h-7 border-b-2 border-r-2 border-copper/60" />
        </div>
      )}

      {/* Bottom controls — over the viewfinder */}
      {isStreaming && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)' }}
        >
          <div className="flex items-center justify-between px-8 pb-8 pt-12">
            {/* Counter */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-2.5 h-1 rounded-sm bg-zinc-700 border border-zinc-600" />
                ))}
              </div>
              <span className="font-mono-film text-copper/40 text-xs">FILM</span>
            </div>

            {/* Shutter */}
            <button
              onClick={capturePhoto}
              className="shutter-btn w-20 h-20 rounded-full cursor-pointer"
              title="Снять фото"
            />

            {/* Stop */}
            <button
              onClick={stopCamera}
              className="flex flex-col items-center gap-1 text-copper/40 hover:text-copper/70 transition-colors"
            >
              <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center">
                <Icon name="X" size={16} className="text-zinc-500" />
              </div>
              <span className="font-mono-film text-xs text-zinc-600">СТОП</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}