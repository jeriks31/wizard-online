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

export class GameManager {
    private rooms: Map<string, GameRoom>;

    constructor() {
        this.rooms = new Map();
    }

    async fetch(request: Request) {
        const url = new URL(request.url);
        const gameId = url.searchParams.get('gameId');

        if (!gameId) {
            return new Response('Game ID required', { status: 400 });
        }

        // Get or create game room
        let gameRoom = this.rooms.get(gameId);
        if (!gameRoom) {
            gameRoom = new GameRoom();
            this.rooms.set(gameId, gameRoom);
        }

        if (url.pathname === '/websocket') {
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected websocket', { status: 400 });
            }

            const [client, server] = Object.values(new WebSocketPair());
            await gameRoom.handleSession(server!);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        return new Response('Not found', { status: 404 });
    }
}

class GameRoom {
    private game: Game;
    private sessions: Session[];
    private gameStarted: boolean;
    private lastActivityTime: number;
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor() {
        this.game = new Game(() => this.broadcastGameState());
        this.sessions = [];
        this.gameStarted = false;
        this.lastActivityTime = Date.now();
        
        // Inactivity check
        this.cleanupInterval = setInterval(() => {
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            if (this.lastActivityTime < fiveMinutesAgo) {
                this.cleanup();
            }
        }, 60 * 1000);
    }

    async handleSession(webSocket: WebSocket) {
        webSocket.accept();

        // Generate a unique ID for the session
        const sessionId = crypto.randomUUID();
        const session: Session = { id: sessionId, name: '', webSocket };

        this.sessions.push(session);

        webSocket.addEventListener('message', async (msg) => {
            try {
                const data = JSON.parse(msg.data as string) as ClientMessage;
                await this.handleMessage(session, data);
            } catch (err: any) {
                this.sendError(session, err.message);
            }
        });

        webSocket.addEventListener('close', () => {
            this.sessions = this.sessions.filter(s => s !== session);
            
            // Only remove player from game if the game hasn't started
            if (!this.gameStarted && session.name) {
                // Remove player from game state
                this.game.removePlayer(session.id);
            }
        });

        webSocket.addEventListener('error', () => {
            this.sessions = this.sessions.filter(s => s !== session);
        });
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
                if (this.game.addPlayer(session.id, message.name, true)) {
                    // Send success message to the joining player
                    this.sendMessage(session, {
                        type: 'join_success',
                        playerId: session.id
                    });
                    // Broadcast to all players that someone joined
                    this.broadcast({ 
                        type: 'player_joined',
                        id: session.id,
                        name: message.name,
                        isSpectator: false
                    });
                } else {
                    const gameState = this.game.getGameState(session.id);
                    const playerCount = Object.keys(gameState.players).length;
                    const error = playerCount >= 6 
                        ? 'Game is full (maximum 6 players)' 
                        : 'A player with that name already exists';
                    this.sendError(session, error);
                }
                break;

            case 'spectate':
                session.name = message.name;
                if (this.game.addSpectator(session.id, message.name)) {
                    // Send success message to the joining spectator
                    this.sendMessage(session, {
                        type: 'join_success',
                        playerId: session.id
                    });
                    // Broadcast to all players that someone joined as spectator
                    this.broadcast({ 
                        type: 'player_joined',
                        id: session.id,
                        name: message.name,
                        isSpectator: true
                    });
                } else {
                    this.sendError(session, 'Failed to join as spectator');
                }
                break;

            case 'start_game':
                if (this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                if (await this.game.startGame()) {
                    this.gameStarted = true;
                } else {
                    this.sendError(session, 'Not enough players to start');
                }
                break;

            case 'place_bid':
                if (!this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                if (!(await this.game.placeBid(session.id, message.bid))) {
                    this.sendError(session, 'Invalid bid');
                }
                break;

            case 'play_card':
                if (!this.gameStarted) {
                    this.sendError(session, 'Invalid game state, create a new lobby');
                    return;
                }
                if (!(await this.game.playCard(session.id, message.cardIndex))) {
                    this.sendError(session, 'Invalid card play');
                }
                break;
            case 'add_bot':
                if (this.gameStarted) {
                    this.sendError(session, 'Game already in progress');
                    return;
                }
                const { id, name, success } = this.game.addBotPlayer();
                if (success) {
                    // Broadcast to all players that someone joined
                    this.broadcast({
                        type: 'player_joined',
                        id: id,
                        name: name,
                        isSpectator: false
                    });
                } else {
                    this.sendError(session, "Failed to add bot player");
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
    fetch: async (request: Request, env: Env) => {
        const gameManager = env.GAME.get(env.GAME.idFromName('singleton'));
        return gameManager.fetch(request);
    }
} as ExportedHandler;
