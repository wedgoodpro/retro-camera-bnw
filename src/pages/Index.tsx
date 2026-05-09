import { useState } from 'react';
import Camera from '@/components/Camera';
import Icon from '@/components/ui/icon';

export default function Index() {
  const [shotCount, setShotCount] = useState(0);
  const [justCaptured, setJustCaptured] = useState(false);

  const handleCapture = () => {
    setShotCount(prev => prev + 1);
    setJustCaptured(true);
    setTimeout(() => setJustCaptured(false), 2000);
  };

  return (
    <div
      className="min-h-screen grain"
      style={{ background: 'linear-gradient(160deg, #0e0b08 0%, #110e0a 50%, #0a0907 100%)' }}
    >
      {/* Header */}
      <header className="border-b border-copper/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #d4a054, #b87333 50%, #8a5a20)',
              boxShadow: '0 0 0 1px #7a4d18, 0 0 8px rgba(184,115,51,0.3)',
            }}
          >
            <Icon name="Aperture" size={14} className="text-black" />
          </div>
          <div>
            <h1 className="font-special text-copper text-lg tracking-widest leading-none">OBSCURA</h1>
            <p className="font-mono-film text-zinc-600 text-xs tracking-wider">VINTAGE CAMERA</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {justCaptured && (
            <span className="font-mono-film text-copper text-xs animate-fade-in">✦ СНЯТО</span>
          )}
        </div>
      </header>

      {/* Camera */}
      <main className="w-full">
        <Camera onCapture={handleCapture} />
      </main>

      {/* Footer */}
      <footer className="border-t border-copper/10 px-6 py-3 flex items-center justify-between mt-8">
        <span className="font-mono-film text-zinc-700 text-xs">© OBSCURA MCMXLVII</span>
        <div className="flex items-center gap-1">
          <Icon name="Zap" size={10} className="text-copper/30" />
          <span className="font-mono-film text-zinc-700 text-xs">B&W FILM</span>
        </div>
      </footer>
    </div>
  );
}