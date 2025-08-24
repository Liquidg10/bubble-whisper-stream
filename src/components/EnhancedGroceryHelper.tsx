import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { 
  ShoppingCart, 
  Plus, 
  Check, 
  MapPin, 
  Brain, 
  Camera,
  TrendingUp,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './ui/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';

interface GroceryItem {
  id: string;
  name: string;
  addedAt: string;
  priority?: 'low' | 'medium' | 'high';
}

interface IntelligentSuggestion {
  item: string;
  confidence: number;
  reason: string;
}

export function EnhancedGroceryHelper() {
  const { settings, updateSettings } = useBubbleStore();
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [suggestions, setSuggestions] = useState<IntelligentSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [lastReceiptScan, setLastReceiptScan] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load existing grocery list from localStorage
    const saved = localStorage.getItem('enhancedGroceryList');
    if (saved) {
      setGroceryList(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    // Auto-save grocery list
    localStorage.setItem('enhancedGroceryList', JSON.stringify(groceryList));
  }, [groceryList]);

  const addGroceryItem = (itemName: string, priority: 'low' | 'medium' | 'high' = 'medium') => {
    if (!itemName.trim()) return;
    
    const newGroceryItem: GroceryItem = {
      id: Date.now().toString(),
      name: itemName.trim(),
      addedAt: new Date().toISOString(),
      priority
    };
    
    setGroceryList([...groceryList, newGroceryItem]);
    setNewItem('');
  };

  const removeGroceryItem = (id: string) => {
    setGroceryList(groceryList.filter(item => item.id !== id));
  };

  const getIntelligentSuggestions = async () => {
    setIsLoadingSuggestions(true);
    try {
      // Simulate receipt data (in real app, this would come from receipt scanning)
      const mockReceiptData = {
        items: ['Milk', 'Bread', 'Eggs', 'Apples', 'Chicken'],
        purchaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
        total: 45.67
      };

      const { data, error } = await supabase.functions.invoke('grocery-intelligence', {
        body: {
          receiptData: mockReceiptData,
          currentGroceryList: groceryList.map(item => item.name)
        }
      });

      if (error) throw error;

      if (data.success) {
        setSuggestions(data.suggestions);
        toast({
          title: "Smart Suggestions Updated",
          description: `Found ${data.suggestions.length} intelligent suggestions`,
        });
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      toast({
        title: "Suggestions Failed",
        description: "Unable to get intelligent suggestions",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const addSuggestion = (suggestion: IntelligentSuggestion) => {
    addGroceryItem(suggestion.item, suggestion.confidence > 0.7 ? 'high' : 'medium');
    setSuggestions(suggestions.filter(s => s.item !== suggestion.item));
  };

  const scanReceipt = async () => {
    // Trigger receipt scanning (would integrate with camera/photo capture)
    toast({
      title: "Receipt Scanning",
      description: "This would integrate with your camera to scan recent receipts",
    });
    
    // Mock a successful scan
    setLastReceiptScan(new Date().toISOString());
    await getIntelligentSuggestions();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 border-red-200';
      case 'medium': return 'text-orange-600 border-orange-200';
      case 'low': return 'text-green-600 border-green-200';
      default: return 'text-muted-foreground border-border';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge variant="destructive" className="text-xs">High</Badge>;
      case 'medium': return <Badge variant="secondary" className="text-xs">Med</Badge>;
      case 'low': return <Badge variant="outline" className="text-xs">Low</Badge>;
      default: return null;
    }
  };

  if (!settings.groceryHelperEnabled) {
    return null;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-green-600" />
          Enhanced Grocery Helper
          <Badge variant="secondary">AI-Powered</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Item */}
        <div className="flex gap-2">
          <Input
            placeholder="Add grocery item..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addGroceryItem(newItem)}
            className="flex-1"
          />
          <Button onClick={() => addGroceryItem(newItem)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Intelligence Actions */}
        <div className="flex gap-2">
          <Button
            onClick={getIntelligentSuggestions}
            disabled={isLoadingSuggestions}
            variant="outline"
            className="flex-1"
          >
            <Brain className="h-4 w-4 mr-2" />
            {isLoadingSuggestions ? 'Analyzing...' : 'Smart Suggestions'}
          </Button>
          <Button onClick={scanReceipt} variant="outline">
            <Camera className="h-4 w-4 mr-2" />
            Scan Receipt
          </Button>
        </div>

        {/* Intelligent Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-sm">Smart Suggestions</span>
            </div>
            {suggestions.map((suggestion, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex-1">
                  <div className="font-medium">{suggestion.item}</div>
                  <div className="text-xs text-muted-foreground">{suggestion.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {Math.round(suggestion.confidence * 100)}% confidence
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => addSuggestion(suggestion)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grocery List */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Your List ({groceryList.length} items)</span>
          </div>
          {groceryList.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-3 bg-background rounded border ${getPriorityColor(item.priority || 'medium')}`}
            >
              <div className="flex items-center gap-2">
                <span>{item.name}</span>
                {getPriorityBadge(item.priority || 'medium')}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroceryItem(item.id)}
                className="h-6 w-6 p-0"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          ))}
          
          {groceryList.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No items in your grocery list
            </div>
          )}
        </div>

        {/* Location Reminder */}
        <Alert>
          <MapPin className="h-4 w-4" />
          <AlertDescription>
            <strong>Location Intelligence:</strong> We'll gently remind you about your list when you're near stores you've visited before.
            {lastReceiptScan && (
              <div className="mt-1 text-xs flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last receipt scan: {new Date(lastReceiptScan).toLocaleDateString()}
              </div>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}