import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Code, 
  Play, 
  AlertCircle, 
  CheckCircle, 
  Settings,
  Download,
  Book,
  Terminal
} from 'lucide-react';
import { pluginManager, PluginManifest } from '@/services/pluginService';
import { useToast } from '@/hooks/use-toast';

// Sample plugin templates
const SAMPLE_PLUGINS = {
  'simple-note': {
    manifest: {
      id: 'simple-note-plugin',
      name: 'Simple Note Creator',
      version: '1.0.0',
      description: 'Creates simple note bubbles with custom text',
      author: 'Bubble OS Team',
      capabilities: [
        { scope: 'write' as const, resource: 'bubble' as const }
      ],
      entryPoint: `
// Simple Note Creator Plugin
function init() {
  const container = document.getElementById('plugin-root');
  
  container.innerHTML = \`
    <div style="padding: 16px;">
      <h3>Simple Note Creator</h3>
      <textarea id="note-text" placeholder="Enter your note..." 
                style="width: 100%; height: 100px; margin: 8px 0; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></textarea>
      <button id="create-note" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
        Create Note Bubble
      </button>
    </div>
  \`;
  
  document.getElementById('create-note').onclick = async () => {
    const text = document.getElementById('note-text').value;
    if (text.trim()) {
      try {
        await pluginAPI.createBubble({
          content: text,
          type: 'Thought',
          tags: ['plugin-created', 'note']
        });
        document.getElementById('note-text').value = '';
        alert('Note bubble created successfully!');
      } catch (error) {
        alert('Failed to create note: ' + error.message);
      }
    }
  };
}

init();
      `,
      sandboxed: true,
      quotas: {
        maxApiCalls: 100,
        maxStorageSize: 1024 * 10, // 10KB
        maxExecutionTime: 5000 // 5 seconds
      }
    }
  },
  
  'mood-tracker': {
    manifest: {
      id: 'mood-tracker-plugin',
      name: 'Advanced Mood Tracker',
      version: '1.0.0',
      description: 'Track mood patterns and create mood bubbles',
      author: 'Bubble OS Team',
      capabilities: [
        { scope: 'write', resource: 'bubble' },
        { scope: 'read', resource: 'bubble', filters: { types: ['Mood'] } }
      ],
      entryPoint: `
// Mood Tracker Plugin
function init() {
  const container = document.getElementById('plugin-root');
  
  const moods = ['😊 Happy', '😔 Sad', '😠 Angry', '😰 Anxious', '😴 Tired', '🤔 Thoughtful'];
  
  container.innerHTML = \`
    <div style="padding: 16px;">
      <h3>Mood Tracker</h3>
      <p>How are you feeling right now?</p>
      <div id="mood-buttons" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 16px 0;">
        \${moods.map(mood => \`
          <button class="mood-btn" data-mood="\${mood}" 
                  style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 14px;">
            \${mood}
          </button>
        \`).join('')}
      </div>
      <textarea id="mood-notes" placeholder="Add notes about your mood..." 
                style="width: 100%; height: 60px; margin: 8px 0; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></textarea>
      <button id="track-mood" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 100%;">
        Track Mood
      </button>
      <div id="recent-moods" style="margin-top: 16px;">
        <h4>Recent Moods</h4>
        <div id="mood-history"></div>
      </div>
    </div>
  \`;
  
  let selectedMood = '';
  
  // Handle mood selection
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.style.background = 'white');
      btn.style.background = '#e3f2fd';
      selectedMood = btn.dataset.mood;
    };
  });
  
  // Track mood
  document.getElementById('track-mood').onclick = async () => {
    if (!selectedMood) {
      alert('Please select a mood first!');
      return;
    }
    
    const notes = document.getElementById('mood-notes').value;
    const content = \`🧠 Mood Check-in\\n\\nFeeling: \${selectedMood}\\n\\n\${notes ? 'Notes: ' + notes : ''}\`;
    
    try {
      await pluginAPI.createBubble({
        content: content,
        type: 'Mood',
        tags: ['mood', 'tracking', 'plugin-created']
      });
      
      // Reset form
      selectedMood = '';
      document.getElementById('mood-notes').value = '';
      document.querySelectorAll('.mood-btn').forEach(b => b.style.background = 'white');
      
      alert('Mood tracked successfully!');
      loadRecentMoods();
    } catch (error) {
      alert('Failed to track mood: ' + error.message);
    }
  };
  
  // Load recent moods
  async function loadRecentMoods() {
    try {
      const moods = await pluginAPI.getBubbles({ type: 'Mood' });
      const recent = moods.slice(-3).reverse();
      
      document.getElementById('mood-history').innerHTML = recent.map(mood => \`
        <div style="padding: 8px; border: 1px solid #eee; border-radius: 4px; margin: 4px 0; font-size: 12px;">
          \${new Date(mood.createdAt).toLocaleDateString()} - \${mood.content.split('\\n')[2] || 'No mood recorded'}
        </div>
      \`).join('') || '<p style="color: #666; font-style: italic;">No recent moods tracked</p>';
    } catch (error) {
      console.error('Failed to load recent moods:', error);
    }
  }
  
  loadRecentMoods();
}

init();
      `,
      sandboxed: true,
      quotas: {
        maxApiCalls: 200,
        maxStorageSize: 1024 * 50, // 50KB
        maxExecutionTime: 10000 // 10 seconds
      }
    }
  }
};

