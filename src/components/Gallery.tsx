import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface Photo {
  id: string;
  data: string;
  timestamp: Date;
}

interface GalleryProps {
  photos: Photo[];
  onDelete: (id: string) => void;
}

export default function Gallery({ photos, onDelete }: GalleryProps) {
  const [selected, setSelected] = useState<Photo | null>(null);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const downloadPhoto = (photo: Photo) => {
    const a = document.createElement('a');
    a.href = photo.data;
    a.download = `obscura_${photo.id}.jpg`;
    a.click();
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ border: '2px dashed rgba(184,115,51,0.3)' }}
        >
          <Icon name="ImageOff" size={28} className="text-copper/30" />
        </div>
        <div className="text-center">
          <p className="font-special text-copper/40 text-sm tracking-widest">ПЛЁНКА ПУСТА</p>
          <p className="font-mono-film text-zinc-600 text-xs mt-1">Сделайте первый снимок</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Film strip header */}
      <div className="film-strip-border bg-zinc-950 py-1 mb-4">
        <div className="flex items-center justify-between px-4">
          <span className="font-mono-film text-copper/50 text-xs tracking-widest">
            КАДРОВ: {String(photos.length).padStart(3, '0')}
          </span>
          <span className="font-special text-copper/40 text-xs">OBSCURA FILM</span>
          <span className="font-mono-film text-copper/50 text-xs">ISO 400</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-1">
        {photos.map((photo, idx) => (
          <div
            key={photo.id}
            className="group relative cursor-pointer animate-fade-in"
            style={{ animationDelay: `${idx * 0.05}s` }}
            onClick={() => setSelected(photo)}
          >
            {/* Photo frame */}
            <div
              className="relative overflow-hidden"
              style={{
                background: '#111',
                border: '1px solid rgba(184,115,51,0.2)',
                padding: '6px 6px 20px 6px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}
            >
              <img
                src={photo.data}
                alt={`Снимок ${idx + 1}`}
                className="w-full object-cover photo-bw"
                style={{ aspectRatio: '4/3', display: 'block' }}
              />
              {/* Frame number */}
              <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center">
                <span className="font-mono-film text-copper/50 text-xs">
                  {String(idx + 1).padStart(2, '0')}
                </span>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-copper hover:text-black transition-all"
                  onClick={e => { e.stopPropagation(); downloadPhoto(photo); }}
                  title="Скачать"
                >
                  <Icon name="Download" size={14} />
                </button>
                <button
                  className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-red-800 transition-all"
                  onClick={e => { e.stopPropagation(); onDelete(photo.id); }}
                  title="Удалить"
                >
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            </div>

            {/* Date label */}
            <div className="mt-1 flex items-center justify-between px-1">
              <span className="font-mono-film text-zinc-600 text-xs">{formatDate(photo.timestamp)}</span>
              <span className="font-mono-film text-zinc-600 text-xs">{formatTime(photo.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="relative max-w-2xl w-full animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Polaroid frame */}
            <div
              style={{
                background: '#111',
                border: '1px solid rgba(184,115,51,0.3)',
                padding: '12px 12px 48px 12px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
              }}
            >
              <img
                src={selected.data}
                alt="Просмотр"
                className="w-full object-cover photo-bw"
                style={{ display: 'block' }}
              />
              <div className="absolute bottom-3 left-0 right-0 flex items-center justify-between px-5">
                <span className="font-special text-copper/50 text-sm">OBSCURA</span>
                <span className="font-mono-film text-copper/40 text-xs">
                  {formatDate(selected.timestamp)} {formatTime(selected.timestamp)}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="absolute -top-12 right-0 flex gap-2">
              <button
                className="px-3 py-1.5 flex items-center gap-1.5 text-copper/70 hover:text-copper transition-colors font-mono-film text-xs border border-copper/30 hover:border-copper/60"
                onClick={() => downloadPhoto(selected)}
              >
                <Icon name="Download" size={12} />
                СКАЧАТЬ
              </button>
              <button
                className="px-3 py-1.5 flex items-center gap-1.5 text-red-700/70 hover:text-red-500 transition-colors font-mono-film text-xs border border-red-900/30 hover:border-red-700/60"
                onClick={() => { onDelete(selected.id); setSelected(null); }}
              >
                <Icon name="Trash2" size={12} />
                УДАЛИТЬ
              </button>
              <button
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-700"
                onClick={() => setSelected(null)}
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
