import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/cn';

export interface FileInputProps {
  value?: File | null;
  onChange: (file: File | null) => void;
  label?: string;
  error?: string | false;
  description?: string;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

/**
 * Generic file input component with drag-and-drop support and preview.
 * Designed to work with react-hook-form Controller:
 *   <Controller
 *     name="logo"
 *     control={control}
 *     render={({ field }) => <FileInput {...field} />}
 *   />
 */
export function FileInput({
  value,
  onChange,
  label,
  error,
  description,
  accept = 'image/*',
  maxSizeMB = 2,
  className,
}: FileInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview URL when component unmounts or previewUrl changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (file: File | null) => {
    if (!file) {
      onChange(null);
      setPreviewUrl(null);
      return;
    }

    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File size exceeds ${maxSizeMB}MB limit`);
      return;
    }

    // Validate file type
    if (accept && !file.type.match(accept.replace('*', '.*'))) {
      alert(`Invalid file type. Accepted: ${accept}`);
      return;
    }

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    // Always call onChange with the file
    onChange(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileChange(file);
  };

  const handleRemove = () => {
    onChange(null);
    setPreviewUrl(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
          {label}
        </label>
      )}

      <div
        className={cn(
          'relative flex min-h-[100px] cursor-pointer items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors',
          'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
          isDragging
            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
            : 'border-stone-300 hover:border-stone-400 dark:border-stone-600 dark:hover:border-stone-500',
          error && 'border-red-500 dark:border-red-500',
          (value || previewUrl) && 'border-solid p-2',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {previewUrl ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-32 max-w-full rounded object-contain"
            />
            <p className="text-xs text-stone-500">{value?.name}</p>
          </div>
        ) : value ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded bg-stone-100 dark:bg-stone-800">
              <svg
                className="h-8 w-8 text-stone-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-xs text-stone-500">{value.name}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <svg
              className="h-10 w-10 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div className="text-sm">
              <span className="font-medium text-stone-700 dark:text-stone-200">
                Click to upload
              </span>{' '}
              <span className="text-stone-500">or drag and drop</span>
            </div>
            <p className="text-xs text-stone-400">
              {accept.replace('*', '')} up to {maxSizeMB}MB
            </p>
          </div>
        )}

        {(value || previewUrl) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        description && <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}