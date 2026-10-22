/* Shared by the server page (inline script) and the client motion hook — no 'use client'. */

/** Set by the homepage's pre-paint guard script while it is waiting for this scene. */
export const MOTION_FLAG = 'data-dv-motion';

/**
 * Pre-paint guard (rendered as an inline script by the server page): hides only the hero headline
 * words until GSAP has taken over, so they never flash in their final place first. Skipped for
 * reduced-motion users and lifted after 2.5 s if GSAP never loads — the page can never stay hidden.
 */
export const MOTION_GUARD = `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var b=document.body;b.setAttribute('${MOTION_FLAG}','');setTimeout(function(){if(!window.__dvMotionReady)b.removeAttribute('${MOTION_FLAG}')},2500)}catch(e){}})();`;
