import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadOptionalFonts } from './loadOptionalFonts';
import './index.css';

export function mountApplication(root: HTMLElement): void {
  createRoot(root).render(<StrictMode><App /></StrictMode>);
  loadOptionalFonts(root.ownerDocument);
}
