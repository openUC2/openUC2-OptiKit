import { useEffect } from 'react';
import introJs from 'intro.js';
import 'intro.js/introjs.css';
import { useAppStore } from '../stores/appStore';

export const Tutorial = () => {
  const { tutorialCompleted, setTutorialCompleted } = useAppStore();

  useEffect(() => {
    // Only show tutorial on first visit
    if (!tutorialCompleted) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startTutorial();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [tutorialCompleted]);

  const startTutorial = () => {
    const intro = introJs();
    
    intro.setOptions({
      nextLabel: 'Next →',
      prevLabel: '← Back',
      skipLabel: 'Skip Tutorial',
      doneLabel: 'Get Started!',
      showProgress: true,
      showBullets: false,
      exitOnOverlayClick: false,
      exitOnEsc: true,
      steps: [
        {
          title: 'Welcome to OptiKit! 🔬',
          intro: `
            <div style="text-align: center;">
              <p>OptiKit is a 2D grid builder for designing OpenUC2 optical setups.</p>
              <p>Let's take a quick tour of the main features!</p>
            </div>
          `
        },
        {
          element: '[data-tour="part-library"]',
          title: 'Part Library 📦',
          intro: 'Browse and search through various optical components. Drag any part onto the canvas to place it in your setup.',
          position: 'right'
        },
        {
          element: '[data-tour="canvas"]',
          title: 'Design Canvas 🎨',
          intro: 'This is where you build your optical setup. Drop components here, move them around, and create your design.',
          position: 'left'
        },
        {
          element: '[data-tour="toolbar-drawing"]',
          title: 'Drawing Tools ✏️',
          intro: 'Use these tools to add annotations: draw lines, arrows, optical axes, and add text labels to document your setup.',
          position: 'bottom'
        },
        {
          element: '[data-tour="toolbar-actions"]',
          title: 'Save & Share 💾',
          intro: 'Save your work, generate shareable links, export as images or STL files, and even save directly to GitHub.',
          position: 'bottom'
        },
        {
          element: '[data-tour="layers-tab"]',
          title: 'Layers 📚',
          intro: 'Organize your setup into multiple layers. Perfect for complex designs with different optical planes.',
          position: 'left'
        },
        {
          element: '[data-tour="properties-tab"]',
          title: 'Properties ⚙️',
          intro: 'View and edit component properties, setup metadata, and configuration details.',
          position: 'left'
        },
        {
          element: '[data-tour="bom-tab"]',
          title: 'Bill of Materials 📋',
          intro: 'See a complete list of all components in your setup, with quantities and details for ordering.',
          position: 'left'
        }
      ]
    });

    intro.onbeforechange(() => {
      // Ensure right sidebar is open for the tabs tour
      const step = intro.currentStep();
      if (step !== undefined && step >= 5 && step <= 7) {
        // Switch to appropriate tab for demonstration
        const { setActiveRightTab } = useAppStore.getState();
        if (step === 5) setActiveRightTab('layers');
        if (step === 6) setActiveRightTab('properties');
        if (step === 7) setActiveRightTab('bom');
      }
      return true;
    });

    intro.oncomplete(() => {
      setTutorialCompleted(true);
    });

    intro.onexit(() => {
      setTutorialCompleted(true);
    });

    intro.start();
  };

  // Public method to restart tutorial
  const restartTutorial = () => {
    setTutorialCompleted(false);
    setTimeout(() => startTutorial(), 100);
  };

  // Expose restart function globally for help button
  useEffect(() => {
    (window as any).restartTutorial = restartTutorial;
    return () => {
      delete (window as any).restartTutorial;
    };
  }, []);

  return null; // This component doesn't render anything
};