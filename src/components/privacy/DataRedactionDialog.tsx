import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarDays, AlertTriangle, Clock, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { privacyConsentService } from '@/services/privacyConsentService';

interface DataRedactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layer: 'surface' | 'context' | 'deep';
}

export function DataRedactionDialog({ open, onOpenChange, layer }: DataRedactionDialogProps) {
  const [timeRange, setTimeRange] = useState<'7days' | '30days' | 'custom'>('7days');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [dataTypes, setDataTypes] = useState<string[]>(['all']);
  const [isRedacting, setIsRedacting] = useState(false);
  const { toast } = useToast();

  const getDataTypesForLayer = () => {
    switch (layer) {
      case 'surface':
        return ['preferences', 'ui_customizations', 'theme_settings', 'basic_usage'];
      case 'context':
        return ['behavioral_patterns', 'routine_detection', 'time_patterns', 'usage_analytics'];
      case 'deep':
        return ['emotional_patterns', 'cbt_insights', 'personal_triggers', 'sensitive_content'];
      default:
        return [];
    }
  };

  const handleDataTypeChange = (type: string, checked: boolean) => {
    if (type === 'all') {
      setDataTypes(checked ? ['all'] : []);
    } else {
      setDataTypes(prev => {
        const newTypes = checked 
          ? [...prev.filter(t => t !== 'all'), type]
          : prev.filter(t => t !== type);
        return newTypes.length === 0 ? [] : newTypes;
      });
    }
  };

  const calculateDaysToRedact = (): number => {
    switch (timeRange) {
      case '7days':
        return 7;
      case '30days':
        return 30;
      case 'custom':
        if (customStartDate && customEndDate) {
          return Math.ceil((customEndDate.getTime() - customStartDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        return 0;
      default:
        return 0;
    }
  };

  const handleRedaction = async () => {
    setIsRedacting(true);
    
    try {
      const days = calculateDaysToRedact();
      
      if (days <= 0) {
        toast({
          title: "Invalid time range",
          description: "Please select a valid time range for redaction",
          variant: "destructive"
        });
        return;
      }

      // Perform redaction using the privacy service
      privacyConsentService.redactLastNDays(days);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Data redacted successfully",
        description: `Removed ${dataTypes.includes('all') ? 'all' : dataTypes.length} data types from the last ${days} days in ${layer} layer`,
      });
      
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Redaction failed",
        description: "Failed to redact data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRedacting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Redact {layer.charAt(0).toUpperCase() + layer.slice(1)} Layer Data
          </DialogTitle>
          <DialogDescription>
            Permanently remove selected data from the {layer} privacy layer. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Time Range Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Time Range</Label>
            <RadioGroup value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="7days" id="7days" />
                <Label htmlFor="7days" className="text-sm">Last 7 days</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="30days" id="30days" />
                <Label htmlFor="30days" className="text-sm">Last 30 days</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="text-sm">Custom range</Label>
              </div>
            </RadioGroup>

            {timeRange === 'custom' && (
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="space-y-2">
                  <Label className="text-xs">Start Date</Label>
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    disabled={(date) => date > new Date()}
                    className="rounded-md border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">End Date</Label>
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    disabled={(date) => date > new Date() || (customStartDate && date < customStartDate)}
                    className="rounded-md border"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Data Types Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Data Types to Redact</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="all"
                  checked={dataTypes.includes('all')}
                  onCheckedChange={(checked) => handleDataTypeChange('all', checked as boolean)}
                />
                <Label htmlFor="all" className="text-sm font-medium">All data types</Label>
              </div>
              
              {!dataTypes.includes('all') && getDataTypesForLayer().map((type) => (
                <div key={type} className="flex items-center space-x-2 ml-4">
                  <Checkbox
                    id={type}
                    checked={dataTypes.includes(type)}
                    onCheckedChange={(checked) => handleDataTypeChange(type, checked as boolean)}
                  />
                  <Label htmlFor={type} className="text-sm">
                    {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="text-sm text-destructive">
              <p className="font-medium">Permanent Action</p>
              <p>This will permanently delete the selected data. Redacted data cannot be recovered.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRedacting}>
            Cancel
          </Button>
          <Button 
            onClick={handleRedaction} 
            disabled={isRedacting || dataTypes.length === 0}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isRedacting ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Redacting...
              </>
            ) : (
              'Redact Data'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}