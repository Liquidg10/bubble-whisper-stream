import React from 'react';
import { LocationIntelligencePanel } from '@/components/LocationIntelligencePanel';

export const Intelligence: React.FC = () => {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <LocationIntelligencePanel 
        onCreateReminder={() => {
          // TODO: Implement reminder creation modal
          console.log('Create reminder clicked');
        }}
        onViewSettings={() => {
          // TODO: Navigate to location settings
          console.log('View settings clicked');
        }}
      />
    </div>
  );
};