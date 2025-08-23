import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Palette, Eraser } from 'lucide-react';

interface SketchCaptureProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export const SketchCapture: React.FC<SketchCaptureProps> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('hsl(var(--primary))');
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 300;

    // Set initial styles
    ctx.fillStyle = 'hsl(var(--background))';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize * 2;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'hsl(var(--background))';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">Sketch Your Thought</h3>
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
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <Button
              variant={isEraser ? "outline" : "default"}
              size="sm"
              onClick={() => setIsEraser(false)}
              className="flex items-center gap-1"
            >
              <Palette className="h-3 w-3" />
              Draw
            </Button>
            <Button
              variant={isEraser ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEraser(true)}
              className="flex items-center gap-1"
            >
              <Eraser className="h-3 w-3" />
              Erase
            </Button>
            
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Size:</span>
              <input
                type="range"
                min="1"
                max="10"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-16"
              />
            </div>

            <Button variant="outline" size="sm" onClick={clearCanvas}>
              Clear
            </Button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="cursor-crosshair block w-full"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 flex items-center gap-1">
            <Save className="h-3 w-3" />
            Save Sketch
          </Button>
        </div>
      </div>
    </div>
  );
};