import { useState, useEffect, useCallback } from 'react';
import { IGameState, ClientMessage, ServerMessage } from '../../worker/types';

interface GameStateHook {
    gameState: IGameState | null;
    isConnected: boolean;
    error: string | null;
    playerId: string | null;
    lastTrickWinner: string | null;
    joinGame: (name: string) => void;
    startGame: () => void;
    addBotPlayer: () => void;
    placeBid: (bid: number) => void;
    playCard: (cardIndex: number) => void;
}

const WORKER_URL = process.env.NODE_ENV === 'development'
    ? ''
    : 'wss://wizard-online.januxii00.workers.dev';

export function useGameState(gameId: string): GameStateHook {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [gameState, setGameState] = useState<IGameState | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastTrickWinner, setLastTrickWinner] = useState<string | null>(null);

    useEffect(() => {
        if (!gameId) return;
        const ws = new WebSocket(`${WORKER_URL}/websocket?gameId=${gameId}`);
        
        ws.onopen = () => {
            setIsConnected(true);
            setError(null);
        };

        ws.onclose = (ev: CloseEvent) => {
            setIsConnected(false);
            setError('Disconnected from server: ' + ev.reason);
        };

        ws.onerror = () => {
            setError('Connection error');
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as ServerMessage;
            
            switch (message.type) {
                case 'game_state':
                    if (message.state) {
                        setGameState(message.state);
                    } else {
                        setGameState(null);
                    }
                    break;
                case 'error':
                    setError(message.message);
                    break;
                case 'join_success':
                    setPlayerId(message.playerId);
                    break;
                case 'trick_won':
                    setLastTrickWinner(message.playerId);
                    setTimeout(() => setLastTrickWinner(null), 2000);
                    break;
                case 'player_joined':
                case 'game_started':
                case 'bid_placed':
                case 'card_played':
                case 'round_ended':
                    // These events will trigger a game state update
                    break;
            }
        };

        setSocket(ws);

        return () => {
            ws.close();
        };
    }, [gameId]);

    const sendMessage = useCallback((message: ClientMessage) => {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            setError(null);
        } else {
            // If not connected, retry after a short delay
            setTimeout(() => {
                if (socket?.readyState === WebSocket.OPEN) {
                    sendMessage(message);
                } else {
                    setError('Failed to connect to server. Please try again.');
                }
            }, 1000);
        }
    }, [socket]);

    const joinGame = useCallback((name: string) => {
        setError(null); // Clear any previous errors
        sendMessage({ type: 'join', name });
    }, [sendMessage, setError]);

    const startGame = useCallback(() => {
        sendMessage({ type: 'start_game' });
    }, [sendMessage]);

    const addBotPlayer = useCallback(() => {
        sendMessage({ type: 'add_bot' });
    }, [sendMessage]);

    const placeBid = useCallback((bid: number) => {
        sendMessage({ type: 'place_bid', bid });
    }, [sendMessage]);

    const playCard = useCallback((cardIndex: number) => {
        sendMessage({ type: 'play_card', cardIndex });
    }, [sendMessage]);

    return {
        gameState,
        isConnected,
        error,
        playerId,
        lastTrickWinner,
        joinGame,
        startGame,
        addBotPlayer,
        placeBid,
        playCard
    };
}