const SDK_DOCUMENTATION = `
# Bubble OS Plugin SDK

## Overview
The Bubble OS Plugin SDK allows you to create custom plugins that extend the functionality of the Bubble Universe. Plugins run in a secure sandbox environment with limited capabilities based on their manifest.

## Plugin Structure
Every plugin consists of:
- **Manifest**: Describes the plugin and its capabilities
- **Entry Point**: JavaScript code that runs in the sandbox

## Available APIs

### Bubble API
\`\`\`javascript
// Read bubbles (requires 'read' scope for 'bubble' resource)
const bubbles = await pluginAPI.getBubbles(filter);

// Create bubble (requires 'write' scope for 'bubble' resource)
const bubble = await pluginAPI.createBubble({
  content: 'Hello world',
  type: 'Thought', // 'Thought', 'Task', 'Memory', 'Mood', 'ReminderNote'
  tags: ['plugin-created'],
  x: 100, // optional position
  y: 100
});

// Update bubble (requires 'write' scope)
await pluginAPI.updateBubble(bubbleId, { content: 'Updated content' });

// Delete bubble (requires 'write' scope)
await pluginAPI.deleteBubble(bubbleId);
\`\`\`

### Search API
\`\`\`javascript
// Search bubbles (requires 'read' scope for 'search' resource)
const results = await pluginAPI.search('keyword', filter);
\`\`\`

### Storage API
\`\`\`javascript
// Store plugin data
await pluginStorage.set('key', { some: 'data' });

// Retrieve plugin data
const data = await pluginStorage.get('key');

// Delete data
await pluginStorage.delete('key');

// Clear all plugin data
await pluginStorage.clear();

// List all keys
const keys = await pluginStorage.keys();
\`\`\`

## Capability System
Plugins must declare capabilities in their manifest:

\`\`\`javascript
capabilities: [
  {
    scope: 'read', // 'read', 'write', 'admin'
    resource: 'bubble', // 'bubble', 'cbt', 'glimmer', 'search', 'setting'
    filters: { // optional
      tags: ['specific-tag'],
      types: ['Mood'],
      timeRange: { start: '2023-01-01', end: '2023-12-31' }
    }
  }
]
\`\`\`

## Plugin Lifecycle
1. Plugin is loaded and manifest is validated
2. Sandbox environment is created
3. Entry point code is executed
4. Plugin can interact with APIs based on capabilities
5. Plugin is unloaded when disabled or app closes

## Best Practices
- Keep plugins lightweight and focused
- Handle errors gracefully
- Use semantic HTML and accessible designs
- Respect user privacy and data
- Test plugins thoroughly before distribution

## Security
- Plugins run in sandboxed iframes
- API access is limited by capabilities
- Storage is isolated per plugin
- Execution time and resource usage are limited
`;

