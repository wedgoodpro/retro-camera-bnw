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
  const [exposure, setExposure] = useState(0); // -100..+100
  const exposureRef = useRef(0);
  const [focusState, setFocusState] = useState<'idle' | 'focusing' | 'focused'>('idle');

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
      // Exposure compensation: ±80px shift
      const expShift = exposureRef.current * 0.8;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // High contrast S-curve
        const contrasted = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128));
        // Apply matte: remap 0–255 → blackPoint–whitePoint
        const matte = blackPoint + (contrasted / 255) * range;
        // Exposure + film grain
        const noise = (Math.random() - 0.5) * 40;
        const final = Math.min(255, Math.max(0, matte + expShift + noise));
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
      setFocusState('idle');
    }
  }, [stopPreviewLoop]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const capturePhoto = useCallback(() => {
    const srcCanvas = previewCanvasRef.current;
    const container = srcCanvas?.parentElement;
    if (!srcCanvas || !isStreaming || !container) return;

    // Visible area on screen (what user actually sees via object-cover)
    const displayW = container.clientWidth;
    const displayH = container.clientHeight;
    const displayRatio = displayW / displayH;

    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;
    const srcRatio = srcW / srcH;

    // Compute the cropped region in source canvas coords (same as object-cover logic)
    let cropX = 0, cropY = 0, cropW = srcW, cropH = srcH;
    if (srcRatio > displayRatio) {
      // source wider than display — crop sides
      cropW = Math.round(srcH * displayRatio);
      cropX = Math.round((srcW - cropW) / 2);
    } else {
      // source taller than display — crop top/bottom
      cropH = Math.round(srcW / displayRatio);
      cropY = Math.round((srcH - cropH) / 2);
    }

    // Draw cropped region into an output canvas
    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const photoData = out.toDataURL('image/jpeg', 0.92);
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

      {/* Focus circle — center */}
      {isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              border: focusState === 'focused'
                ? '1.5px solid rgba(184,115,51,0.9)'
                : focusState === 'focusing'
                ? '1.5px solid rgba(255,255,255,0.6)'
                : '1.5px solid rgba(255,255,255,0.3)',
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              boxShadow: focusState === 'focused'
                ? '0 0 0 1px rgba(184,115,51,0.3), inset 0 0 0 1px rgba(184,115,51,0.15)'
                : 'none',
            }}
          >
            {/* Corner ticks inside circle */}
            {(['tl','tr','bl','br'] as const).map(pos => (
              <div
                key={pos}
                style={{
                  position: 'absolute',
                  width: 10,
                  height: 10,
                  top: pos.startsWith('t') ? 4 : undefined,
                  bottom: pos.startsWith('b') ? 4 : undefined,
                  left: pos.endsWith('l') ? 4 : undefined,
                  right: pos.endsWith('r') ? 4 : undefined,
                  borderTop: pos.startsWith('t') ? `1.5px solid ${focusState === 'focused' ? 'rgba(184,115,51,0.9)' : 'rgba(255,255,255,0.5)'}` : undefined,
                  borderBottom: pos.startsWith('b') ? `1.5px solid ${focusState === 'focused' ? 'rgba(184,115,51,0.9)' : 'rgba(255,255,255,0.5)'}` : undefined,
                  borderLeft: pos.endsWith('l') ? `1.5px solid ${focusState === 'focused' ? 'rgba(184,115,51,0.9)' : 'rgba(255,255,255,0.5)'}` : undefined,
                  borderRight: pos.endsWith('r') ? `1.5px solid ${focusState === 'focused' ? 'rgba(184,115,51,0.9)' : 'rgba(255,255,255,0.5)'}` : undefined,
                  transition: 'border-color 0.3s ease',
                }}
              />
            ))}
            {/* Focus locked indicator */}
            {focusState === 'focused' && (
              <span
                className="absolute font-mono-film"
                style={{ bottom: -18, fontSize: 9, color: 'rgba(184,115,51,0.9)', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
              >
                AF ✦ LOCK
              </span>
            )}
            {focusState === 'focusing' && (
              <span
                className="absolute font-mono-film animate-blink"
                style={{ bottom: -18, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}
              >
                FOCUS...
              </span>
            )}
          </div>
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
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 60%, transparent)' }}
        >
          {/* Exposure slider */}
          <div className="flex flex-col items-center gap-1 px-10 pt-10 pb-3">
            <div className="flex items-center gap-3 w-full">
              <Icon name="Sun" size={12} className="text-copper/40 flex-shrink-0" style={{ opacity: 0.4 }} />
              <div className="relative flex-1">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={exposure}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setExposure(v);
                    exposureRef.current = v;
                  }}
                  className="w-full h-0.5 appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgba(184,115,51,0.3) 0%, rgba(184,115,51,0.8) ${(exposure + 100) / 2}%, rgba(184,115,51,0.3) ${(exposure + 100) / 2}%, rgba(184,115,51,0.3) 100%)`,
                    accentColor: '#b87333',
                  }}
                />
                {/* Center tick */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2 bg-copper/40 pointer-events-none" />
              </div>
              <Icon name="Sun" size={16} className="text-copper/70 flex-shrink-0" />
            </div>
            <span className="font-mono-film text-copper/40 text-xs tracking-widest">
              {exposure > 0 ? `+${exposure}` : exposure} EV
            </span>
          </div>

          <div className="flex items-center justify-between px-8 pb-8 pt-1">
            {/* Film decoration */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-2.5 h-1 rounded-sm bg-zinc-700 border border-zinc-600" />
                ))}
              </div>
              <span className="font-mono-film text-copper/40 text-xs">FILM</span>
            </div>

            {/* Shutter — two-step */}
            <button
              onClick={() => {
                if (focusState === 'idle') {
                  setFocusState('focusing');
                  setTimeout(() => setFocusState('focused'), 600);
                } else if (focusState === 'focused') {
                  capturePhoto();
                  setFocusState('idle');
                }
              }}
              className="shutter-btn w-10 h-10 rounded-full cursor-pointer"
              title={focusState === 'idle' ? 'Фокусировка' : 'Снять фото'}
            />

            {/* Stop */}
            <button
              onClick={stopCamera}
              className="flex flex-col items-center gap-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center">
                <Icon name="X" size={13} className="text-zinc-500" />
              </div>
              <span className="font-mono-film text-xs text-zinc-600">СТОП</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}