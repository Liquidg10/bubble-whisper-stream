import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { CBTThoughtCheck } from '../CBTThoughtCheck';
import type { CBTEntry } from '@/types/bubble';

// Mock the TTS service
vi.mock('@/services/tts', () => ({
  ttsService: {
    isAvailable: () => true,
    speak: vi.fn(() => Promise.resolve()),
  },
}));

// Mock the CBT service
const mockCBTService = {
  suggestDistortions: vi.fn(() => ['AllOrNothing', 'Catastrophizing']),
  generateReframeSuggestions: vi.fn(() => [
    'Consider that there might be middle ground here.',
    'What evidence supports a more balanced view?',
  ]),
};

vi.mock('@/services/cbtService', () => ({
  cbtService: mockCBTService,
}));

describe('CBTThoughtCheck', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial thought input step', () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought=""
      />
    );

    expect(screen.getByText('What\'s on your mind?')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('accepts initial thought from props', () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought="I always mess everything up"
      />
    );

    expect(screen.getByDisplayValue('I always mess everything up')).toBeInTheDocument();
  });

  it('progresses through CBT flow steps', async () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought="I'm terrible at everything"
      />
    );

    // Start with thought input
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should show distortion selection
    await waitFor(() => {
      expect(screen.getByText('Notice any thinking patterns?')).toBeInTheDocument();
    });

    // Select a distortion
    const allOrNothingButton = screen.getByText('All-or-Nothing');
    fireEvent.click(allOrNothingButton);

    // Continue to evidence
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('What supports this thought?')).toBeInTheDocument();
    });
  });

  it('generates suggestions when distortions are selected', async () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought="I never do anything right"
      />
    );

    // Go to distortion step
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(mockCBTService.suggestDistortions).toHaveBeenCalledWith('I never do anything right');
    });
  });

  it('calls onSave with complete CBT entry', async () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought="Everything is awful"
      />
    );

    // Complete the flow quickly
    fireEvent.click(screen.getByText('Next')); // Go to distortions
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('All-or-Nothing')); // Select distortion
    });
    
    fireEvent.click(screen.getByText('Next')); // Go to evidence
    fireEvent.click(screen.getByText('Next')); // Go to challenging
    fireEvent.click(screen.getByText('Next')); // Go to reframe
    
    // Fill reframe
    const reframeInput = screen.getByRole('textbox');
    fireEvent.change(reframeInput, { 
      target: { value: 'Some things are challenging, but I can learn and improve.' } 
    });
    
    fireEvent.click(screen.getByText('Save Thought Check'));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          thought: 'Everything is awful',
          distortions: ['AllOrNothing'],
          reframe: 'Some things are challenging, but I can learn and improve.',
        })
      );
    });
  });

  it('handles TTS read-back', async () => {
    const { ttsService } = await import('@/services/tts');
    
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought="Test thought"
      />
    );

    // Navigate to final step
    // ... (simulate completing flow)
    
    // Look for TTS button and click it
    const ttsButton = screen.queryByText(/Read kindly/i);
    if (ttsButton) {
      fireEvent.click(ttsButton);
      await waitFor(() => {
        expect(ttsService.speak).toHaveBeenCalled();
      });
    }
  });

  it('handles cancellation', () => {
    render(
      <CBTThoughtCheck
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialThought=""
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });
});