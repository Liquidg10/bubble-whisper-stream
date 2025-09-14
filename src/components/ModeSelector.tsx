/**
 * Mode Selector
 * Work/Family/Personal mode switching with scheduling
 */

import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Home, User, Settings } from 'lucide-react';
import { microPromptPolicy, type UserMode } from '@/services/microPromptPolicy';

interface ModeSelectorProps {
  className?: string;
}

export function ModeSelector({ className }: ModeSelectorProps) {
  const [currentMode, setCurrentMode] = useState<UserMode>('personal');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [familyStart, setFamilyStart] = useState('18:00');
  const [familyEnd, setFamilyEnd] = useState('21:00');
  const [showScheduling, setShowScheduling] = useState(false);

  useEffect(() => {
    const status = microPromptPolicy.getStatus();
    setCurrentMode(status.currentMode);
  }, []);

  const handleModeChange = (mode: UserMode) => {
    setCurrentMode(mode);
    microPromptPolicy.setMode(mode);
  };

  const handleWorkHoursUpdate = () => {
    microPromptPolicy.setWorkHours(workStart, workEnd);
  };

  const handleFamilyHoursUpdate = () => {
    microPromptPolicy.setFamilyHours(familyStart, familyEnd);
  };

  const getModeIcon = (mode: UserMode) => {
    switch (mode) {
      case 'work': return <Briefcase className="h-4 w-4" />;
      case 'family': return <Home className="h-4 w-4" />;
      case 'personal': return <User className="h-4 w-4" />;
      case 'silent': return <User className="h-4 w-4" />;
    }
  };

  const getModeDescription = (mode: UserMode) => {
    switch (mode) {
      case 'work': return 'Focus on work tasks, suppress personal reminders outside work hours';
      case 'family': return 'Minimize interruptions during family time';
      case 'personal': return 'Normal mode with all prompts and reminders';
      case 'silent': return 'No prompts or nudges';
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {getModeIcon(currentMode)}
          Focus Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="mode-select" className="text-sm font-medium">
            Current Mode
          </Label>
          <Select value={currentMode} onValueChange={handleModeChange}>
            <SelectTrigger id="mode-select" className="w-full">
              <SelectValue placeholder="Select focus mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal
                </div>
              </SelectItem>
              <SelectItem value="work">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Work
                </div>
              </SelectItem>
              <SelectItem value="family">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Family
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {getModeDescription(currentMode)}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">Schedule modes automatically</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowScheduling(!showScheduling)}
          >
            <Settings className="h-4 w-4 mr-1" />
            {showScheduling ? 'Hide' : 'Setup'}
          </Button>
        </div>

        {showScheduling && (
          <div className="space-y-4 pt-2 border-t">
            <div>
              <Label className="text-sm font-medium">Work Hours</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="time"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                  className="flex-1"
                />
                <span className="self-center text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={workEnd}
                  onChange={(e) => setWorkEnd(e.target.value)}
                  className="flex-1"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleWorkHoursUpdate}
                className="mt-2 w-full"
              >
                Update Work Hours
              </Button>
            </div>

            <div>
              <Label className="text-sm font-medium">Family Hours</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="time"
                  value={familyStart}
                  onChange={(e) => setFamilyStart(e.target.value)}
                  className="flex-1"
                />
                <span className="self-center text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={familyEnd}
                  onChange={(e) => setFamilyEnd(e.target.value)}
                  className="flex-1"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFamilyHoursUpdate}
                className="mt-2 w-full"
              >
                Update Family Hours
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}