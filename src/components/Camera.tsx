import { useRef, useState, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: string }>;
}

interface CameraProps {
  onCapture: (photoData: string) => void;
}

// Переиспользуемый буфер LUT — не создаём новый массив при каждом вызове
const lutBuffer = new Uint8ClampedArray(256);

function buildLUT(contrastMult: number, expShift: number): Uint8ClampedArray {
  const blackPoint = 55;
  const whitePoint = 210;
  const range = whitePoint - blackPoint;
  for (let g = 0; g < 256; g++) {
    const t = g / 255;
    const soft = t + (contrastMult - 1) * 0.5 * Math.sin(Math.PI * t) * (t - 0.5);
    const shadowed = soft < 0.75 ? Math.pow(soft / 0.75, 2.0) * 0.75 : soft;
    const contrasted = Math.min(255, Math.max(0, shadowed * 255));
    const matte = blackPoint + (contrasted / 255) * range;
    lutBuffer[g] = Math.min(255, Math.max(0, matte + expShift));
  }
  return lutBuffer;
}

// Предгенерированный шум-массив — заполняется один раз, используется циклически
const NOISE_SIZE = 65536;
const noiseTable = new Float32Array(NOISE_SIZE);
for (let i = 0; i < NOISE_SIZE; i++) {
  noiseTable[i] = (Math.random() - 0.5);
}

