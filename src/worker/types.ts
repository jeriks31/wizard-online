// Game Types
export interface ICard {
    suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'special';
    value: number | 'wizard' | 'jester';
    playedBy?: string;
}

export interface IPlayer {
    id: string;
    name: string;
    isHuman: boolean;
    connected: boolean;
    hand: ICard[];
    tricks: number;
    bid: number | null;
    score: number;
    initialHandStrength: number;  // Strength of hand at start of round
}

export interface ISpectator {
    id: string;
    name: string;
    connected: boolean;
}

export interface IPlayerRoundResult {
    playerId: string;
    bid: number;
    tricks: number;
    score: number;
    handStrength: number;    // Total strength of the hand at start of round
}

export interface IRoundHistory {
    roundNumber: number;
    playerResults: IPlayerRoundResult[];
    playerCount: number;     // Number of players in the game
}

export interface IGameState {
    players: Record<string, IPlayer>;
    spectators: Record<string, ISpectator>;
    currentRound: number;
    trumpCard: ICard | null;
    currentTrick: ICard[];
    leadingPlayerId: string | null;
    activePlayerId: string | null;
    phase: 'waiting' | 'bidding' | 'playing' | 'scoring' | 'finished';
    leadSuit: string | null;
    roundHistory: IRoundHistory[]; //Book of lies
}

// Message Types
export type ClientMessage = 
    | { type: 'join'; name: string }
    | { type: 'spectate'; name: string }
    | { type: 'start_game' }
    | { type: 'place_bid'; bid: number }
    | { type: 'play_card'; cardIndex: number }
    | { type: 'add_bot' };

export type ServerMessage =
    | { type: 'game_state'; state: IGameState }
    | { type: 'error'; message: string }
    | { type: 'join_success'; playerId: string }
    | { type: 'player_joined'; id: string; name: string; isSpectator: boolean }
    | { type: 'player_left'; id: string; name: string }
    | { type: 'game_started' }
    | { type: 'bid_placed'; playerId: string; bid: number }
    | { type: 'card_played'; playerId: string; card: ICard }
    | { type: 'trick_won'; playerId: string }
    | { type: 'round_ended'; scores: Record<string, number> };
