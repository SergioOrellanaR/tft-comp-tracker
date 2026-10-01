import { tryLoadDefaultData } from './mainScreen/dataLoader.js';
import { applyQueryParams } from './mainScreen/shareUrl.js';
import { initViewTabs } from './viewTabs.js';
import { countVisit } from './tftVersusHandler.js';
import './mainScreen/playerItems.js';
import './mainScreen/sortByRank.js';
import './account/lockedTools.js';

initViewTabs();
countVisit();

applyQueryParams();
tryLoadDefaultData();
