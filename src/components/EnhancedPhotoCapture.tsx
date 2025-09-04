import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Sparkles, X, Eye, Loader2 } from 'lucide-react';
import { modalityService } from '@/services/modalityService';
import { visionService } from '@/services/vision';
import { photoService } from '@/services/photoService';
import { isFeatureEnabled } from '@/config/flags';
import { motion, AnimatePresence } from 'framer-motion';

interface EnhancedPhotoCaptureProps {
  onPhotoCapture?: (imageData: string, analysis?: any) => void;
  autoAnalyze?: boolean;
  analysisType?: 'content' | 'mood';
  onVisionAnalysis?: (result: any) => void;
}

export const EnhancedPhotoCapture: React.FC<EnhancedPhotoCaptureProps> = ({
  onPhotoCapture,
  autoAnalyze = true,
  analysisType = 'content',
  onVisionAnalysis
}) => {
  const { toast } = useToast();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Error",
        description: "Could not access camera. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        setShowPreview(true);
        stopCamera();
        
        // Upload to storage and get URL
        setIsUploading(true);
        try {
          const publicUrl = await photoService.uploadPhoto(imageData);
          
          if (autoAnalyze) {
            analyzePhoto(imageData);
          }
          
          onPhotoCapture?.(publicUrl);
          toast({
            title: "Photo captured",
            description: "Your photo has been saved successfully.",
          });
        } catch (error) {
          console.error('Failed to upload photo:', error);
          toast({
            title: "Upload failed",
            description: "Could not upload photo. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      }
    }
  }, [autoAnalyze, onPhotoCapture, stopCamera, toast]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target?.result as string;
        setCapturedImage(imageData);
        setShowPreview(true);
        
        // Upload to storage and get URL
        setIsUploading(true);
        try {
          const publicUrl = await photoService.uploadPhoto(file);
          
          if (autoAnalyze) {
            analyzePhoto(imageData);
          }
          
          onPhotoCapture?.(publicUrl);
          toast({
            title: "Photo uploaded",
            description: "Your photo has been saved successfully.",
          });
        } catch (error) {
          console.error('Failed to upload photo:', error);
          toast({
            title: "Upload failed",
            description: "Could not upload photo. Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    }
  }, [autoAnalyze, onPhotoCapture, toast]);

  const analyzePhoto = useCallback(async (imageData: string) => {
    if (!isFeatureEnabled('aiVision')) return;
    
    setIsAnalyzing(true);
    setAnalysis(null);
    
    try {
      // Use vision service for enhanced analysis
      const visionResult = await visionService.describeImage(imageData);
      
      // Convert to legacy format for compatibility
      const legacyResult = {
        success: true,
        analysis: visionResult.caption,
        analysis_type: analysisType,
        because: visionResult.because
      };
      
      setAnalysis(legacyResult);
      
      // Call new vision analysis callback if provided
      if (onVisionAnalysis) {
        onVisionAnalysis(visionResult);
      }
      
      toast({
        title: "Photo analyzed",
        description: visionResult.caption.substring(0, 100) + "...",
      });
    } catch (error) {
      console.error('Photo analysis failed:', error);
      toast({
        title: "Analysis failed",
        description: "Could not analyze the photo",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [analysisType, onVisionAnalysis, toast]);

  const clearPhoto = useCallback(() => {
    setCapturedImage(null);
    setAnalysis(null);
    setShowPreview(false);
    setIsAnalyzing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6 space-y-4">
        {/* Camera View */}
        <AnimatePresence>
          {isCameraActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative"
            >
              <video
                ref={videoRef}
                className="w-full rounded-lg"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                <Button
                  onClick={capturePhoto}
                  size="lg"
                  className="rounded-full w-16 h-16"
                >
                  <Camera className="w-6 h-6" />
                </Button>
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  size="lg"
                  className="rounded-full w-16 h-16"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Photo Preview */}
        <AnimatePresence>
          {showPreview && capturedImage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              <div className="relative">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full rounded-lg"
                />
                <Button
                  onClick={clearPhoto}
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capture Controls */}
        {!isCameraActive && !showPreview && (
          <div className="flex justify-center space-x-4">
            <Button
              onClick={startCamera}
              size="lg"
              className="flex-1"
            >
              <Camera className="w-5 h-5 mr-2" />
              Take Photo
            </Button>
            
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="lg"
              className="flex-1"
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload
            </Button>
          </div>
        )}

        {/* Analysis Controls */}
        {capturedImage && !isAnalyzing && (
          <div className="flex justify-center space-x-2">
            <Button
              onClick={() => analyzePhoto(capturedImage)}
              variant="outline"
              size="sm"
            >
              <Eye className="w-4 h-4 mr-2" />
              Analyze {analysisType === 'mood' ? 'Mood' : 'Content'}
            </Button>
          </div>
        )}

        {/* Processing Indicators */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center space-x-2 p-3 bg-muted rounded-lg"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Uploading photo...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center space-x-2 p-3 bg-muted rounded-lg"
            >
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="text-sm">Analyzing image with AI...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analysis Results */}
        <AnimatePresence>
          {analysis && analysis.success && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="text-sm font-medium mb-2 flex items-center">
                  <Eye className="w-4 h-4 mr-2" />
                  {analysisType === 'mood' ? 'Mood Analysis:' : 'Content Analysis:'}
                </h4>
                <p className="text-sm">{analysis.analysis}</p>
              </div>

              <Badge variant="outline" className="w-fit">
                {analysis.because}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  );
};