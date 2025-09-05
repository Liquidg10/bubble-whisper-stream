import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit } from "lucide-react";
import { budgetService, BudgetEnvelope } from "@/services/budgetService";
import { isFeatureEnabled } from "@/config/flags";

interface BudgetEnvelopeManagerProps {
  className?: string;
}

export function BudgetEnvelopeManager({ className }: BudgetEnvelopeManagerProps) {
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<BudgetEnvelope | null>(null);
  const [newEnvelope, setNewEnvelope] = useState({
    name: '',
    monthlyLimit: 0,
    currency: 'USD',
    color: '#3b82f6'
  });

  const loadEnvelopes = async () => {
    const data = await budgetService.getEnvelopes();
    setEnvelopes(data);
  };

  useEffect(() => {
    if (isFeatureEnabled('budget')) {
      loadEnvelopes();
    }
  }, []);

  const handleCreateEnvelope = async () => {
    if (!newEnvelope.name || newEnvelope.monthlyLimit <= 0) return;
    
    await budgetService.saveEnvelope({
      ...newEnvelope,
      spent: 0
    });
    
    setNewEnvelope({
      name: '',
      monthlyLimit: 0,
      currency: 'USD',
      color: '#3b82f6'
    });
    setIsCreateOpen(false);
    loadEnvelopes();
  };

  const handleUpdateEnvelope = async () => {
    if (!editingEnvelope) return;
    
    await budgetService.updateEnvelope(editingEnvelope.id, editingEnvelope);
    setEditingEnvelope(null);
    loadEnvelopes();
  };

  const handleDeleteEnvelope = async (id: string) => {
    await budgetService.deleteEnvelope(id);
    loadEnvelopes();
  };

  if (!isFeatureEnabled('budget')) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Budget Envelopes</CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Envelope
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Budget Envelope</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Envelope Name</Label>
                  <Input
                    id="name"
                    value={newEnvelope.name}
                    onChange={(e) => setNewEnvelope(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Groceries, Dining Out"
                  />
                </div>
                <div>
                  <Label htmlFor="limit">Monthly Limit</Label>
                  <Input
                    id="limit"
                    type="number"
                    value={newEnvelope.monthlyLimit}
                    onChange={(e) => setNewEnvelope(prev => ({ ...prev, monthlyLimit: Number(e.target.value) }))}
                    placeholder="500"
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={newEnvelope.currency}
                    onChange={(e) => setNewEnvelope(prev => ({ ...prev, currency: e.target.value }))}
                    placeholder="USD"
                  />
                </div>
                <div>
                  <Label htmlFor="color">Color</Label>
                  <input
                    id="color"
                    type="color"
                    value={newEnvelope.color}
                    onChange={(e) => setNewEnvelope(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full h-10 rounded border"
                  />
                </div>
                <Button onClick={handleCreateEnvelope} className="w-full">
                  Create Envelope
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {envelopes.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No budget envelopes yet. Create one to start tracking expenses from receipts.
            </p>
          ) : (
            envelopes.map((envelope) => (
              <div
                key={envelope.id}
                className="border rounded-lg p-4 space-y-3"
                style={{ borderLeftColor: envelope.color, borderLeftWidth: '4px' }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{envelope.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {envelope.currency} {envelope.spent.toFixed(2)} / {envelope.monthlyLimit.toFixed(2)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingEnvelope(envelope)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteEnvelope(envelope.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Progress
                  value={envelope.monthlyLimit > 0 ? (envelope.spent / envelope.monthlyLimit) * 100 : 0}
                  className="h-2"
                />
                <p className="text-sm text-muted-foreground">
                  {envelope.monthlyLimit > 0 
                    ? `${Math.round((envelope.spent / envelope.monthlyLimit) * 100)}% spent this month`
                    : 'No limit set'
                  }
                </p>
              </div>
            ))
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingEnvelope} onOpenChange={() => setEditingEnvelope(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Budget Envelope</DialogTitle>
            </DialogHeader>
            {editingEnvelope && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Envelope Name</Label>
                  <Input
                    id="edit-name"
                    value={editingEnvelope.name}
                    onChange={(e) => setEditingEnvelope(prev => prev ? { ...prev, name: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-limit">Monthly Limit</Label>
                  <Input
                    id="edit-limit"
                    type="number"
                    value={editingEnvelope.monthlyLimit}
                    onChange={(e) => setEditingEnvelope(prev => prev ? { ...prev, monthlyLimit: Number(e.target.value) } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-currency">Currency</Label>
                  <Input
                    id="edit-currency"
                    value={editingEnvelope.currency}
                    onChange={(e) => setEditingEnvelope(prev => prev ? { ...prev, currency: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-color">Color</Label>
                  <input
                    id="edit-color"
                    type="color"
                    value={editingEnvelope.color}
                    onChange={(e) => setEditingEnvelope(prev => prev ? { ...prev, color: e.target.value } : null)}
                    className="w-full h-10 rounded border"
                  />
                </div>
                <Button onClick={handleUpdateEnvelope} className="w-full">
                  Update Envelope
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}