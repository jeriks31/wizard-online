import React, { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';

export default function App() {
    const [playerName, setPlayerName] = useState('');
    const [gameId, setGameId] = useState('');
    const [hasJoined, setHasJoined] = useState(false);

    const {
        gameState,
        isConnected,
        error,
        playerId,
        joinGame,
        startGame,
        placeBid,
        playCard
    } = useGameState(gameId);

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!gameId || !playerName) return;
        
        joinGame(playerName);
        setHasJoined(true);
    };

    if (!hasJoined) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="bg-card-bg p-8 rounded-lg shadow-lg w-full max-w-md">
                    <h1 className="text-3xl font-bold mb-6 text-center">Wizard Online</h1>
                    <form onSubmit={handleJoin} className="space-y-4">
                        <div>
                            <label htmlFor="gameId" className="block text-sm font-medium text-gray-700">
                                Game ID
                            </label>
                            <input
                                type="text"
                                id="gameId"
                                value={gameId}
                                onChange={(e) => setGameId(e.target.value)}
                                className="input w-full"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="playerName" className="block text-sm font-medium text-gray-700">
                                Your Name
                            </label>
                            <input
                                type="text"
                                id="playerName"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="input w-full"
                                required
                            />
                        </div>
                        <button type="submit" className="btn btn-primary w-full">
                            Join Game
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">Connecting to game...</h2>
                    {error && <p className="text-red-600">{error}</p>}
                </div>
            </div>
        );
    }

    if (!gameState) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">Waiting for game state...</h2>
                    {error && <p className="text-red-600">{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto py-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}
                
                {gameState.phase === 'waiting' && (
                    <div className="mb-4 p-4 bg-card-bg rounded-lg">
                        <h2 className="text-xl font-bold mb-2">Waiting for players...</h2>
                        <p className="mb-4">Players: {Object.keys(gameState.players || {}).length}/6</p>
                        <button 
                            onClick={startGame}
                            className="btn btn-primary"
                            disabled={Object.keys(gameState.players || {}).length < 3}
                        >
                            Start Game
                        </button>
                    </div>
                )}

                    <GameBoard 
                        gameState={gameState} 
                        playerId={playerId || ''}
                        onPlaceBid={placeBid} 
                        onPlayCard={playCard} 
                    />
            </div>
        </div>
    );
}
