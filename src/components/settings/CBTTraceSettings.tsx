import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  Archive, 
  Download, 
  Trash2, 
  Shield,
  Clock
} from 'lucide-react';
import { traceService } from '@/ai/cbt/trace';
import { hapticsService } from '@/services/haptics';
import { toast } from 'sonner';

export const CBTTraceSettings: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [archiveEnabled, setArchiveEnabled] = useState(false);

  useEffect(() => {
    loadStats();
    loadArchiveSetting();
  }, []);

  const loadStats = () => {
    const cbtStats = traceService.getStats();
    setStats(cbtStats);
  };

  const loadArchiveSetting = () => {
    const archived = localStorage.getItem('cbt_archive_enabled') === 'true';
    setArchiveEnabled(archived);
  };

  const handleArchiveToggle = (enabled: boolean) => {
    setArchiveEnabled(enabled);
    localStorage.setItem('cbt_archive_enabled', enabled.toString());
    toast.success(enabled ? 'Archive mode enabled' : 'Archive mode disabled');
  };

  const handleExportTraces = async () => {
    setIsExporting(true);
    try {
      const traces = traceService.exportForUser('current-user', {
        includeArchived: true
      });
      
      const exportData = {
        traces,
        exportedAt: Date.now(),
        version: '1.0',
        totalCount: traces.length
      };
      
      const dataBlob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `cbt-traces-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      hapticsService.success();
      toast.success('CBT traces exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      hapticsService.error();
      toast.error('Failed to export CBT traces');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAllTraces = async () => {
    if (!confirm('Are you sure you want to delete all CBT traces? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await traceService.deleteAll();
      loadStats();
      hapticsService.success();
      toast.success('All CBT traces deleted securely');
    } catch (error) {
      console.error('Delete failed:', error);
      hapticsService.error();
      toast.error('Failed to delete CBT traces');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!stats) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            CBT Trace Overview
          </CardTitle>
          <CardDescription>
            Storage and management of thought pattern analysis records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalTraces}</div>
              <div className="text-sm text-muted-foreground">Total Traces</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.archivedTraces}</div>
              <div className="text-sm text-muted-foreground">Archived</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Storage Size</p>
              <p className="text-xs text-muted-foreground">{stats.storageSize}</p>
            </div>
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              30-day retention
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Archive Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archive Settings
          </CardTitle>
          <CardDescription>
            Archived traces are exempt from automatic deletion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="archive-enabled">Enable Archive Mode</Label>
              <p className="text-sm text-muted-foreground">
                Important traces can be manually archived for permanent storage
              </p>
            </div>
            <Switch
              id="archive-enabled"
              checked={archiveEnabled}
              onCheckedChange={handleArchiveToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Export or delete your CBT trace data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportTraces}
              disabled={isExporting}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export Traces'}
            </Button>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAllTraces}
              disabled={isDeleting}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete All CBT Traces'}
            </Button>
            <p className="text-xs text-muted-foreground">
              This action permanently deletes all CBT traces and cannot be undone.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary text-sm">
            <Shield className="h-4 w-4" />
            CBT Privacy Protection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm space-y-1">
            <p>✓ Traces stored locally only</p>
            <p>✓ Consent required for trace persistence</p>
            <p>✓ Automatic 30-day retention policy</p>
            <p>✓ Secure deletion with overwriting</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};