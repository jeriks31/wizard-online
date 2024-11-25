import React from 'react';
import { Card as CardType } from '../../worker/game';

interface CardProps {
    card: CardType;
    isPlayable?: boolean;
    onClick?: () => void;
}

const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
    special: ''
};

const valueSymbols = {
    wizard: '🧙',
    jester: '🎭',
};

export function Card({ card, isPlayable = false, onClick }: CardProps) {
    const getSuitClass = () => {
        if (card.value === 'wizard') return 'wizard';
        if (card.value === 'jester') return 'jester';
        return card.suit;
    };

    const getDisplayValue = () => {
        if (typeof card.value === 'number') {
            // Numbers 1-13 for simplicity, instead of 2-10 + JQKA
            return card.value.toString();
        }
        return valueSymbols[card.value];
    };

    return (
        <div 
            className={`card ${isPlayable ? 'playable' : ''}`}
            onClick={isPlayable ? onClick : undefined}
        >
            <div className="card-inner">
                <div className={`card-front ${getSuitClass()}`}>
                    <div className="absolute top-2 left-2 flex flex-col items-center">
                        <span className="text-3xl font-bold">{getDisplayValue()}</span>
                        {/*<span className={`text-3xl suit ${getSuitClass()}`}>{suitSymbols[card.suit]}</span>*/}
                    </div>
                    <div className="absolute bottom-2 right-2 flex flex-col items-center rotate-180">
                        <span className="text-3xl font-bold">{getDisplayValue()}</span>
                        {/*<span className={`text-3xl suit ${getSuitClass()}`}>{suitSymbols[card.suit]}</span>*/}
                    </div>
                </div>
                <div className="card-back">
                    <div className="text-2xl">🎴</div>
                </div>
            </div>
        </div>
    );
}
