import React, { useEffect, useState } from 'react';

interface AnimatedStatusTextProps {
    text: string;
}

export function AnimatedStatusText({ text }: AnimatedStatusTextProps) {
    const [dots, setDots] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev === '...') return '';
                return prev + '.';
            });
        }, 500);

        return () => clearInterval(interval);
    }, []);

    return (
        <span className="inline-block min-w-[24px]">
            {text}{dots}
        </span>
    );
}
