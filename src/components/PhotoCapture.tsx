import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Camera, Upload } from 'lucide-react';

interface PhotoCaptureProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ onSave, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreviewUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (previewUrl) {
      onSave(previewUrl);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Add Photo</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">
          {previewUrl ? (
            <div className="space-y-4">
              <div className="border border-border rounded-lg overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Selected photo"
                  className="w-full h-auto max-h-64 object-contain"
                />
              </div>
              <Button
                variant="outline"
                onClick={triggerFileInput}
                className="w-full flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Choose Different Photo
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Select a photo to attach to your thought
                </p>
                <Button onClick={triggerFileInput} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Choose Photo
                </Button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!previewUrl}
            className="flex-1 flex items-center gap-1"
          >
            <Save className="h-3 w-3" />
            Save Photo
          </Button>
        </div>
      </div>
    </div>
  );
};