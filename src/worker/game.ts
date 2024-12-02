import { ICard, IGameState } from './types';
import { Bot } from './bot';

export class Game {
    private state: IGameState;
    private broadcastState: () => void; // Function to send game state updates to all clients

    constructor(broadcastState: () => void) {
        this.state = {
            players: {},
            spectators: {},
            currentRound: 0,
            trumpCard: null,
            currentTrick: [],
            leadingPlayerId: null,
            activePlayerId: null,
            phase: 'waiting',
            leadSuit: null,
        };
        this.broadcastState = broadcastState;
    }

    public addPlayer(id: string, name: string, isHuman: boolean): boolean {
        if (Object.keys(this.state.players).length >= 6) return false;
        
        this.state.players[id] = {
            id,
            name,
            isHuman,
            connected: true,
            hand: [],
            tricks: 0,
            bid: null,
            score: 0
        };
        
        this.broadcastState();
        return true;
    }

    public addSpectator(id: string, name: string): boolean {
        // If they're already a spectator, return false
        if (id in this.state.spectators) return false;

        // If they're currently a player, remove them from players first
        if (id in this.state.players) {
            delete this.state.players[id];
        }

        this.state.spectators[id] = {
            id,
            name,
            connected: true
        };
        
        this.broadcastState();
        return true;
    }

    public addBotPlayer(): { id: string, name: string, success: boolean } {
        const botsInGame = Object.values(this.state.players).filter(p => !p.isHuman).length;
        const botId = `bot-${botsInGame + 1}`;
        const botName = `Bot ${botsInGame + 1}`;
        
        return { id: botId, name: botName, success: this.addPlayer(botId, botName, false)};
    }

    public async startGame(): Promise<boolean> {
        if (Object.keys(this.state.players).length < 3) return false;
        
        this.state.currentRound = 1;
        this.dealCards();
        this.state.phase = 'bidding';
        
        // Set initial active player for bidding
        const playerIds = Object.keys(this.state.players);
        this.state.leadingPlayerId = playerIds[0] ?? null;
        this.state.activePlayerId = playerIds[0] ?? null;
        
        this.broadcastState();
        await this.handleBotTurn();
        return true;
    }

    private dealCards(): void {
        let deck = this.shuffleDeck(this.createDeck());
        
        // Clear existing hands
        for (const player of Object.values(this.state.players)) {
            player.hand = [];
            player.tricks = 0;
            player.bid = null;
        }

        // Deal cards based on current round
        const playerIds = Object.keys(this.state.players);
        for (let i = 0; i < this.state.currentRound; i++) {
            for (const playerId of playerIds) {
                const card = deck.pop();
                if (card) {
                    const player = this.state.players[playerId];
                    if (player) {
                        player.hand.push(card);
                        player.hand.sort((a, b) => {
                            if (a.suit < b.suit) return -1;
                            if (a.suit > b.suit) return 1;
                            if (a.value < b.value) return -1;
                            if (a.value > b.value) return 1;  
                            return 0;
                            });
                    }
                }
            }
        }

        // Set trump card if there are cards remaining
        this.state.trumpCard = deck.pop() ?? null;
    }

    private createDeck(): ICard[] {
        const deck: ICard[] = [];
        const suits: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        
        // Add regular cards
        for (const suit of suits) {
            for (let value = 1; value <= 13; value++) {
                deck.push({ suit, value });
            }
        }
        
        // Add Wizards and Jesters
        for (let i = 0; i < 4; i++) {
            deck.push({ suit: 'special', value: 'wizard' });
            deck.push({ suit: 'special', value: 'jester' });
        }
        
        return deck;
    }

