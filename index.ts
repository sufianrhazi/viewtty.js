import { Player } from './lib/player';
import { Parser } from './lib/parser';
import * as Terminal from './ext/term.cjs';

export const ViewTTY = {
    Parser: Parser,
    Player: Player,
    Terminal: Terminal.default,
};
