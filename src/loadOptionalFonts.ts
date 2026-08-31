const FONT_LINK_ID = 'mind-manual-optional-fonts';

/** Typography is optional: an offline/blocked font provider must not stop App. */
export function loadOptionalFonts(document: Document): void {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap';
  document.head.appendChild(link);
}
