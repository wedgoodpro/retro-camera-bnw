import { useState } from 'react';
import Camera from '@/components/Camera';
import Gallery from '@/components/Gallery';
import Icon from '@/components/ui/icon';

interface Photo {
  id: string;
  data: string;
  timestamp: Date;
}

type Tab = 'camera' | 'gallery';

export default function Index() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('camera');
  const [justCaptured, setJustCaptured] = useState(false);

  const handleCapture = (data: string) => {
    const photo: Photo = {
      id: Date.now().toString(),
      data,
      timestamp: new Date(),
    };
    setPhotos(prev => [photo, ...prev]);
    setJustCaptured(true);
    setTimeout(() => setJustCaptured(false), 2000);
  };

  const handleDelete = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div
      className="min-h-screen grain"
      style={{
        background: 'linear-gradient(160deg, #0e0b08 0%, #110e0a 50%, #0a0907 100%)',
      }}
    >
      {/* Header */}
      <header className="border-b border-copper/20 px-6 py-3 flex items-center justify-between">
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

        <div className="flex items-center gap-4">
          {justCaptured && (
            <span className="font-mono-film text-copper text-xs animate-fade-in">
              ✦ СНЯТО
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-copper/60" />
            <span className="font-mono-film text-zinc-500 text-xs">{photos.length} кадров</span>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-copper/10 flex">
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex items-center gap-2 px-6 py-3 font-mono-film text-xs tracking-widest transition-all border-b-2 ${
            activeTab === 'camera'
              ? 'border-copper text-copper'
              : 'border-transparent text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <Icon name="Camera" size={14} />
          КАМЕРА
        </button>
        <button
          onClick={() => setActiveTab('gallery')}
          className={`flex items-center gap-2 px-6 py-3 font-mono-film text-xs tracking-widest transition-all border-b-2 relative ${
            activeTab === 'gallery'
              ? 'border-copper text-copper'
              : 'border-transparent text-zinc-600 hover:text-zinc-400'
          }`}
        >
          <Icon name="Film" size={14} />
          ГАЛЕРЕЯ
          {photos.length > 0 && (
            <span
              className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center font-mono-film text-black"
              style={{ background: 'var(--copper)', fontSize: '9px' }}
            >
              {photos.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {activeTab === 'camera' && (
          <div className="animate-fade-in">
            <Camera onCapture={handleCapture} />

            {photos.length > 0 && (
              <div className="mt-6 border-t border-copper/10 pt-4">
                <p className="font-mono-film text-zinc-600 text-xs text-center mb-3 tracking-widest">
                  ПОСЛЕДНИЕ СНИМКИ
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.slice(0, 5).map((photo, i) => (
                    <div
                      key={photo.id}
                      className="flex-shrink-0 cursor-pointer"
                      style={{ padding: '3px 3px 10px 3px', background: '#111', border: '1px solid rgba(184,115,51,0.15)' }}
                      onClick={() => setActiveTab('gallery')}
                    >
                      <img
                        src={photo.data}
                        alt={`Снимок ${i + 1}`}
                        className="photo-bw object-cover"
                        style={{ width: 72, height: 54, display: 'block' }}
                      />
                    </div>
                  ))}
                  {photos.length > 5 && (
                    <button
                      className="flex-shrink-0 w-20 h-16 flex items-center justify-center border border-copper/20 font-mono-film text-copper/40 text-xs"
                      onClick={() => setActiveTab('gallery')}
                    >
                      +{photos.length - 5}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'gallery' && (
          <div className="animate-fade-in">
            <Gallery photos={photos} onDelete={handleDelete} />
          </div>
        )}
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
