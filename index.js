import { Player } from './lib/player.js';
import { Parser } from './lib/parser.js';
import Terminal from './ext/term.cjs';

export const ViewTTY = {
    Parser: Parser,
    Player: Player,
    Terminal: Terminal,
};
