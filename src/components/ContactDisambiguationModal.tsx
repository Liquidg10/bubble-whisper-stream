import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, Mail, MessageSquare, Shield } from 'lucide-react';
import { ContactOption } from '@/services/contactDisambiguationService';

interface ContactDisambiguationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: ContactOption[];
  onSelectContact: (contact: ContactOption) => void;
  searchQuery: string;
}

export function ContactDisambiguationModal({
  isOpen,
  onClose,
  contacts,
  onSelectContact,
  searchQuery
}: ContactDisambiguationModalProps) {

  const handleSelect = (contact: ContactOption) => {
    onSelectContact(contact);
    onClose();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getInitials = (email: string, displayName?: string) => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getTrustColor = (trustScore: number) => {
    if (trustScore >= 0.8) return 'text-green-600';
    if (trustScore >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Multiple contacts found for "{searchQuery}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select the intended recipient. This helps prevent sending to the wrong person.
          </p>

          {contacts.map((contact, index) => (
            <Card key={contact.email} className="hover:bg-accent/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {getInitials(contact.email, contact.displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {contact.displayName || contact.email}
                      </span>
                      {contact.isAllowlisted && (
                        <Badge variant="secondary" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Trusted
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground mb-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs">
                        <span className={`flex items-center gap-1 ${getTrustColor(contact.trustScore)}`}>
                          Trust: {Math.round(contact.trustScore * 100)}%
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {contact.interactionCount} interactions
                        </span>
                        {contact.lastContacted && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(contact.lastContacted)}
                          </span>
                        )}
                      </div>
                    </div>

                    {contact.recentThreads.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Recent conversations:
                        </span>
                        {contact.recentThreads.slice(0, 2).map((thread) => (
                          <div key={thread.threadId} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                            <div className="truncate font-medium">{thread.subject}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span>{formatDate(thread.lastMessageDate)}</span>
                              <span>•</span>
                              <span>{thread.messageCount} messages</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => handleSelect(contact)}
                    size="sm"
                    className="shrink-0"
                  >
                    Select
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}