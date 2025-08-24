# Bubble Universe Plugin SDK

## Overview

The Bubble Universe Plugin SDK allows developers to create custom extensions that integrate seamlessly with the bubble canvas, adding new capture methods, visualization modes, and analysis capabilities.

## Core Concepts

### Plugin Architecture

Plugins run in a sandboxed environment with limited access to system resources. Each plugin must declare its capabilities and required permissions upfront.

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
  permissions: PluginPermission[];
  execute: (context: PluginContext) => Promise<PluginResult>;
}
```

### Capability System

Plugins declare what they can do through the capability system:

```typescript
type PluginCapability = 
  | 'bubble-create'        // Create new bubbles
  | 'bubble-read'          // Read existing bubbles
  | 'bubble-update'        // Modify bubbles
  | 'bubble-delete'        // Delete bubbles
  | 'search-enhance'       // Enhance search results
  | 'ui-overlay'           // Add UI overlays
  | 'data-export'          // Export data
  | 'ai-analyze'           // Perform AI analysis
  | 'notification-send';   // Send notifications
```

### Permission Model

Plugins must request specific permissions:

```typescript
type PluginPermission =
  | 'storage.read'         // Read local storage
  | 'storage.write'        // Write to local storage  
  | 'network.api'          // Make API calls
  | 'camera.access'        // Access camera
  | 'microphone.access'    // Access microphone
  | 'location.read'        // Read location data
  | 'ai.local'             // Use local AI models
  | 'ai.cloud';            // Use cloud AI services
```

## Getting Started

### 1. Basic Plugin Structure

```typescript
import { Plugin, PluginContext, PluginResult } from '@/lib/pluginSDK';

