export interface Player {
    id: string;
    name: string;
    connected: boolean;
    hand: Card[];
    tricks: number;
    bid: number | null;
    score: number;
}

export interface Card {
    suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'special';
    value: number | 'wizard' | 'jester';
}

export interface GameState {
    players: Record<string, Player>;
    deck: Card[];
    currentRound: number;
    trumpCard: Card | null;
    currentTrick: Card[];
    leadingPlayerId: string | null;
    activePlayerId: string | null;
    phase: 'waiting' | 'bidding' | 'playing' | 'scoring' | 'finished';
    leadSuit: string | null;
}

export class Game {
    private state: GameState;

    constructor() {
        this.state = {
            players: {},
            deck: this.createDeck(),
            currentRound: 0,
            trumpCard: null,
            currentTrick: [],
            leadingPlayerId: null,
            activePlayerId: null,
            phase: 'waiting',
            leadSuit: null,
        };
    }

    private createDeck(): Card[] {
        const deck: Card[] = [];
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

    public addPlayer(id: string, name: string): boolean {
        if (Object.keys(this.state.players).length >= 6) return false;
        
        this.state.players[id] = {
            id,
            name,
            connected: true,
            hand: [],
            tricks: 0,
            bid: null,
            score: 0
        };
        
        return true;
    }

    public startGame(): boolean {
        if (Object.keys(this.state.players).length < 3) return false;
        
        this.state.currentRound = 1;
        this.dealCards();
        this.state.phase = 'bidding';
        
        // Set initial active player for bidding
        const playerIds = Object.keys(this.state.players);
        this.state.leadingPlayerId = playerIds[0] ?? null;
        this.state.activePlayerId = playerIds[0] ?? null;
        
        return true;
    }

    private dealCards(): void {
        this.state.deck = this.shuffleDeck([...this.state.deck]);
        
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
                const card = this.state.deck.pop();
                if (card) {
                    const player = this.state.players[playerId];
                    if (player) {
                        player.hand.push(card);
                    }
                }
            }
        }

        // Set trump card if there are cards remaining
        this.state.trumpCard = this.state.deck.pop() ?? null;
    }

    private shuffleDeck(deck: Card[]): Card[] {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j]!, deck[i]!];
        }
        return deck;
    }

    public placeBid(playerId: string, bid: number): boolean {
        const player = this.state.players[playerId];
        if (!player || this.state.phase !== 'bidding' || playerId !== this.state.activePlayerId) {
            return false;
        }

        if (bid < 0 || bid > this.state.currentRound) {
            return false;
        }

        player.bid = bid;
        this.moveToNextPlayer();

        // Check if all players have bid
        const allBid = Object.values(this.state.players).every(p => p.bid !== null);
        if (allBid) {
            this.state.phase = 'playing';
        }

        return true;
    }

    public playCard(playerId: string, cardIndex: number): boolean {
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
        if (this.state.leadSuit && 
            card.suit !== 'special' && 
            card.suit !== this.state.leadSuit && 
            player.hand.some(c => c.suit === this.state.leadSuit)) {
            return false;
        }

        // Remove card from hand and add to current trick
        player.hand.splice(cardIndex, 1);
        this.state.currentTrick.push(card);

        // Set lead suit if this is the first card
        if (this.state.currentTrick.length === 1) {
            this.state.leadSuit = card.suit;
        }

        // If all players have played, evaluate the trick
        if (this.state.currentTrick.length === Object.keys(this.state.players).length) {
            this.evaluateTrick();
        } else {
            this.moveToNextPlayer();
        }

        return true;
    }

    private evaluateTrick(): void {
        const winner = this.determineTrickWinner();
        if (winner) {
            const player = this.state.players[winner];
            if (player) {
                player.tricks++;
            }
            // Winner of the trick leads the next trick
            this.state.leadingPlayerId = winner;
            this.state.activePlayerId = winner;
        }

        this.state.currentTrick = [];
        this.state.leadSuit = null;

        // Check if round is complete
        if (Object.values(this.state.players).every(p => p.hand.length === 0)) {
            this.scoreRound();
            this.prepareNextRound();
        }
    }

    private determineTrickWinner(): string | null {
        if (this.state.currentTrick.length === 0) return null;

        const playerIds = Object.keys(this.state.players);
        const startPlayerIndex = playerIds.indexOf(this.state.leadingPlayerId!);
        
        // Get the cards in order of play, with their corresponding player IDs
        const cardsWithPlayers = this.state.currentTrick.map((card, index) => {
            const playerIndex = (startPlayerIndex + index) % playerIds.length;
            console.log(startPlayerIndex, index, playerIndex);
            return {
                card,
                playerId: playerIds[playerIndex]!
            };
        });
        console.log(cardsWithPlayers);

        // Check for wizards first
        const wizardPlays = cardsWithPlayers.filter(play => play.card.value === 'wizard');
        if (wizardPlays.length > 0) {
            // Last wizard played wins
            return wizardPlays[wizardPlays.length - 1]!.playerId;
        }

        // If all cards are jesters, the first player (leader) wins
        if (cardsWithPlayers.every(play => play.card.value === 'jester')) {
            return this.state.leadingPlayerId;
        }

        let winningPlay = cardsWithPlayers[0]!;
        
        for (const play of cardsWithPlayers) {
            if (play.card.value === 'jester') continue;
            
            // If we haven't set a non-jester winning play yet
            if (winningPlay.card.value === 'jester') {
                winningPlay = play;
                continue;
            }

            // Handle trump suit
            if (play.card.suit === this.state.trumpCard?.suit && 
                winningPlay.card.suit !== this.state.trumpCard?.suit) {
                winningPlay = play;
                continue;
            }

            // Handle same suit comparison
            if (play.card.suit === winningPlay.card.suit && 
                typeof play.card.value === 'number' && 
                typeof winningPlay.card.value === 'number' && 
                play.card.value > winningPlay.card.value) {
                winningPlay = play;
            }
        }

        return winningPlay.playerId;
    }

    private scoreRound(): void {
        for (const player of Object.values(this.state.players)) {
            if (player.bid === player.tricks) {
                player.score += 10 + (player.bid * 10);
            } else {
                player.score -= Math.abs(player.bid! - player.tricks) * 10;
            }
        }
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

    public getGameState(playerId: string): GameState {
        const player = this.state.players[playerId];
        if (!player) throw new Error('Player not found');

        // Return a copy of the state but without the other players' hands
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
