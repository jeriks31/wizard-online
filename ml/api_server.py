from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Union, Optional
import numpy as np
from stable_baselines3 import PPO
from wizard_env import WizardEnv
from train import WizardEnvWrapper
import os
from rich.console import Console

console = Console()

app = FastAPI()

# Load the trained model
model_path = os.path.join("models", "best_model", "best_model.zip")
if not os.path.exists(model_path):
    raise FileNotFoundError(f"Model not found at {model_path}")

# Create a dummy env for model loading
env = WizardEnvWrapper(WizardEnv())
model = PPO.load(model_path, env=env)
console.print(f"[bold green]Loaded model from {model_path}[/bold green]")

class GameState(BaseModel):
    hand: List[int]
    trump_card: int
    cards_played_in_trick: List[int]
    cards_played_in_round: List[int]
    player_bids: List[int]
    player_tricks: List[int]
    player_scores: List[int]
    round_number: int
    phase: int  # 0 for bidding, 1 for playing
    lead_suit: int
    position_in_trick: int
    valid_actions: List[int]

@app.post("/predict")
async def predict_move(game_state: GameState):
    try:
        # Convert the game state to the format expected by the model
        observation = {
            "hand": np.array(game_state.hand, dtype=np.int32),
            "trump_card": np.array(game_state.trump_card, dtype=np.int32),
            "cards_played_in_trick": np.array(game_state.cards_played_in_trick, dtype=np.int32),
            "cards_played_in_round": np.array(game_state.cards_played_in_round, dtype=np.int32),
            "player_bids": np.array(game_state.player_bids, dtype=np.int32),
            "player_tricks": np.array(game_state.player_tricks, dtype=np.int32),
            "player_scores": np.array(game_state.player_scores, dtype=np.int32),
            "round_number": np.array([game_state.round_number], dtype=np.int32),
            "phase": np.array([game_state.phase], dtype=np.int32),
            "lead_suit": np.array([game_state.lead_suit], dtype=np.int32),
            "position_in_trick": np.array([game_state.position_in_trick], dtype=np.int32),
            "valid_actions": np.array(game_state.valid_actions, dtype=np.int32)
        }

        # Get model's prediction
        action, policy_output = model.predict(observation, deterministic=True)
        
        # Ensure the predicted action is valid
        valid_actions = np.where(np.array(game_state.valid_actions) == 1)[0]
        if action not in valid_actions:
            # Get probabilities from policy output and select highest probability valid action
            action_probs = policy_output.numpy().flatten()
            valid_action_probs = [(i, action_probs[i]) for i in valid_actions]
            action = max(valid_action_probs, key=lambda x: x[1])[0]
            console.print("[yellow]Model predicted invalid action, choosing highest probability valid action[/yellow]")
        
        return {"action": int(action)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
