import { ICard, IGameState } from './types';

export class Bot {
    /**
     * Determines the bid for a bot player based on the current game state
     */
    static calculateBid(gameState: IGameState, playerId: string): number {
        return Math.floor(gameState.currentRound / Object.keys(gameState.players).length);
    }

    /**
     * Ranks a card's strength in the current game context
     * Higher number means stronger card
     */
    private static getCardStrength(card: ICard, gameState: IGameState): number {
        if (card.value === 'wizard') return 999;
        if (card.value === 'jester') return -1;
        
        const numericValue = card.value as number;
        let strength = numericValue;

        // Boost strength if it's trump suit
        if (gameState.trumpCard && card.suit === gameState.trumpCard.suit) {
            strength += 200;
        }

        // Boost strength if it's the lead suit
        if (gameState.leadSuit && card.suit === gameState.leadSuit) {
            strength += 100;
        }

        return strength;
    }

    /**
     * Checks if a card can win against the current trick
     */
    private static canWinTrick(card: ICard, gameState: IGameState): boolean {
        if (card.value === 'wizard') return true;
        if (card.value === 'jester') return false;

        // If there's a wizard in the trick, we can't win
        if (gameState.currentTrick.some(c => c.value === 'wizard')) {
            return false;
        }

        // Get the strength of our card
        const ourStrength = this.getCardStrength(card, gameState);

        // Find the strongest card in the current trick
        const trickStrengths = gameState.currentTrick.map(c => this.getCardStrength(c, gameState));
        const maxTrickStrength = Math.max(...trickStrengths, -999);

        return ourStrength > maxTrickStrength;
    }

    /**
     * Selects which card the bot should play based on the current game state
     * Returns the index of the card in the player's hand
     */
    static selectCard(gameState: IGameState, playerId: string, isPlayableCard: (card: ICard, hand: ICard[]) => boolean): number {
        const player = gameState.players[playerId];
        if (!player) return -1;

        // Get valid cards that can be played
        const validCards = player.hand.filter((card) => isPlayableCard(card, player.hand));
        if (validCards.length === 0) return -1;

        // Determine if we want to win this trick
        const wantToWin = player.bid !== null && player.tricks < player.bid;

        // Rank cards by strength
        const rankedCards = validCards.map(card => ({
            card,
            strength: this.getCardStrength(card, gameState),
            canWin: this.canWinTrick(card, gameState)
        }));

        let selectedCard: ICard = rankedCards[0]!.card;
        // Sort cards based on our strategy
        if (wantToWin && gameState.currentTrick.length > 0) {
            // If we want to win but can't, play our worst card
            const winningCards = rankedCards.filter(c => c.canWin);
            if (winningCards.length === 0) {
                rankedCards.sort((a, b) => a.strength - b.strength); // Play worst card
                selectedCard = rankedCards[0]!.card;
            } else {
                rankedCards.sort((a, b) => b.strength - a.strength); // Play best winning card
                selectedCard = rankedCards[0]!.card;
            }
        } else if (wantToWin) {
            // If we're leading and want to win, play our best card
            rankedCards.sort((a, b) => b.strength - a.strength);
            selectedCard = rankedCards[0]!.card;
        } else if (gameState.currentTrick.length > 0) {
            // If we don't want to win and we're not leading,
            // play the strongest card that can't win
            const losingCards = rankedCards.filter(c => !c.canWin);
            if (losingCards.length > 0) {
                losingCards.sort((a, b) => b.strength - a.strength); // Sort losing cards by highest strength
                selectedCard = losingCards[0]!.card;
            } else {
                // If all cards can win, play the weakest one
                rankedCards.sort((a, b) => a.strength - b.strength);
                selectedCard = rankedCards[0]!.card;
            }
        } else {
            // If we don't want to win and we're leading, play our worst card
            rankedCards.sort((a, b) => a.strength - b.strength);
            selectedCard = rankedCards[0]!.card;
        }
        
        // Find the index of this card in the original hand
        return player.hand.findIndex(c => c.suit === selectedCard.suit && c.value === selectedCard.value);
    }

    /**
     * Handles the bot's turn, either placing a bid or playing a card
     */
    static async handleTurn(gameState: IGameState, playerId: string, actions: {
        placeBid: (bid: number) => Promise<boolean>,
        playCard: (cardIndex: number) => Promise<boolean>,
        isPlayableCard: (card: ICard, hand: ICard[]) => boolean
    }): Promise<void> {
        // Add delay to make bot moves feel more natural
        await new Promise(resolve => setTimeout(resolve, 500));

        if (gameState.phase === 'bidding') {
            const bid = this.calculateBid(gameState, playerId);
            await actions.placeBid(bid);
        } else if (gameState.phase === 'playing') {
            const cardIndex = this.selectCard(gameState, playerId, actions.isPlayableCard);
            if (cardIndex >= 0) {
                await actions.playCard(cardIndex);
            }
        }
    }
}
