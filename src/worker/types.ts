import { Card, GameState } from './game';

export type ClientMessage = 
    | { type: 'join'; name: string }
    | { type: 'start_game' }
    | { type: 'place_bid'; bid: number }
    | { type: 'play_card'; cardIndex: number };

export type ServerMessage =
    | { type: 'game_state'; state: GameState & { playerHand: Card[] } }
    | { type: 'error'; message: string }
    | { type: 'join_success'; playerId: string }
    | { type: 'player_joined'; id: string; name: string }
    | { type: 'game_started' }
    | { type: 'bid_placed'; playerId: string; bid: number }
    | { type: 'card_played'; playerId: string; card: Card }
    | { type: 'trick_won'; playerId: string }
    | { type: 'round_ended'; scores: Record<string, number> };