export const myPlugin: Plugin = {
  id: 'my-awesome-plugin',
  name: 'My Awesome Plugin',
  version: '1.0.0',
  capabilities: ['bubble-create', 'ai-analyze'],
  permissions: ['storage.read', 'ai.local'],
  
  async execute(context: PluginContext): Promise<PluginResult> {
    // Plugin logic here
    return {
      success: true,
      data: { message: 'Plugin executed successfully' }
    };
  }
};
```

### 2. Plugin Context

The context provides access to bubble data and system APIs:

```typescript
interface PluginContext {
  bubbles: Bubble[];                    // Available bubbles
  selectedBubbles: Bubble[];            // Currently selected bubbles
  canvas: CanvasAPI;                    // Canvas manipulation
  storage: StorageAPI;                  // Local storage access
  ai: AIAPI;                           // AI services
  ui: UIAPI;                           // UI manipulation
  search: SearchAPI;                    // Search integration
}
```

### 3. Canvas API

Manipulate the bubble canvas programmatically:

```typescript
interface CanvasAPI {
  createBubble(data: BubbleData): Promise<Bubble>;
  updateBubble(id: string, updates: Partial<Bubble>): Promise<void>;
  deleteBubble(id: string): Promise<void>;
  selectBubbles(ids: string[]): void;
  zoomTo(bounds: BoundingBox): void;
  addOverlay(component: React.Component): string;
  removeOverlay(id: string): void;
}
```

### 4. AI Integration

Access local and cloud AI services:

```typescript
interface AIAPI {
  // Local AI models
  analyzeSentiment(text: string): Promise<SentimentResult>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  
  // Cloud AI services (requires permission)
  generateText(prompt: string): Promise<string>;
  analyzeImage(imageData: string): Promise<ImageAnalysis>;
  transcribeAudio(audioBlob: Blob): Promise<string>;
}
```

## Example Plugins

### 1. Mood Tracker Plugin

```typescript
export const moodTrackerPlugin: Plugin = {
  id: 'mood-tracker',
  name: 'Mood Tracker',
  version: '1.0.0',
  capabilities: ['bubble-create', 'ai-analyze', 'ui-overlay'],
  permissions: ['storage.write', 'ai.local'],
  
  async execute(context: PluginContext): Promise<PluginResult> {
    // Add mood tracking overlay
    const overlayId = context.ui.addOverlay(MoodTrackerOverlay);
    
    // Analyze recent bubbles for mood patterns
    const recentBubbles = context.bubbles
      .filter(b => Date.now() - new Date(b.created_at).getTime() < 7 * 24 * 60 * 60 * 1000)
      .slice(0, 50);
    
    const moodAnalysis = await Promise.all(
      recentBubbles.map(b => context.ai.analyzeSentiment(b.content))
    );
    
    // Create summary bubble
    const moodSummary = {
      type: 'mood' as const,
      content: `Weekly mood summary: ${generateMoodSummary(moodAnalysis)}`,
      tags: ['mood-summary', 'weekly'],
      x: Math.random() * 800,
      y: Math.random() * 600
    };
    
    await context.canvas.createBubble(moodSummary);
    
    return { 
      success: true, 
      data: { 
        overlayId,
        moodTrend: calculateMoodTrend(moodAnalysis)
      }
    };
  }
};
```

### 2. Photo Collage Plugin

```typescript
export const photoCollagePlugin: Plugin = {
  id: 'photo-collage',
  name: 'Photo Collage Creator',
  version: '1.0.0',
  capabilities: ['bubble-read', 'bubble-create', 'ai-analyze'],
  permissions: ['ai.cloud'],
  
  async execute(context: PluginContext): Promise<PluginResult> {
    // Find all photo bubbles
    const photoBubbles = context.bubbles.filter(b => b.type === 'photo');
    
    if (photoBubbles.length < 3) {
      return { 
        success: false, 
        error: 'Need at least 3 photos to create a collage' 
      };
    }
    
    // Analyze photos for grouping
    const analyses = await Promise.all(
      photoBubbles.map(b => context.ai.analyzeImage(b.content))
    );
    
    // Group photos by theme
    const groups = groupPhotosByTheme(photoBubbles, analyses);
    
    // Create collage bubbles
    for (const [theme, photos] of Object.entries(groups)) {
      const collageBubble = {
        type: 'collage' as const,
        content: createCollageHTML(photos),
        tags: ['collage', theme],
        x: Math.random() * 800,
        y: Math.random() * 600
      };
      
      await context.canvas.createBubble(collageBubble);
    }
    
    return { 
      success: true, 
      data: { 
        collagesCreated: Object.keys(groups).length 
      }
    };
  }
};
```

### 3. Task Automation Plugin

```typescript
export const taskAutomationPlugin: Plugin = {
  id: 'task-automation',
  name: 'Smart Task Automation',
  version: '1.0.0',
  capabilities: ['bubble-read', 'bubble-update', 'notification-send'],
  permissions: ['storage.write'],
  
  async execute(context: PluginContext): Promise<PluginResult> {
    const taskBubbles = context.bubbles.filter(b => 
      b.type === 'task' && !b.completed
    );
    
    let automatedTasks = 0;
    
    for (const task of taskBubbles) {
      // Check for automation patterns
      if (shouldAutoComplete(task)) {
        await context.canvas.updateBubble(task.id, { 
          completed: true,
          completed_at: new Date().toISOString()
        });
        
        context.ui.sendNotification({
          title: 'Task Auto-Completed',
          message: `"${task.content}" was automatically marked as done`,
          type: 'success'
        });
        
        automatedTasks++;
      }
      
      // Check for smart scheduling
      else if (shouldReschedule(task)) {
        const newDueDate = calculateOptimalDueDate(task, context.bubbles);
        await context.canvas.updateBubble(task.id, {
          due_date: newDueDate.toISOString()
        });
      }
    }
    
    return { 
      success: true, 
      data: { 
        automatedTasks,
        message: `Automated ${automatedTasks} tasks` 
      }
    };
  }
};
```

## Security & Sandboxing

### Resource Limits

Plugins operate within strict resource limits:

- **Memory**: 50MB per plugin
- **CPU**: 100ms execution time limit
- **Storage**: 10MB local storage quota
- **Network**: 10 requests per minute

### Sandbox Isolation

Plugins run in isolated contexts with no access to:
- Other plugins' data
- System APIs outside their permissions
- User's raw personal data (only processed/aggregated views)
- Browser localStorage/sessionStorage directly

### Data Privacy

- All plugin data access is logged and auditable
- Users can revoke plugin permissions at any time
- Plugins cannot access data outside their declared scope
- All network requests are proxied and filtered

## Testing Your Plugin

### Unit Testing

```typescript
import { testPlugin } from '@/lib/pluginSDK/testing';

