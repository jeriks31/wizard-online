import { Game } from './game';
import { ClientMessage, ServerMessage } from './types';

interface Env {
    GAME: DurableObjectNamespace;
}

interface Session {
    id: string;
    name: string;
    webSocket: WebSocket;
}

export class GameRoom implements DurableObject {
    private game: Game;
    private sessions: Session[];
    private gameStarted: boolean;
    private lastActivityTime: number;
    private cleanupInterval: any;
    private ctx: DurableObjectState;

    constructor(state: DurableObjectState) {
        this.ctx = state;
        this.game = new Game();
        this.sessions = [];
        this.gameStarted = false;
        this.lastActivityTime = Date.now();
        
        // Inactivity check
        this.cleanupInterval = setInterval(() => {
            const fiveMinutesAgo = Date.now() - 5* 60 * 1000;
            if (this.lastActivityTime < fiveMinutesAgo) {
                this.cleanup();
            }
        }, 60 * 1000);
    }

    async fetch(request: Request) {
        const url = new URL(request.url);

        if (url.pathname === '/websocket') {
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected websocket', { status: 400 });
            }

            const [client, server] = Object.values(new WebSocketPair());

            // Create session
            const sessionId = crypto.randomUUID();
            const session: Session = { id: sessionId, name: '', webSocket: server! };
            this.sessions.push(session);

            // Accept the WebSocket with hibernation support
            this.ctx.acceptWebSocket(server!);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        return new Response('Not found', { status: 404 });
    }

    async webSocketMessage(ws: WebSocket, data: string) {
        try {
            const session = this.sessions.find(s => s.webSocket === ws);
            if (!session) return;

            const message = JSON.parse(data) as ClientMessage;
            await this.handleMessage(session, message);
        } catch (err: any) {
            this.sendError(this.sessions.find(s => s.webSocket === ws)!, err.message);
        }
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        const session = this.sessions.find(s => s.webSocket === ws);
        if (!session) return;

        this.sessions = this.sessions.filter(s => s !== session);
        
        // Only remove player from game if the game hasn't started
        if (!this.gameStarted && session.name) {
            this.game.removePlayer(session.id);
            this.broadcast({
                type: 'player_left',
                id: session.id,
                name: session.name
            });
            this.broadcastGameState();
        }
    }

    async webSocketError(ws: WebSocket) {
        this.sessions = this.sessions.filter(s => s.webSocket !== ws);
    }

    private cleanup() {
        // Close all websocket connections
        for (const session of this.sessions) {
            try {
                session.webSocket.close(1000, "Game room cleaned up due to inactivity");
            } catch (e) { }
        }
        this.sessions = [];
        clearInterval(this.cleanupInterval);
    }

    private async handleMessage(session: Session, message: ClientMessage) {
        this.lastActivityTime = Date.now();
        switch (message.type) {
            case 'join':
                if (this.gameStarted) {
                    this.sendError(session, 'Game already in progress');
                    return;
                }
                session.name = message.name;
                if (this.game.addPlayer(session.id, message.name)) {
                    // Send success message to the joining player
                    this.sendMessage(session, {
                        type: 'join_success',
                        playerId: session.id
                    });
                    // Broadcast to all players that someone joined
                    this.broadcast({ 
                        type: 'player_joined',
                        id: session.id,
                        name: message.name
                    });
                    this.broadcastGameState();
                } else {
                    const gameState = this.game.getGameState(session.id);
                    const playerCount = Object.keys(gameState.players!).length;
                    const error = playerCount >= 6 
                        ? 'Game is full (maximum 6 players)' 
                        : 'A player with that name already exists';
                    this.sendError(session, error);
                }
                break;

            case 'start_game':
                if (this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                if (this.game.startGame()) {
                    this.gameStarted = true;
                    this.broadcast({ type: 'game_started' });
                    this.broadcastGameState();
                } else {
                    this.sendError(session, 'Not enough players to start');
                }
                break;

            case 'place_bid':
                if (!this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                if (this.game.placeBid(session.id, message.bid)) {
                    this.broadcast({
                        type: 'bid_placed',
                        playerId: session.id,
                        bid: message.bid
                    });
                    this.broadcastGameState();
                } else {
                    this.sendError(session, 'Invalid bid');
                }
                break;

            case 'play_card':
                if (!this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                const result = this.game.playCard(session.id, message.cardIndex);
                if (result.success) {
                    this.broadcastGameState();

                    if (result.trickComplete) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const { winner, roundComplete } = this.game.evaluateTrick();
                        this.broadcastGameState();
                        if (roundComplete) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            this.game.endRound();
                            this.broadcastGameState();
                        }
                    }
                } else {
                    this.sendError(session, 'Invalid card play');
                }
                break;
        }
    }

    private sendMessage(session: Session, message: ServerMessage) {
        this.lastActivityTime = Date.now();
        session.webSocket.send(JSON.stringify(message));
    }

    private sendError(session: Session, message: string) {
        this.sendMessage(session, { 
            type: 'error',
            message 
        });
    }

    private broadcast(message: ServerMessage) {
        this.sessions.forEach(session => this.sendMessage(session, message));
    }

    private broadcastGameState() {
        this.sessions.forEach(session => {
            const state = this.game.getGameState(session.id);
            this.sendMessage(session, {
                type: 'game_state',
                state
            } as ServerMessage);
        });
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const url = new URL(request.url);
        const gameId = url.searchParams.get('gameId');

        if (!gameId) {
            return new Response('Game ID required', { status: 400 });
        }

        const gameRoom = env.GAME.get(env.GAME.idFromName(gameId));
        return gameRoom.fetch(request);
    }
} as ExportedHandler;
