import React, { useState } from 'react';
import { LocationIntelligencePanel } from '@/components/LocationIntelligencePanel';
import { ReminderCreationModal } from '@/components/ReminderCreationModal';
import { PlanManagementPanel } from '@/components/PlanManagementPanel';
import { useNavigate } from 'react-router-dom';

export const Intelligence: React.FC = () => {
  const [showReminderModal, setShowReminderModal] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LocationIntelligencePanel 
          onCreateReminder={() => setShowReminderModal(true)}
          onViewSettings={() => navigate('/settings?tab=intelligence')}
        />
        
        <PlanManagementPanel className="lg:col-span-1" />
      </div>
      
      <ReminderCreationModal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
      />
    </div>
  );
};