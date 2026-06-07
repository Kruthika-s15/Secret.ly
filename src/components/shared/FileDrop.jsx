import { useCallback, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FileDrop({ onFile, accept, label, sublabel, preview, file, onClear }) {
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback(
    (files) => {
      if (files?.[0]) onFile(files[0]);
    },
    [onFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 transition-colors',
          drag && 'border-primary/60 bg-primary/5'
        )}
      >
        <input
          type="file"
          accept={accept}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">{label}</p>
        {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      {file && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">{preview}</div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-border p-2 hover:bg-muted"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
