# Wizard Online

An online multiplayer version of the card game "Wizard" by Ken Fisher.

## Development

1. Install dependencies:
```bash
npm install
```

2. Run the cloudflare workers dev server:
```bash
npx wrangler dev
```

2. Run development server:
```bash
npm run dev
```

3. Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Game Rules

Wizard is a trick-taking card game where players bid on the number of tricks they think they'll win in each round. Points are awarded for accurate predictions and deducted for incorrect ones.

### Components
- 60 cards: 52 standard playing cards + 4 Wizards + 4 Jesters
- 3-6 players

### Gameplay
1. Each round, players are dealt an increasing number of cards (1 card in round 1, 2 in round 2, etc.)
2. The last card is turned face up to determine the trump suit
3. Players bid on the number of tricks they expect to win
4. Players must follow suit if possible
5. Wizards always win tricks, Jesters always lose
6. Points are awarded based on bid accuracy

## Tech Stack

- Frontend: React with TailwindCSS
- Backend: Cloudflare Workers with Durable Objects
- Real-time: WebSocket connections
- Build: Vite
- Testing: Vitest
