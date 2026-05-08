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
  const [isoValue] = useState(400);
  const [aperture] = useState('f/2.8');
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

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrasted = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128));
        const noise = (Math.random() - 0.5) * 50;
        const final = Math.min(255, Math.max(0, contrasted + noise));
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
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
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
    <div className="flex flex-col items-center gap-0">
      {/* Camera body top */}
      <div className="w-full max-w-2xl leather-bg rounded-t-2xl px-6 pt-4 pb-2 flex items-center justify-between border-t border-x border-copper/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 border border-zinc-500" />
          </div>
          <span className="font-special text-copper text-xl tracking-widest">OBSCURA</span>
        </div>
        <div className="font-mono-film text-xs text-copper/60 flex flex-col items-end gap-0.5">
          <span>ISO {isoValue}</span>
          <span>{aperture}</span>
        </div>
      </div>

      {/* Viewfinder area */}
      <div className="w-full max-w-2xl leather-bg border-x border-copper/30 px-4 pb-2">
        <div
          className="viewfinder crosshair relative w-full rounded overflow-hidden"
          style={{ aspectRatio: '4/3', background: '#000' }}
        >
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-20 animate-shutter-flash pointer-events-none" />
          )}

          <video ref={videoRef} className="hidden" playsInline muted />

          <canvas
            ref={previewCanvasRef}
            className="w-full h-full object-cover"
            style={{ display: isStreaming ? 'block' : 'none' }}
          />

          {!isStreaming && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
              <div className="w-16 h-16 rounded-full border-2 border-copper/40 flex items-center justify-center">
                <Icon name="Camera" size={28} className="text-copper/50" />
              </div>
              <p className="font-special text-copper/50 text-sm tracking-widest">ОБЪЕКТИВ ЗАКРЫТ</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
              <Icon name="CameraOff" size={32} className="text-red-700/70" />
              <p className="font-mono-film text-red-700/70 text-xs text-center px-4">{error}</p>
            </div>
          )}

          {isStreaming && (
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-copper/70" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-copper/70" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-copper/70" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-copper/70" />

              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-600 animate-blink" />
                <span className="font-mono-film text-xs text-white/70">REC</span>
              </div>

              <div className="absolute bottom-2 left-0 right-0 px-4 flex items-center justify-between">
                <span className="font-mono-film text-xs text-copper/60">{time}</span>
                <span className="font-mono-film text-xs text-copper/60">
                  {String(shotCount).padStart(3, '0')} / 036
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Camera body bottom — controls */}
      <div className="w-full max-w-2xl leather-bg rounded-b-2xl px-6 pt-3 pb-5 flex items-center justify-between border-b border-x border-copper/30">
        {/* Left — film strip decoration */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-3 h-1.5 rounded-sm bg-zinc-800 border border-zinc-700" />
            ))}
          </div>
          <span className="font-mono-film text-copper/40 text-xs">FILM</span>
        </div>

        {/* Center — shutter */}
        <div className="flex flex-col items-center gap-2">
          {isStreaming ? (
            <button
              onClick={capturePhoto}
              className="shutter-btn w-16 h-16 rounded-full cursor-pointer"
              title="Снять фото"
            />
          ) : (
            <button
              onClick={startCamera}
              className="w-16 h-16 rounded-full cursor-pointer flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle at 35% 35%, #6b6b6b, #3a3a3a 50%, #1a1a1a)',
                border: '2px solid #555',
                boxShadow: '0 0 0 4px #1a1a1a, 0 0 0 6px #555, 0 4px 16px rgba(0,0,0,0.8)',
              }}
              title="Включить камеру"
            >
              <Icon name="Power" size={22} className="text-copper/80" />
            </button>
          )}
          <span className="font-mono-film text-copper/50 text-xs tracking-widest">
            {isStreaming ? 'СНЯТЬ' : 'ВКЛ'}
          </span>
        </div>

        {/* Right — stop button */}
        <div className="flex flex-col items-end gap-1.5">
          {isStreaming && (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1 text-copper/40 hover:text-copper/70 transition-colors"
              title="Закрыть камеру"
            >
              <Icon name="X" size={12} />
              <span className="font-mono-film text-xs">СТОП</span>
            </button>
          )}
          <div className="w-6 h-6 rounded-full border border-zinc-700 bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}
