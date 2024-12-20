# Wizard Online

A real-time multiplayer implementation of the Wizard card game, hosted on Cloudflare Workers.

## Demo
You can try the game at [wizard-online.pages.dev](https://wizard-online.pages.dev/)

## Features
- Real-time multiplayer gameplay
- WebSocket-based communication
- Cloudflare Workers for hosting
- React frontend with Tailwind CSS

### Coming Soon
- Handle wizard and jester as trump cards
- Google login
- Leaderboard
- Game history

## Development

### Prerequisites
- [Node.js](https://nodejs.org/en) (v18 or higher recommended)

### Setup
```bash
# Install dependencies
npm install

# Run the Cloudflare Workers backend
npx wrangler dev

# In a separate terminal, run the frontend development server
npm run dev
```

## Deployment
The application is automatically deployed to Cloudflare Workers via GitHub Actions when changes are pushed to the main branch.

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
