// The filters (search box and All/Uncontested/Linked) and the item picker are a Free feature (`filters`). A visitor
// can see them, but touching one opens the plans page. The guards sit on the containers' capture phase, so they
// stop the event before the tools' own handlers run.
import { hasFeature } from './session.js';
import { requireFeature } from './plans.js';

function guard(el, types) {
    if (!el) return;
    types.forEach(type => el.addEventListener(type, e => {
        if (hasFeature('filters')) return;
        e.preventDefault();
        e.stopPropagation();
        if (type === 'focusin') document.activeElement?.blur();
        requireFeature('filters');
    }, true));
}

// body.tools-locked paints the "Free account" tags (lobby.css)
const mark = () => document.body.classList.toggle('tools-locked', !hasFeature('filters'));
mark();
document.addEventListener('tft:userchange', mark);

guard(document.getElementById('comp-search-div'), ['focusin']);
guard(document.querySelector('.view-filter'), ['click']);
guard(document.getElementById('itemPicker'), ['click', 'dragstart']);
