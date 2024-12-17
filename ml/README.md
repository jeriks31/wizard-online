# Wizard Game Reinforcement Learning Bot

This directory contains the reinforcement learning implementation for the Wizard card game bot.

## Setup

1. Create a Python virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:
- Windows:
```bash
venv\Scripts\activate
```
- Unix/MacOS:
```bash
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Project Structure

- `wizard_env.py`: Custom Gymnasium environment implementing the Wizard game rules
- `train.py`: Training script using DQN (Deep Q-Network) for learning optimal play
- `requirements.txt`: Python package dependencies

## Training the Model

Run the training script:
```bash
python train.py
```

## Implementation Details

The implementation uses:
- PyTorch for the neural network
- Gymnasium (formerly OpenAI Gym) for the reinforcement learning environment
- DQN (Deep Q-Network) as the learning algorithm

The state space includes:
- Current hand
- Trump card
- Current trick
- Player bids
- Player tricks
- Player scores
- Round number
- Game phase (bidding/playing)

The action space is split into:
- Bidding: 0 to current round number
- Playing: Card index in hand

The reward function considers:
- Score difference from opponents
- Accuracy of bid vs tricks taken
- Immediate rewards for winning tricks
