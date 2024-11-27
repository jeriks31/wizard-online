import React, { useState, useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { GameBoard } from './components/GameBoard';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            className="fixed top-4 right-4 px-4 py-2 rounded-lg bg-card-bg border border-border hover:bg-opacity-80 transition-colors"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? '🌙' : '☀️'}
        </button>
    );
}

function AppContent() {
    const [playerName, setPlayerName] = useState('');
    const [gameId, setGameId] = useState('');
    const [hasJoined, setHasJoined] = useState(false);
    const [showJoinForm, setShowJoinForm] = useState(false);

    // Handle game ID from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const gameIdFromUrl = params.get('game');
        if (gameIdFromUrl) {
            setGameId(gameIdFromUrl.toUpperCase());
            setShowJoinForm(true);
        }
    }, []);

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
        
        setHasJoined(true);
    };

    const handleHostGame = (e: React.FormEvent) => {
        e.preventDefault();
        if (!playerName) return;

        // Generate a random 6-character game ID
        const newGameId = Math.random().toString(36).substring(2, 8).toUpperCase();
        setGameId(newGameId);
        setHasJoined(true);
    };

    // Effect to handle joining after connection is established
    useEffect(() => {
        if (hasJoined && gameId && playerName && !playerId && isConnected) {
            joinGame(playerName);
        }
    }, [hasJoined, isConnected]);

    if (!hasJoined) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="bg-card-bg p-8 rounded-lg shadow-lg w-full max-w-md">
                    <h1 className="text-3xl font-bold mb-6 text-center">Wizard Online</h1>
                    
                    {/* Name Input (shown always) */}
                    <div className="mb-6">
                        <label htmlFor="playerName" className="block text-sm font-medium mb-2">
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

                    {!showJoinForm ? (
                        /* Host/Join Choice Buttons */
                        <div className="space-y-4">
                            <form onSubmit={handleHostGame}>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary w-full mb-4"
                                    disabled={!playerName}
                                >
                                    Host New Game
                                </button>
                            </form>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-300"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-card-bg text-gray-500">or</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowJoinForm(true)}
                                className="btn btn-secondary w-full"
                            >
                                Join Existing Game
                            </button>
                        </div>
                    ) : (
                        /* Join Game Form */
                        <form onSubmit={handleJoin} className="space-y-4">
                            <div>
                                <label htmlFor="gameId" className="block text-sm font-medium">
                                    Game ID
                                </label>
                                <input
                                    type="text"
                                    id="gameId"
                                    value={gameId}
                                    onChange={(e) => setGameId(e.target.value.toUpperCase())}
                                    className="input w-full"
                                    maxLength={6}
                                    pattern="[A-Z0-9]{6}"
                                    title="6-character game ID"
                                    placeholder="Enter 6-character game ID"
                                    required
                                />
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowJoinForm(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Back
                                </button>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary flex-1"
                                    disabled={!gameId || !playerName}
                                >
                                    Join Game
                                </button>
                            </div>
                        </form>
                    )}
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

                {/* Game ID Display and Copy Link */}
                <div className="mb-4 p-4 bg-card-bg rounded-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold">Game ID: {gameId}</h2>
                            <p className="text-sm">Share this ID with your friends to invite them</p>
                        </div>
                        <button
                            onClick={() => {
                                const url = `${window.location.origin}?game=${gameId}`;
                                navigator.clipboard.writeText(url);
                            }}
                            className="btn btn-secondary"
                        >
                            Copy Invite Link
                        </button>
                    </div>
                </div>
                
                {gameState.phase === 'waiting' && (
                    <div className="mb-4 p-4 bg-card-bg rounded-lg">
                        <h2 className="text-xl font-bold mb-2">Waiting for players...</h2>
                        <p className="mb-4">Players: {Object.keys(gameState.players || {}).length}/6</p>
                        <button 
                            onClick={startGame}
                            className="btn btn-primary"
                            disabled={Object.keys(gameState.players || {}).length < 2} //TODO: Change back to 3 after testing is done
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

export default function App() {
    return (
        <ThemeProvider>
            <AppContent />
            <ThemeToggle />
        </ThemeProvider>
    );
}
