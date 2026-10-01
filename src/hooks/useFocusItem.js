import { useEffect } from 'react';

// When a Ctrl+K search result opens a page at #<item-id>, scroll that item into view and flash a
// highlight round it. `ready` is anything that changes once the page's items have loaded (e.g. their
// count). Also runs when a result lands on the page already open (the palette fires popstate).
export function useFocusItem(ready) {
  useEffect(() => {
    if (!ready) return undefined;
    let timer = null;
    const run = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      clearInterval(timer);
      let tries = 0;
      timer = setInterval(() => {
        const el = document.getElementById(id);
        if (!el && ++tries < 20) return;
        clearInterval(timer);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ims-focus-flash');
        setTimeout(() => el.classList.remove('ims-focus-flash'), 2600);
      }, 150);
    };
    run();
    window.addEventListener('popstate', run);
    return () => { clearInterval(timer); window.removeEventListener('popstate', run); };
  }, [ready]);
}
