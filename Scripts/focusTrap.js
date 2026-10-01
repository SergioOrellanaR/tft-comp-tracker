// Keeps keyboard focus inside a modal while it's open and gives it back to what had it when it closes.
// The container's content may be rebuilt while it's open (the account dialog swaps views), so the focusable
// elements are looked up on every Tab. Returns the function that releases the trap.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(container) {
    const opener = document.activeElement;
    const onKey = e => {
        if (e.key !== 'Tab') return;
        const list = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!list.length) { e.preventDefault(); container.focus?.(); return; }
        const first = list[0];
        const last = list.at(-1);
        if (!container.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    document.addEventListener('keydown', onKey);
    return () => {
        document.removeEventListener('keydown', onKey);
        if (opener?.isConnected) opener.focus?.();
    };
}
