import { tryLoadDefaultData } from './mainScreen/dataLoader.js';
import { applyQueryParams } from './mainScreen/shareUrl.js';
import { resetPlayers, toggleDoubleUpMode } from './mainScreen/players.js';
import { initViewTabs } from './viewTabs.js';
import './mainScreen/playerItems.js';

initViewTabs();

applyQueryParams();
tryLoadDefaultData();

window.toggleDoubleUpMode = toggleDoubleUpMode;
window.resetPlayers = resetPlayers;
