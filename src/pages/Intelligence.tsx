import React, { useState } from 'react';
import { LocationIntelligencePanel } from '@/components/LocationIntelligencePanel';
import { ReminderCreationModal } from '@/components/ReminderCreationModal';
import { useNavigate } from 'react-router-dom';

export const Intelligence: React.FC = () => {
  const [showReminderModal, setShowReminderModal] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <LocationIntelligencePanel 
        onCreateReminder={() => setShowReminderModal(true)}
        onViewSettings={() => navigate('/settings?tab=intelligence')}
      />
      
      <ReminderCreationModal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
      />
    </div>
  );
};