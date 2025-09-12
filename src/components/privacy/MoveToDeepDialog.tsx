import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Shield, Lock, ArrowDown, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { privacyConsentService } from '@/services/privacyConsentService';

interface MoveToDeepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DataCategory {
  id: string;
  name: string;
  description: string;
  currentLayer: 'surface' | 'context';
  itemCount: number;
  sensitive: boolean;
}

export function MoveToDeepDialog({ open, onOpenChange }: MoveToDeepDialogProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();

  const dataCategories: DataCategory[] = [
    {
      id: 'cbt_insights',
      name: 'CBT Insights',
      description: 'Thought patterns and cognitive behavioral analysis',
      currentLayer: 'context',
      itemCount: 47,
      sensitive: true
    },
    {
      id: 'emotional_patterns',
      name: 'Emotional Patterns',
      description: 'Mood tracking and emotional state analysis',
      currentLayer: 'context',
      itemCount: 23,
      sensitive: true
    },
    {
      id: 'personal_triggers',
      name: 'Personal Triggers',
      description: 'Identified stress and anxiety triggers',
      currentLayer: 'context',
      itemCount: 12,
      sensitive: true
    },
    {
      id: 'financial_details',
      name: 'Financial Details',
      description: 'Detailed transaction and spending patterns',
      currentLayer: 'context',
      itemCount: 156,
      sensitive: true
    },
    {
      id: 'location_history',
      name: 'Location History',
      description: 'Detailed location and movement patterns',
      currentLayer: 'surface',
      itemCount: 89,
      sensitive: false
    },
    {
      id: 'communication_patterns',
      name: 'Communication Patterns',
      description: 'Email and calendar behavioral analysis',
      currentLayer: 'context',
      itemCount: 34,
      sensitive: false
    }
  ];

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setSelectedCategories(prev => 
      checked 
        ? [...prev, categoryId]
        : prev.filter(id => id !== categoryId)
    );
  };

  const handleSelectAllSensitive = () => {
    const sensitiveIds = dataCategories.filter(cat => cat.sensitive).map(cat => cat.id);
    setSelectedCategories(sensitiveIds);
  };

  const simulateMigration = async () => {
    const steps = selectedCategories.length * 2; // Each category has encryption + migration steps
    let currentStep = 0;

    for (const categoryId of selectedCategories) {
      const category = dataCategories.find(c => c.id === categoryId);
      
      // Encryption step
      setProgress((currentStep / steps) * 100);
      await new Promise(resolve => setTimeout(resolve, 1000));
      currentStep++;

      // Migration step
      setProgress((currentStep / steps) * 100);
      await new Promise(resolve => setTimeout(resolve, 1500));
      currentStep++;
    }

    setProgress(100);
  };

  const handleMoveData = async () => {
    if (selectedCategories.length === 0) {
      toast({
        title: "No data selected",
        description: "Please select at least one data category to move",
        variant: "destructive"
      });
      return;
    }

    setIsMoving(true);
    setProgress(0);

    try {
      await simulateMigration();

      // Update privacy service
      privacyConsentService.moveToDeepLayer();

      setCompleted(true);
      
      toast({
        title: "Data moved successfully",
        description: `${selectedCategories.length} data categories encrypted and moved to Deep layer`,
      });

      // Auto-close after showing success
      setTimeout(() => {
        onOpenChange(false);
        setCompleted(false);
        setSelectedCategories([]);
        setProgress(0);
      }, 2000);

    } catch (error) {
      toast({
        title: "Migration failed",
        description: "Failed to move data to Deep layer. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsMoving(false);
    }
  };

  const getTotalItems = () => {
    return selectedCategories.reduce((total, categoryId) => {
      const category = dataCategories.find(c => c.id === categoryId);
      return total + (category?.itemCount || 0);
    }, 0);
  };

  if (completed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Migration Complete</h3>
            <p className="text-sm text-muted-foreground text-center">
              {selectedCategories.length} data categories have been encrypted and moved to the Deep privacy layer.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Move Data to Deep Layer
          </DialogTitle>
          <DialogDescription>
            Select sensitive data to encrypt and move to the highest security privacy layer
          </DialogDescription>
        </DialogHeader>

        {isMoving ? (
          <div className="space-y-4 py-6">
            <div className="flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Encrypting and migrating data...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Processing {getTotalItems()} items across {selectedCategories.length} categories
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSelectAllSensitive}
              >
                Select All Sensitive
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedCategories([])}
              >
                Clear Selection
              </Button>
            </div>

            {/* Data Categories */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {dataCategories.map((category) => (
                <div 
                  key={category.id} 
                  className={`border rounded-lg p-3 ${category.sensitive ? 'border-orange-200 bg-orange-50/50' : 'border-border'}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={category.id}
                      checked={selectedCategories.includes(category.id)}
                      onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={category.id} className="text-sm font-medium">
                          {category.name}
                        </Label>
                        {category.sensitive && (
                          <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                            Sensitive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {category.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Current: {category.currentLayer.charAt(0).toUpperCase() + category.currentLayer.slice(1)} layer</span>
                        <span>•</span>
                        <span>{category.itemCount} items</span>
                      </div>
                    </div>
                    <ArrowDown className="h-4 w-4 text-muted-foreground mt-1" />
                  </div>
                </div>
              ))}
            </div>

            {/* Selection Summary */}
            {selectedCategories.length > 0 && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    Selected: {selectedCategories.length} categories, {getTotalItems()} items
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Data will be encrypted with biometric authentication required for access
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleMoveData} 
            disabled={isMoving || selectedCategories.length === 0}
          >
            {isMoving ? 'Migrating...' : `Move to Deep Layer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}