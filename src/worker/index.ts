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

export class GameRoom {
    private game: Game;
    private sessions: Session[];
    private gameStarted: boolean;

    constructor() {
        this.game = new Game();
        this.sessions = [];
        this.gameStarted = false;
    }

    async fetch(request: Request) {
        const url = new URL(request.url);

        if (url.pathname === '/websocket') {
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected websocket', { status: 400 });
            }

            const [client, server] = Object.values(new WebSocketPair());
            await this.handleSession(server!);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        return new Response('Not found', { status: 404 });
    }

    async handleSession(webSocket: WebSocket) {
        webSocket.accept();

        // Generate a unique ID for the session
        const sessionId = crypto.randomUUID();
        const session: Session = { id: sessionId, name: '', webSocket };
        
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
            // TODO: Handle player disconnection in game
        });

        webSocket.addEventListener('error', () => {
            this.sessions = this.sessions.filter(s => s !== session);
        });
    }

    private async handleMessage(session: Session, message: ClientMessage) {
        switch (message.type) {
            case 'join':
                if (this.gameStarted) {
                    this.sendError(session, 'Game already in progress');
                    return;
                }
                session.name = message.name;
                if (this.game.addPlayer(session.id, message.name)) {
                    this.sessions.push(session);
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
                    this.sendError(session, 'Game already started');
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
                    this.sendError(session, 'Game not started');
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
                    this.sendError(session, 'Game not started');
                    return;
                }
                if (this.game.playCard(session.id, message.cardIndex)) {
                    const playerState = this.game.getGameState(session.id);
                    this.broadcast({
                        type: 'card_played',
                        playerId: session.id,
                        card: playerState.currentTrick![playerState.currentTrick!.length - 1]!
                    });
                    this.broadcastGameState();
                } else {
                    this.sendError(session, 'Invalid card play');
                }
                break;
        }
    }

    private sendMessage(session: Session, message: ServerMessage) {
        session.webSocket.send(JSON.stringify(message));
    }

    private sendError(session: Session, message: string) {
        this.sendMessage(session, { 
            type: 'error',
            message 
        });
    }

    private broadcast(message: ServerMessage) {
        const messageStr = JSON.stringify(message);
        this.sessions.forEach(session => session.webSocket.send(messageStr));
    }

    private broadcastGameState() {
        this.sessions.forEach(session => {
            try {
                const state = this.game.getGameState(session.id);
                session.webSocket.send(JSON.stringify({
                    type: 'game_state',
                    state
                } as ServerMessage));
            } catch (err) {
                // Handle case where player might not be in game yet
            }
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
