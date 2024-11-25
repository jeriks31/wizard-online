import React, { useState, useEffect } from 'react';
import { Card as CardType, GameState } from '../../worker/game';
import { Card } from './Card';
import { AnimatedStatusText } from './AnimatedStatusText';

interface GameBoardProps {
    gameState: GameState;
    playerId: string;
    onPlaceBid: (bid: number) => void;
    onPlayCard: (cardIndex: number) => void;
}

export function GameBoard({ gameState, playerId, onPlaceBid, onPlayCard }: GameBoardProps) {
    const [bidAmount, setBidAmount] = useState(0);
    const [oldState, setOldState] = useState<GameState | null>(null);
    const [bidError, setBidError] = useState<string | null>(null);
    const isPlayerTurn = gameState.activePlayerId === playerId;

    useEffect(() => {
        if (gameState.phase === 'playing' && gameState.currentTrick.length === 0) {
            // Trick complete, determine winner
        }

        setOldState(gameState);
    }, [gameState]);

    const getPhaseText = (phase: string) => {
        switch (phase) {
            case 'bidding':
                return 'bidding';
            case 'playing':
                return 'playing';
            default:
                return '';
        }
    };

    console.log(gameState);
    console.log(playerId);

    const handleBidSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Calculate total bids excluding current player
        const totalBids = Object.values(gameState.players).reduce((sum, player) => 
            player.id !== playerId && player.bid !== null ? sum + player.bid : sum, 0);

        // Check if this is the last player to bid
        const isLastBidder = Object.values(gameState.players)
            .filter(p => p.id !== playerId)
            .every(p => p.bid !== null);

        // If last bidder, check if bid would make a perfect round
        if (isLastBidder && totalBids + bidAmount === gameState.currentRound) {
            setBidError("You cannot place a bid that would make the total bids equal to the round number");
            return;
        }

        setBidError(null);
        onPlaceBid(bidAmount);
    };

    const isCardPlayable = (card: CardType, index: number) => {
        if (!isPlayerTurn || gameState.phase !== 'playing') return false;
        
        // First card of the trick
        if (gameState.currentTrick.length === 0) return true;
        
        // Must follow suit if possible
        const leadSuit = gameState.leadSuit;
        if (leadSuit && card.suit !== 'special') {
            const hasLeadSuit = gameState.players[playerId]?.hand.some(c => c.suit === leadSuit && c.suit !== 'special');
            if (hasLeadSuit && card.suit !== leadSuit) return false;
        }
        
        return true;
    };

    return (
        <div className="p-4">
            {/* Game Info */}
            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold">Round {gameState.currentRound}</h2>
                    <p>Phase: {gameState.phase}</p>
                </div>
                {gameState.trumpCard && (
                    <div className="flex items-center">
                        <span className="mr-2">Trump:</span>
                        <Card card={gameState.trumpCard} />
                    </div>
                )}
            </div>

            {/* Players */}
            <div className="mb-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.values(gameState.players).map(player => (
                    <div 
                        key={player.id}
                        className={`p-4 rounded-lg ${
                            player.id === gameState.activePlayerId ? 'bg-primary text-white' : 'bg-card-bg'
                        } `}
                    >
                        <p className="font-bold">
                            {player.name}
                            {player.id === gameState.activePlayerId && (
                                <> <AnimatedStatusText text={getPhaseText(gameState.phase)} /></>
                            )}
                        </p>
                        <p>Bid: {player.bid !== null ? player.bid : '-'}</p>
                        <p>Tricks: {player.tricks}</p>
                        <p>Score: {player.score}</p>
                    </div>
                ))}
            </div>

            {/* Current Trick */}
            {gameState.currentTrick.length > 0 && (
                <div className="mb-4">
                    <h3 className="text-lg font-bold mb-2">Current Trick</h3>
                    <div className="flex gap-2">
                        {gameState.currentTrick.map((card, index) => (
                            <Card key={index} card={card} />
                        ))}
                    </div>
                </div>
            )}

            {/* Bidding UI */}
            {gameState.phase === 'bidding' && isPlayerTurn && (
                <form onSubmit={handleBidSubmit} className="mb-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input
                                type="number"
                                min={0}
                                max={gameState.currentRound}
                                value={bidAmount}
                                onChange={(e) => {
                                    setBidAmount(parseInt(e.target.value));
                                    setBidError(null);
                                }}
                                className="input"
                            />
                            <button type="submit" className="btn btn-primary">
                                Place Bid
                            </button>
                        </div>
                        {bidError && (
                            <p className="text-red-500 text-sm">{bidError}</p>
                        )}
                    </div>
                </form>
            )}

            {/* Player Hand */}
            <div>
                <h3 className="text-lg font-bold mb-2">Your Hand</h3>
                <div className="flex flex-wrap gap-2">
                    {(gameState.players[playerId]?.hand ?? []).map((card, index) => (
                        <Card
                            key={index}
                            card={card}
                            isPlayable={isCardPlayable(card, index)}
                            onClick={() => isCardPlayable(card, index) && onPlayCard(index)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
