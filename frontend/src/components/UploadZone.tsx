import { useState, useRef, DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  accept?: string;
  label?: string;
  sublabel?: string;
}

export function UploadZone({ onFile, accept = '.pptx', label, sublabel }: Props) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`upload-zone ${dragover ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <div className="upload-icon">&#128196;</div>
      <h3>{label || 'PPTX-Datei hierher ziehen'}</h3>
      <p>{sublabel || 'oder klicken zum Auswählen'}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