    private shuffleDeck(deck: ICard[]): ICard[] {
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j]!, deck[i]!];
        }
        return deck;
    }

    public async placeBid(playerId: string, bid: number): Promise<boolean> {
        const player = this.state.players[playerId];
        if (!player || this.state.phase !== 'bidding' || playerId !== this.state.activePlayerId) {
            return false;
        }

        if (bid < 0 || bid > this.state.currentRound) {
            return false;
        }

        // Check if this is the last player to bid
        const unbidPlayers = Object.values(this.state.players).filter(p => p.bid === null);
        if (unbidPlayers.length === 1 && unbidPlayers[0]?.id === playerId) {
            // Calculate total bids from other players
            const totalBidsFromOthers = Object.values(this.state.players)
                .filter(p => p.bid !== null)
                .reduce((sum, p) => sum + (p.bid ?? 0), 0);
            
            // If this bid would make total bids equal current round, reject it
            if (totalBidsFromOthers + bid === this.state.currentRound) {
                return false;
            }
        }

        player.bid = bid;
        this.moveToNextPlayer();

        // Check if all players have bid
        const allBid = Object.values(this.state.players).every(p => p.bid !== null);
        if (allBid) {
            this.state.phase = 'playing';
        }

        this.broadcastState();
        await this.handleBotTurn();
        return true;
    }

    public async playCard(playerId: string, cardIndex: number): Promise<boolean> {
        const player = this.state.players[playerId];
        if (!player || 
            this.state.phase !== 'playing' || 
            playerId !== this.state.activePlayerId ||
            cardIndex < 0 || 
            cardIndex >= player.hand.length) {
            return false;
        }

        const card = player.hand[cardIndex]!;
        
        // Check if player must follow suit
        if (!this.isPlayableCard(card, player.hand)) {
            return false;
        }

        // Remove card from hand and add to current trick
        player.hand.splice(cardIndex, 1);
        card.playedBy = playerId;
        this.state.currentTrick.push(card);

        // Set lead suit if this is the first non-special card
        if (!this.state.leadSuit && card.suit !== 'special') {
            this.state.leadSuit = card.suit;
        }

        if (this.state.currentTrick.length === Object.keys(this.state.players).length) {
            this.state.phase = 'scoring';
            this.broadcastState();
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.evaluateTrick();
        } else {
            this.moveToNextPlayer();
            this.broadcastState();
        }

        await this.handleBotTurn();
        return true;
    }

    public async handleBotTurn(): Promise<void> {
        const activePlayer = this.state.activePlayerId ? this.state.players[this.state.activePlayerId] : null;
        if (!activePlayer || activePlayer.isHuman) return;

        await Bot.handleTurn(
            this.state,
            activePlayer.id,
            {
                placeBid: (bid) => this.placeBid(activePlayer.id, bid),
                playCard: (cardIndex) => this.playCard(activePlayer.id, cardIndex),
                isPlayableCard: (card, hand) => this.isPlayableCard(card, hand)
            }
        );
    }

    public async evaluateTrick(): Promise<string> {
        const winner = this.determineTrickWinner();

        const player = this.state.players[winner];
        if (player) {
            player.tricks++;
        }
        // Winner of the trick leads the next trick
        this.state.leadingPlayerId = winner;
        this.state.activePlayerId = winner;
        this.state.currentTrick = [];
        this.state.leadSuit = null;
        this.state.phase = 'playing';

        // Check if round is complete
        if (Object.values(this.state.players).every(p => p.hand.length === 0)) {
            this.broadcastState();
            await new Promise(resolve => setTimeout(resolve, 100));
            this.endRound();
            return winner;
        }

        this.broadcastState();
        return winner;
    }

    private isPlayableCard(card: ICard, playerHand: ICard[]): boolean {
        if (this.state.leadSuit && card.suit !== 'special') {
            const hasLeadSuit = playerHand.some(c => c.suit === this.state.leadSuit);
            if (hasLeadSuit && card.suit !== this.state.leadSuit) return false; // Must follow suit if possible
        }

        return true;
    }

    private determineTrickWinner(): string {
        // Check for wizards first
        const lastWizard = [...this.state.currentTrick].reverse().find(card => card.value === 'wizard');
        if (lastWizard) {
            return lastWizard.playedBy!;
        }

        // If all cards are jesters, the first player (leader) wins
        if (this.state.currentTrick.every(card => card.value === 'jester')) {
            return this.state.leadingPlayerId!;
        }

        let winningCard = this.state.currentTrick[0]!;
        
        for (const card of this.state.currentTrick) {
            if (card.value === 'jester') continue;
            
            // If we haven't set a non-jester winning card yet
            if (winningCard.value === 'jester') {
                winningCard = card;
                continue;
            }

            // Handle trump suit
            if (card.suit === this.state.trumpCard?.suit && 
                winningCard.suit !== this.state.trumpCard?.suit) {
                winningCard = card;
                continue;
            }

            // Handle same suit comparison
            if (card.suit === winningCard.suit && 
                typeof card.value === 'number' && 
                typeof winningCard.value === 'number' && 
                card.value > winningCard.value) {
                winningCard = card;
            }
        }

        return winningCard.playedBy!;
    }

    public endRound(): void {
        for (const player of Object.values(this.state.players)) {
            if (player.bid === player.tricks) {
                player.score += 10 + (player.bid * 10);
            } else {
                player.score -= Math.abs(player.bid! - player.tricks) * 10;
            }
        }
        this.prepareNextRound();
        this.broadcastState();
    }

    private prepareNextRound(): void {
        this.state.currentRound++;
        if (this.state.currentRound > Math.floor(60 / Object.keys(this.state.players).length)) {
            this.state.phase = 'finished';
        } else {
            this.dealCards();
            this.state.phase = 'bidding';
            
            // Set the leading player for the new round based on round number
            const playerIds = Object.keys(this.state.players);
            const startingPlayerIndex = (this.state.currentRound - 1) % playerIds.length;
            this.state.leadingPlayerId = playerIds[startingPlayerIndex]!;
            this.state.activePlayerId = this.state.leadingPlayerId;
        }
    }

    private moveToNextPlayer(): void {
        if (!this.state.activePlayerId) return;

        const playerIds = Object.keys(this.state.players);
        const currentIndex = playerIds.indexOf(this.state.activePlayerId);
        this.state.activePlayerId = playerIds[(currentIndex + 1) % playerIds.length]!;
    }

    public removePlayer(id: string): boolean {
        if (id in this.state.players) {
            delete this.state.players[id];
            this.broadcastState();
            return true;
        }
        if (id in this.state.spectators) {
            delete this.state.spectators[id];
            this.broadcastState();
            return true;
        }
        return false;
    }

    public getGameState(playerId: string): IGameState {
        // Return a copy of the state but without the other players' hands and without the deck
        return {
            ...this.state,
            players: Object.fromEntries(
                Object.entries(this.state.players).map(([id, player]) => [
                    id,
                    {
                        ...player,
                        hand: id === playerId ? player.hand : [] // Only include hand for the requesting player
                    }
                ])
            )
        };
    }
}
