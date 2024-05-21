export declare class Player {
    _chunks: any;
    _frame: any;
    _startTime: any;
    _tickHandle: any;
    listeners: any;
    constructor();
    load(chunks: any): void;
    addListener(f: any): void;
    removeListener(f: any): void;
    play(): boolean;
    _emit(type: any, data?: any): void;
    pause(): void;
    rewind(): void;
    _step(): void;
}
//# sourceMappingURL=player.d.ts.map