export function PluginSDK() {
  const { toast } = useToast();
  const [selectedPlugin, setSelectedPlugin] = useState('simple-note');
  const [customCode, setCustomCode] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);

  const runPlugin = async (manifestData: PluginManifest) => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      // Load the plugin using the plugin manager
      await pluginManager.loadPlugin(manifestData);
      
      setTestResults(prev => [...prev, `✅ Plugin "${manifestData.name}" loaded successfully`]);
      setTestResults(prev => [...prev, `📊 Memory usage: ~${JSON.stringify(manifestData).length} bytes`]);
      setTestResults(prev => [...prev, `🔐 Capabilities: ${manifestData.capabilities.length} permissions`]);
      
      toast({
        title: "Plugin Loaded",
        description: `${manifestData.name} is now running in the sandbox.`,
      });
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setTestResults(prev => [...prev, `❌ Failed to load plugin: ${errorMsg}`]);
      
      toast({
        title: "Plugin Error",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const runCustomPlugin = async () => {
    if (!customCode.trim()) {
      toast({
        title: "No Code",
        description: "Please enter plugin code to test.",
        variant: "destructive"
      });
      return;
    }

    try {
      const manifest = JSON.parse(customCode);
      await runPlugin(manifest);
    } catch (error) {
      toast({
        title: "Invalid Plugin",
        description: "Please ensure your plugin manifest is valid JSON.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Plugin SDK & Development
          <Badge variant="secondary">Developer Tools</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="samples" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="samples">Sample Plugins</TabsTrigger>
            <TabsTrigger value="custom">Custom Plugin</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          </TabsList>
          
          <TabsContent value="samples" className="space-y-4">
            <div className="space-y-4">
              <Label className="text-sm font-medium">Try Sample Plugins</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(SAMPLE_PLUGINS).map(([key, plugin]) => (
                  <Card key={key} className={`cursor-pointer transition-colors ${
                    selectedPlugin === key ? 'ring-2 ring-primary' : ''
                  }`} onClick={() => setSelectedPlugin(key)}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{plugin.manifest.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-2">
                        {plugin.manifest.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {plugin.manifest.capabilities.map((cap, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {cap.scope}:{cap.resource}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => runPlugin(SAMPLE_PLUGINS[selectedPlugin as keyof typeof SAMPLE_PLUGINS].manifest)}
                  disabled={isRunning}
                  className="flex-1"
                >
                  {isRunning ? (
                    <>
                      <Terminal className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Selected Plugin
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-4">
            <div className="space-y-4">
              <Label className="text-sm font-medium">Custom Plugin Manifest</Label>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Enter a complete plugin manifest as JSON. See the Documentation tab for examples and API reference.
                </AlertDescription>
              </Alert>
              
              <Textarea
                placeholder={JSON.stringify(SAMPLE_PLUGINS['simple-note'].manifest, null, 2)}
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              
              <Button 
                onClick={runCustomPlugin}
                disabled={isRunning}
                className="w-full"
              >
                {isRunning ? (
                  <>
                    <Terminal className="h-4 w-4 mr-2 animate-spin" />
                    Testing Plugin...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Test Custom Plugin
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="docs" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Book className="h-5 w-5" />
                <Label className="text-sm font-medium">SDK Documentation</Label>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto p-4 border rounded-lg bg-muted/50">
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {SDK_DOCUMENTATION}
                </pre>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-3 w-3 mr-1" />
                  Download SDK
                </Button>
                <Button variant="outline" size="sm">
                  <Settings className="h-3 w-3 mr-1" />
                  Plugin Settings
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="mt-6 space-y-2">
            <Label className="text-sm font-medium">Test Results</Label>
            <div className="p-3 border rounded-lg bg-muted/50 max-h-32 overflow-y-auto">
              {testResults.map((result, i) => (
                <div key={i} className="text-xs font-mono">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}