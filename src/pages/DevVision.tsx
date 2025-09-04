import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BecausePill } from '@/components/BecausePill';
import { visionService, VisionAnalysisResult } from '@/services/vision';
import { Upload, Image, Eye, Sparkles, FileText, Camera } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Sample fixture images for testing
const FIXTURE_IMAGES = [
  {
    name: 'Family Photo',
    url: 'https://images.unsplash.com/photo-1511895426328-dc8714aecd2d?w=400',
    description: 'Family gathering photo'
  },
  {
    name: 'Receipt',
    url: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400',
    description: 'Store receipt'
  },
  {
    name: 'Nature Scene',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    description: 'Beautiful landscape'
  },
  {
    name: 'Pet Photo',
    url: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400',
    description: 'Cute pet'
  },
  {
    name: 'Food Photo',
    url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
    description: 'Delicious meal'
  },
  {
    name: 'Document',
    url: 'https://images.unsplash.com/photo-1568667256549-094345857637?w=400',
    description: 'Text document'
  }
];

export const DevVision: React.FC = () => {
  const [results, setResults] = useState<Array<{
    image: string;
    result: VisionAnalysisResult;
    processingTime: number;
  }>>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const analyzeFixture = useCallback(async (fixture: typeof FIXTURE_IMAGES[0]) => {
    setIsProcessing(fixture.name);
    const startTime = Date.now();
    
    try {
      const result = await visionService.describeImage(fixture.url);
      const processingTime = Date.now() - startTime;
      
      setResults(prev => [...prev, {
        image: fixture.url,
        result,
        processingTime
      }]);
      
      toast({
        title: "Analysis Complete",
        description: `${fixture.name} analyzed in ${processingTime}ms`,
      });
    } catch (error) {
      console.error('Vision analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(null);
    }
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    setIsProcessing('uploaded-file');
    const startTime = Date.now();
    
    try {
      const result = await visionService.describeImage(file);
      const processingTime = Date.now() - startTime;
      
      const imageUrl = URL.createObjectURL(file);
      setResults(prev => [...prev, {
        image: imageUrl,
        result,
        processingTime
      }]);
      
      toast({
        title: "Analysis Complete",
        description: `File analyzed in ${processingTime}ms`,
      });
    } catch (error) {
      console.error('Vision analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(null);
    }
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      analyzeFile(file);
    }
    // Reset input
    event.target.value = '';
  }, [analyzeFile]);

  const clearResults = () => setResults([]);

  const getTypeIcon = (typeHint?: VisionAnalysisResult['typeHint']) => {
    switch (typeHint) {
      case 'receipt': return <FileText className="h-4 w-4" />;
      case 'document': return <FileText className="h-4 w-4" />;
      case 'face': return <Camera className="h-4 w-4" />;
      case 'food': return '🍽️';
      case 'nature': return '🌿';
      default: return <Image className="h-4 w-4" />;
    }
  };

  const getJoyBadgeVariant = (joyScore?: number) => {
    if (!joyScore) return 'secondary';
    if (joyScore > 0.7) return 'default';
    if (joyScore > 0.4) return 'outline';
    return 'secondary';
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Vision Analysis Dev</h1>
        </div>
        <Badge variant="secondary" className="text-xs">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Test Vision Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Drop an image here or click to upload</p>
                </div>
              </label>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Fixture Images */}
            <div>
              <h3 className="text-sm font-medium mb-3">Test Fixtures</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {FIXTURE_IMAGES.map((fixture) => (
                  <Button
                    key={fixture.name}
                    variant="outline"
                    size="sm"
                    onClick={() => analyzeFixture(fixture)}
                    disabled={isProcessing === fixture.name}
                    className="h-auto p-3 flex flex-col gap-2"
                  >
                    <div className="w-full aspect-square bg-muted rounded overflow-hidden">
                      <img 
                        src={fixture.url} 
                        alt={fixture.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xs">{fixture.name}</span>
                    {isProcessing === fixture.name && (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Clear Results */}
            {results.length > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={clearResults}>
                  Clear Results
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Analysis Results</h2>
          <div className="space-y-4">
            {results.map((item, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Image */}
                    <div className="aspect-square bg-muted rounded overflow-hidden">
                      <img 
                        src={item.image} 
                        alt="Analysis target"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Analysis Details */}
                    <div className="md:col-span-2 space-y-3">
                      {/* Caption */}
                      <div>
                        <h3 className="font-medium mb-1">Caption</h3>
                        <p className="text-sm text-muted-foreground">{item.result.caption}</p>
                      </div>

                      {/* Tags */}
                      <div>
                        <h3 className="font-medium mb-2">Tags</h3>
                        <div className="flex flex-wrap gap-1">
                          {item.result.tags.map((tag, tagIndex) => (
                            <Badge key={tagIndex} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="font-medium">Type:</span>
                          <div className="flex items-center gap-1 mt-1">
                            {getTypeIcon(item.result.typeHint)}
                            <span>{item.result.typeHint || 'scene'}</span>
                          </div>
                        </div>
                        
                        <div>
                          <span className="font-medium">Joy Score:</span>
                          <div className="mt-1">
                            <Badge variant={getJoyBadgeVariant(item.result.joyScore)}>
                              {item.result.joyScore ? `${Math.round(item.result.joyScore * 100)}%` : 'N/A'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div>
                          <span className="font-medium">Confidence:</span>
                          <div className="mt-1">
                            <Badge variant="outline">
                              {Math.round(item.result.confidence * 100)}%
                            </Badge>
                          </div>
                        </div>
                        
                        <div>
                          <span className="font-medium">Time:</span>
                          <div className="mt-1 text-muted-foreground">
                            {item.processingTime}ms
                          </div>
                        </div>
                      </div>

                      {/* Because Explanation */}
                      <div>
                        <BecausePill 
                          explanation={item.result.because}
                          variant="pill"
                          compact
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <Card className="mt-4">
          <CardContent className="text-center py-8">
            <div className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                Analyzing {isProcessing}...
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};