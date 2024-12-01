import React, { useState, useEffect } from 'react';
import { ICard, IGameState } from '../../worker/types';
import { Card } from './Card';
import { AnimatedStatusText } from './AnimatedStatusText';

interface GameBoardProps {
    gameState: IGameState;
    playerId: string;
    onPlaceBid: (bid: number) => void;
    onPlayCard: (cardIndex: number) => void;
}

export function GameBoard({ gameState, playerId, onPlaceBid, onPlayCard }: GameBoardProps) {
    const [oldState, setOldState] = useState<IGameState | null>(null);
    const [bidError, setBidError] = useState<string | null>(null);

    const [lastTrickWinner, setLastTrickWinner] = useState<string | null>(null);
    const [scoreChanges, setScoreChanges] = useState<Record<string, number>>({});
    const [temporaryTrickCards, setTemporaryTrickCards] = useState<ICard[]>([]);
    const [temporaryTrumpCard, setTemporaryTrumpCard] = useState<ICard | null>(null);
    const isPlayerTurn = gameState.activePlayerId === playerId;

    useEffect(() => {
        console.log(gameState);
        if (oldState?.phase === 'scoring') {
            // Find the player whose tricks count increased
            const winner = Object.entries(gameState.players).find(([_, player]) => {
                const oldPlayer = oldState.players[player.id];
                return oldPlayer && player.tricks > oldPlayer.tricks;
            });
            
            if (winner) {
                console.log("Trick ended");
                // Keep the last trick's cards visible
                setTemporaryTrickCards(oldState.currentTrick);
                setLastTrickWinner(winner[1].name);
                setTemporaryTrumpCard(oldState.trumpCard);
                setTimeout(() => {
                    setLastTrickWinner(null);
                    setTemporaryTrickCards([]);
                    setTemporaryTrumpCard(null);
                }, 2000);
            }
        }
        if (oldState && oldState.currentRound < gameState.currentRound) {
            console.log("Round ended");
            // Round changed - calculate score differences
            const changes: Record<string, number> = {};
            Object.entries(gameState.players).forEach(([id, player]) => {
                const oldScore = oldState.players[id]!.score;
                changes[id] = player.score - oldScore;
            });
            setScoreChanges(changes);
            
            // Clear score changes and old round state after delay
            setTimeout(() => {
                setScoreChanges({});
            }, 5000);
        }

        setOldState(gameState);
    }, [gameState]);

    const getPhaseText = (phase: string) => {
        switch (phase) {
            case 'bidding':
                return 'is bidding';
            case 'playing':
                return 'is playing';
            default:
                return '';
        }
    };

    const isCardPlayable = (card: ICard, index: number) => {
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
                    <p>Total bids: {Object.values(gameState.players).reduce((total, player) => total + (player.bid || 0), 0)}</p>
                </div>
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
                        <p>Score: {player.score}
                            {scoreChanges[player.id] !== undefined && (
                                <span className={`ml-2 ${scoreChanges[player.id]! > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {scoreChanges[player.id]! > 0 ? '+' : ''}{scoreChanges[player.id]}
                                </span>
                            )}
                        </p>
                    </div>
                ))}
            </div>

            {/* Current Trick */}
            {gameState.phase !== 'waiting' && (<div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Current Trick</h3>
                <div className="flex items-center gap-4">
                    {(temporaryTrumpCard ? temporaryTrumpCard : gameState.trumpCard) && (
                        <div className="flex flex-col items-center">
                            <span className="text-sm mb-1">Trump</span>
                            <Card card={temporaryTrumpCard ?? gameState.trumpCard!} />
                        </div>
                    )}
                    {/* Offset by header height (text-sm line-height 20px + mb-1 4px = 24px) */}
                    <div className="flex items-center pt-[24px]">
                        <div className="h-24 w-px bg-gray-300"></div>
                    </div>
                    {(gameState.currentTrick.length > 0 || temporaryTrickCards.length > 0) && (
                        <div className="flex flex-col items-center">
                            <span className="text-sm mb-1">
                                {lastTrickWinner ? `${lastTrickWinner} won the trick!` : 'Current Trick'}
                            </span>
                            <div className="flex gap-2">
                                {(temporaryTrickCards.length > 0 ? temporaryTrickCards : gameState.currentTrick).map((card, index) => (
                                    // TODO: add name of player who played the card
                                    <Card key={index} card={card} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>)}

            {/* Player Hand */}
            {gameState.phase !== 'waiting' && (<div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Your Hand</h3>
                <div className="flex flex-wrap gap-2 player-hand">
                    {!temporaryTrumpCard && (gameState.players[playerId]?.hand ?? []).map((card, index) => (
                        <Card
                            key={index}
                            card={card}
                            isPlayable={isCardPlayable(card, index)}
                            onClick={() => isCardPlayable(card, index) && onPlayCard(index)}
                        />
                    ))}
                </div>
            </div>)}

            {/* Bidding UI */}
            {gameState.phase === 'bidding' && !temporaryTrumpCard && isPlayerTurn && (
                <div className="mb-4">
                    <h3 className="text-lg font-bold mb-2">Choose your bid</h3>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                            {(() => {
                                const numCards = gameState.currentRound;
                                const currentBids = Object.values(gameState.players).reduce((sum, player) => 
                                    player.id !== playerId && player.bid !== null ? sum + player.bid : sum, 0);
                                const isLastBidder = Object.values(gameState.players)
                                    .filter(p => p.id !== playerId)
                                    .every(p => p.bid !== null);

                                return Array.from({ length: numCards + 1 }, (_, i) => i)
                                    // Exclude bids that would make the total bids equal to the round number
                                    .filter(bid => !isLastBidder || (currentBids + bid !== numCards))
                                    .map(bid => (
                                        <button
                                            key={bid}
                                            onClick={() => {
                                                setBidError(null);
                                                onPlaceBid(bid);
                                            }}
                                            className="btn btn-primary px-4"
                                        >
                                            {bid}
                                        </button>
                                    ));
                            })()}
                        </div>
                        {bidError && (
                            <p className="text-red-500 text-sm">{bidError}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