describe('My Awesome Plugin', () => {
  it('should create mood summary bubble', async () => {
    const mockContext = createMockContext({
      bubbles: [
        { type: 'thought', content: 'I feel great today!' },
        { type: 'task', content: 'Finish project' }
      ]
    });
    
    const result = await testPlugin(myPlugin, mockContext);
    
    expect(result.success).toBe(true);
    expect(mockContext.canvas.createBubble).toHaveBeenCalled();
  });
});
```

### Integration Testing

Test your plugin with the full bubble canvas:

```typescript
import { renderWithPlugins } from '@/test/utils';

it('should integrate with bubble canvas', async () => {
  const { getByRole } = renderWithPlugins([myPlugin]);
  
  // Trigger plugin execution
  const executeButton = getByRole('button', { name: /execute plugin/i });
  fireEvent.click(executeButton);
  
  // Verify results
  await waitFor(() => {
    expect(getByRole('bubble')).toBeInTheDocument();
  });
});
```

## Publishing Your Plugin

### 1. Plugin Manifest

Create a `plugin.json` file:

```json
{
  "id": "my-awesome-plugin",
  "name": "My Awesome Plugin",
  "description": "Does awesome things with bubbles",
  "version": "1.0.0",
  "author": "Your Name",
  "homepage": "https://github.com/username/my-plugin",
  "capabilities": ["bubble-create", "ai-analyze"],
  "permissions": ["storage.read", "ai.local"],
  "main": "dist/index.js",
  "icon": "icon.svg"
}
```

### 2. Build Process

Use the provided build tools:

```bash
npm install @bubble-universe/plugin-cli
npx bubble-plugin build
npx bubble-plugin validate
```

### 3. Local Installation

Users can install your plugin locally:

```bash
# In the Bubble Universe app
Settings > Plugins > Install from File > select plugin.zip
```

## Best Practices

### Performance

- Use lazy loading for heavy operations
- Implement proper cleanup in plugin teardown
- Cache expensive computations
- Batch API calls when possible

### User Experience

- Provide clear feedback for long-running operations
- Use progressive disclosure for complex features
- Follow the app's design system
- Respect user's accessibility preferences

### Privacy

- Request minimal permissions needed
- Clearly explain why permissions are needed
- Process data locally when possible
- Provide opt-out mechanisms

### Error Handling

```typescript
async execute(context: PluginContext): Promise<PluginResult> {
  try {
    // Plugin logic
    return { success: true, data: result };
  } catch (error) {
    console.error('Plugin error:', error);
    return { 
      success: false, 
      error: 'Failed to execute plugin',
      details: error.message 
    };
  }
}
```

## API Reference

For complete API documentation, see:
- [Plugin Interface](./api/plugin-interface.md)
- [Context API](./api/context-api.md)
- [Canvas API](./api/canvas-api.md)
- [AI API](./api/ai-api.md)
- [Testing Utilities](./api/testing.md)

## Community

- [Plugin Gallery](https://bubble-universe.dev/plugins)
- [Discord Community](https://discord.gg/bubble-universe)
- [GitHub Discussions](https://github.com/bubble-universe/plugins/discussions)
- [Contributing Guide](./CONTRIBUTING.md)