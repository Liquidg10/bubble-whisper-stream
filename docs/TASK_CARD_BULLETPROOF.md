# Universal Bulletproof Task Card

The `TaskCard` component is a robust, unified task card that works across all views (Bubble, Atomic, List, Kanban, Matrix) with comprehensive error handling, accessibility, and advanced features.

## Features

### 🛡️ Bulletproof Error Handling
- **Data Validation**: Validates and sanitizes all task properties
- **Corruption Recovery**: Gracefully handles corrupted task data
- **Fallback Rendering**: Shows meaningful error states instead of crashing
- **Type Safety**: Full TypeScript support with proper type guards

### ♿ Comprehensive Accessibility
- **ARIA Labels**: Proper labels for all interactive elements
- **Keyboard Navigation**: Full keyboard support (arrows, Enter, Space, E for edit)
- **Screen Reader Support**: Contextual information for assistive technologies
- **Focus Management**: Proper focus handling during interactions

### 🎯 Advanced Features
- **Inline Editing**: Direct title and description editing
- **Auto-save**: Debounced auto-save with error handling
- **Undo/Redo**: Integration with cross-view undo service
- **Batch Operations**: Support for bulk editing capabilities
- **Smart Validation**: Real-time validation with user feedback

### 🔧 View Integration
- **Universal Config**: Works across all view types
- **Drag & Drop**: Seamless integration with @dnd-kit
- **Selection Management**: Multi-select support
- **Context Awareness**: View-specific behavior and styling

## Usage

### Basic Usage
```tsx
import { TaskCard } from '@/components/TaskCard';

<TaskCard 
  task={task}
  onUpdate={handleUpdate}
  onSelect={handleSelect}
/>
```

### View-Specific Configuration
```tsx
import { TaskCard, TaskCardConfigs } from '@/components/TaskCard';

// Kanban view with drag support
<TaskCard 
  task={task}
  viewConfig={TaskCardConfigs.kanban}
  onUpdate={handleUpdate}
/>

// Compact atomic view
<TaskCard 
  task={task}
  viewConfig={TaskCardConfigs.atomic}
  onUpdate={handleUpdate}
/>
```

### Custom Configuration
```tsx
<TaskCard 
  task={task}
  viewConfig={{
    view: 'custom',
    compact: true,
    draggable: false,
    showActions: true,
    showMetadata: false
  }}
  onUpdate={handleUpdate}
/>
```

## Error Handling

The TaskCard includes comprehensive error handling:

### Data Validation
```tsx
// Automatically validates and sanitizes:
const { isValid, sanitized, issues } = validateTask(rawTask);

// Handles corrupted data gracefully:
- Missing or null IDs → generates fallback ID
- Invalid titles → shows '[Corrupted Title]'  
- Bad priority values → defaults to 50
- Malformed tags → filters to valid tags only
- Invalid timestamps → uses current time
```

### Error States
- **Corruption Detection**: Shows warning UI for corrupted data
- **Graceful Degradation**: Continues to function with partial data
- **User Feedback**: Clear error messages via toast notifications

## Keyboard Navigation

Full keyboard support for accessibility:

| Key | Action |
|-----|--------|
| `Arrow Keys` | Navigate between tasks |
| `Enter/Space` | Select task |
| `E` | Enter edit mode |
| `Ctrl+Enter` | Save edits |
| `Escape` | Cancel edit mode |
| `Ctrl+Delete` | Delete task |

## View Configurations

Pre-built configurations for each view:

### Universal (Default)
- Selectable, no drag handle
- Full metadata display
- All actions available

### Kanban
- Draggable with drag handle
- Full feature set
- Optimized for column layout

### List  
- Keyboard-focused navigation
- No drag handle
- Full metadata display

### Matrix
- Compact layout
- Draggable for quadrant movement
- Essential metadata only

### Atomic
- Ultra-compact design
- Minimal UI for orbit display
- No actions menu

### Bubble
- Physics-friendly rendering
- No metadata display
- Touch-optimized

## Integration with Views

The TaskCard integrates seamlessly with all view systems:

### Task Store Integration
```tsx
import { useTaskStoreSync } from '@/stores/taskStore';

const { updateTask, deleteTask } = useTaskStoreSync();

<TaskCard 
  task={task}
  onUpdate={updateTask}
  onDelete={deleteTask}
/>
```

### Undo/Redo Support
```tsx
// Automatically integrated with crossViewUndoService
// All edit operations are tracked for undo/redo
```

### View Bus Events
```tsx
// Emits proper events for cross-view synchronization
// Handles 'task.moved', 'task.updated', etc.
```

## Testing

Comprehensive test suite covering:

- **Unit Tests**: All component logic and edge cases
- **Accessibility Tests**: ARIA compliance and keyboard navigation  
- **Error Handling**: Corruption scenarios and recovery
- **Performance Tests**: Large task sets and rapid interactions
- **Integration Tests**: Cross-view compatibility

Run tests:
```bash
npm test TaskCard
```

## Performance Considerations

- **Virtualization Ready**: Optimized for large lists
- **Debounced Auto-save**: Prevents excessive API calls
- **Memoized Calculations**: Efficient re-rendering
- **LOD Integration**: Reduced detail during interactions

## Migration Guide

### From KanbanTaskCard
```tsx
// Before
<KanbanTaskCard 
  task={task}
  isSelected={isSelected}
  onKeyboardMove={onKeyboardMove}
  onSelect={onSelect}
  position={position}
/>

// After  
<TaskCard 
  task={task}
  viewConfig={TaskCardConfigs.kanban}
  isSelected={isSelected}
  onKeyboardMove={onKeyboardMove}
  onSelect={onSelect}
  position={position}
/>
```

### From TaskListItem
```tsx
// Before
<TaskListItem 
  task={task}
  isSelected={isSelected}
  isFocused={isFocused}
  onUpdate={onUpdate}
  onDelete={onDelete}
  onToggleSelect={onToggleSelect}
  onFocus={onFocus}
  onKeyDown={onKeyDown}
/>

// After
<TaskCard 
  task={task}
  viewConfig={TaskCardConfigs.list}
  isSelected={isSelected}
  isFocused={isFocused}
  onUpdate={onUpdate}
  onDelete={onDelete}
  onSelect={onToggleSelect}
  onKeyboardMove={onKeyboardMove}
/>
```

## Future Enhancements

- **Rich Text Editing**: Enhanced description editing
- **Collaborative Editing**: Real-time collaboration support
- **Advanced Tagging**: Hierarchical and smart tags
- **AI Integration**: Smart suggestions and auto-completion
- **Offline Support**: Local-first editing capabilities