export default function Camera({ onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shotCount, setShotCount] = useState(0);

  // Слайдеры: state только для UI (слайдер), ref — для render loop
  const [exposure, setExposure] = useState(0);
  const exposureRef = useRef(0);
  const [contrast, setContrast] = useState(-100);
  const contrastRef = useRef(-100);
  const [grain, setGrain] = useState(100);
  const grainRef = useRef(100);

  const [exposureLocked, setExposureLocked] = useState(false);
  const exposureLockedRef = useRef(false);
  const lockedBrightnessRef = useRef<number | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const expRangeRef = useRef<{ min: number; max: number; step: number } | null>(null);
  const capturePhotoRef = useRef<() => void>(() => {});
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);

  // Позиция в таблице шума — инкрементируется per-pixel
  const noiseIdxRef = useRef(0);

  useEffect(() => {
    const beforeHandler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    const installedHandler = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', beforeHandler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const startPreviewLoop = useCallback((video: HTMLVideoElement) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let lastContrast = contrastRef.current;
    let lastExposure = exposureRef.current;
    let lut = buildLUT(3.8 + lastContrast * 0.02, lastExposure * 0.8);
    let ready = false;

    const render = () => {
      if (!ready) {
        if (video.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(render);
          return;
        }
        ready = true;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Замер яркости (каждый 16-й пиксель = каждые 64 байта)
      let sum = 0, count = 0;
      for (let i = 0; i < data.length; i += 64) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        count++;
      }
      const avgBrightness = sum / count;

      // AE-L
      let brightnessOffset = 0;
      if (exposureLockedRef.current) {
        if (lockedBrightnessRef.current === null) {
          lockedBrightnessRef.current = avgBrightness;
        }
        brightnessOffset = lockedBrightnessRef.current - avgBrightness;
      } else {
        lockedBrightnessRef.current = null;
      }

      // Перестраиваем LUT только при изменении контролов
      const curContrast = contrastRef.current;
      const curExposure = exposureRef.current;
      if (curContrast !== lastContrast || curExposure !== lastExposure) {
        lastContrast = curContrast;
        lastExposure = curExposure;
        lut = buildLUT(3.8 + curContrast * 0.02, curExposure * 0.8);
      }

      const grainAmp = grainRef.current * 0.8;
      let ni = noiseIdxRef.current;

      // Применяем LUT + шум из предгенерированной таблицы
      for (let i = 0; i < data.length; i += 4) {
        const gray = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
        const noise = noiseTable[ni & (NOISE_SIZE - 1)] * grainAmp;
        ni++;
        const final = Math.min(255, Math.max(0, lut[gray] + noise + brightnessOffset));
        data[i] = final;
        data[i + 1] = final;
        data[i + 2] = final;
      }
      noiseIdxRef.current = ni & (NOISE_SIZE - 1);

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
        const track = stream.getVideoTracks()[0];
        videoTrackRef.current = track;
        const caps = track.getCapabilities() as Record<string, { min?: number; max?: number; step?: number }>;
        if (caps.exposureCompensation) {
          expRangeRef.current = {
            min: caps.exposureCompensation.min ?? -3,
            max: caps.exposureCompensation.max ?? 3,
            step: caps.exposureCompensation.step ?? 0.1,
          };
        }
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
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setIsStreaming(false);
    }
  }, [stopPreviewLoop]);

  useEffect(() => { startCamera(); }, [startCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const capturePhoto = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !isStreaming) return;
    const photoData = canvas.toDataURL('image/jpeg', 0.92);
    const link = document.createElement('a');
    link.href = photoData;
    link.download = `obscura_${Date.now()}.jpg`;
    link.click();
    setIsFlashing(true);
    const t = setTimeout(() => setIsFlashing(false), 300);
    setShotCount(prev => prev + 1);
    onCapture(photoData);
    return () => clearTimeout(t);
  }, [isStreaming, onCapture]);

  capturePhotoRef.current = capturePhoto;

  // sliderBg через CSS custom property — не строит строку при каждом рендере
  const sliderStyle = (val: number, min: number, max: number): React.CSSProperties => ({
    '--slider-pct': `${((val - min) / (max - min)) * 100}%`,
    accentColor: '#b87333',
  } as React.CSSProperties);

  return (
    <div
      className="flex flex-col w-full"
      style={{ height: 'calc(100dvh - 45px)', background: '#000' }}
    >
      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">

        {isFlashing && (
          <div className="absolute inset-0 bg-white z-30 animate-shutter-flash pointer-events-none" />
        )}

        <video ref={videoRef} className="hidden" playsInline muted />

        <canvas
          ref={previewCanvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ display: isStreaming ? 'block' : 'none', background: '#000' }}
        />

        {!isStreaming && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
            <Icon name="Loader" size={28} className="text-copper/40 animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
            <Icon name="CameraOff" size={28} className="text-red-700/50" />
            <p className="font-mono-film text-red-700/70 text-xs text-center px-8">{error}</p>
          </div>
        )}

        {/* Focus circle */}
        {isStreaming && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div
              style={{
                width: 80, height: 80,
                borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.25)',
                position: 'relative',
              }}
            >
              {(['tl','tr','bl','br'] as const).map(pos => (
                <div
                  key={pos}
                  style={{
                    position: 'absolute',
                    width: 10, height: 10,
                    top: pos.startsWith('t') ? 4 : undefined,
                    bottom: pos.startsWith('b') ? 4 : undefined,
                    left: pos.endsWith('l') ? 4 : undefined,
                    right: pos.endsWith('r') ? 4 : undefined,
                    borderTop: pos.startsWith('t') ? '1.5px solid rgba(255,255,255,0.5)' : undefined,
                    borderBottom: pos.startsWith('b') ? '1.5px solid rgba(255,255,255,0.5)' : undefined,
                    borderLeft: pos.endsWith('l') ? '1.5px solid rgba(255,255,255,0.5)' : undefined,
                    borderRight: pos.endsWith('r') ? '1.5px solid rgba(255,255,255,0.5)' : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* HUD — top */}
        {isStreaming && (
          <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
            <div
              className="w-full h-20 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)' }}
            />
            <div className="absolute top-3 left-0 right-0 px-5 flex items-center justify-between">
              <div className="w-10" />
              <a
                href="https://vk.com/fotoklubpro"
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto"
              >
                <span className="font-mono-film text-copper/40 text-xs">УРОКИ ФОТОГРАФИИ</span>
              </a>
              {!installed && (
                <button
                  className="pointer-events-auto flex items-center gap-1"
                  onClick={() => {
                    if (installPrompt) {
                      (installPrompt as BeforeInstallPromptEvent).prompt();
                      (installPrompt as BeforeInstallPromptEvent).userChoice.then(() => setInstallPrompt(null));
                    } else {
                      alert('Чтобы установить: нажми "Поделиться" → "На экран Домой" (iOS) или меню ⋮ → "Добавить на экран" (Android)');
                    }
                  }}
                >
                  <Icon name="Download" size={11} className="text-copper/60" />
                  <span className="font-mono-film text-xs text-copper/60">УСТАНОВИТЬ</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Bottom panel */}
      <div
        className="w-full flex-shrink-0"
        style={{ background: '#000', borderTop: '1px solid rgba(184,115,51,0.15)' }}
      >
        {isStreaming ? (
          <>
            {/* Shutter */}
            <div className="flex items-center justify-center px-8 pt-4 pb-2">
              <button
                onClick={capturePhoto}
                className="shutter-btn w-14 h-14 rounded-full cursor-pointer"
                title="Снять фото"
              />
            </div>

            {/* Exposure */}
            <div className="flex flex-col items-center gap-1 px-10 pt-2 pb-1">
              <div className="flex items-center gap-3 w-full">
                <Icon name="Sun" size={12} className="text-copper/40 flex-shrink-0" />
                <div className="relative flex-1">
                  <input
                    type="range" min={-100} max={100} value={exposure}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setExposure(v);
                      const track = videoTrackRef.current;
                      const range = expRangeRef.current;
                      if (track && range) {
                        const mapped = range.min + ((v + 100) / 200) * (range.max - range.min);
                        const stepped = Math.round(mapped / range.step) * range.step;
                        track.applyConstraints({ advanced: [{ exposureCompensation: stepped } as MediaTrackConstraintSet] }).catch(() => {});
                      } else {
                        exposureRef.current = v;
                      }
                    }}
                    className="w-full h-0.5 appearance-none cursor-pointer slider-copper"
                    style={sliderStyle(exposure, -100, 100)}
                  />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2 bg-copper/40 pointer-events-none" />
                </div>
                <Icon name="Sun" size={16} className="text-copper/70 flex-shrink-0" />
              </div>
              <span className="font-mono-film text-copper/40 text-xs tracking-widest">ЭКСПОЗИЦИЯ</span>
            </div>

            {/* Grain */}
            <div className="flex flex-col items-center gap-1 px-10 pt-2 pb-1">
              <div className="flex items-center gap-3 w-full">
                <Icon name="Sparkles" size={12} className="text-copper/40 flex-shrink-0" />
                <div className="relative flex-1">
                  <input
                    type="range" min={0} max={200} value={grain}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setGrain(v);
                      grainRef.current = v;
                    }}
                    className="w-full h-0.5 appearance-none cursor-pointer slider-copper"
                    style={sliderStyle(grain, 0, 200)}
                  />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2 bg-copper/40 pointer-events-none" />
                </div>
                <Icon name="Sparkles" size={16} className="text-copper/70 flex-shrink-0" />
              </div>
              <span className="font-mono-film text-copper/40 text-xs tracking-widest">ШУМ</span>
            </div>

            {/* Contrast */}
            <div className="flex flex-col items-center gap-1 px-10 pt-2 pb-4">
              <div className="flex items-center gap-3 w-full">
                <Icon name="Circle" size={12} className="text-copper/40 flex-shrink-0" />
                <div className="relative flex-1">
                  <input
                    type="range" min={-100} max={100} value={contrast}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setContrast(v);
                      contrastRef.current = v;
                    }}
                    className="w-full h-0.5 appearance-none cursor-pointer slider-copper"
                    style={sliderStyle(contrast, -100, 100)}
                  />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2 bg-copper/40 pointer-events-none" />
                </div>
                <Icon name="Contrast" size={16} className="text-copper/70 flex-shrink-0" />
              </div>
              <span className="font-mono-film text-copper/40 text-xs tracking-widest">КОНТРАСТ</span>
            </div>
          </>
        ) : (
          <div className="h-16" />
        )}
      </div>
    </div>
  );
}
