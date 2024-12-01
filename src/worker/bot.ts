import { ICard, IGameState } from './types';

export class Bot {
    /**
     * Determines the bid for a bot player based on the current game state
     */
    static calculateBid(gameState: IGameState, playerId: string): number {
        return Math.floor(gameState.currentRound / Object.keys(gameState.players).length);
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

        // For now, just play a random valid card
        const selectedCard = validCards[Math.floor(Math.random() * validCards.length)]!;
        
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
