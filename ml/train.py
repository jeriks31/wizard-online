import os
from typing import Callable, Dict
import numpy as np
import gymnasium as gym
import torch
import torch.nn as nn
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecMonitor
from stable_baselines3.common.callbacks import EvalCallback, CheckpointCallback
from stable_baselines3.common.monitor import Monitor
from wizard_env import WizardEnv
from gymnasium import spaces
from rich.console import Console

console = Console()

# Check CUDA availability
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cuda":
    console.print(f"[bold green]Using GPU: {torch.cuda.get_device_name(0)}[/bold green]")
else:
    console.print("[bold yellow]CUDA not available, using CPU[/bold yellow]")

class WizardEnvWrapper(gym.Wrapper):
    """Wrapper to convert Discrete observations to Box observations for SB3 compatibility
    and handle action masking"""
    def __init__(self, env):
        super().__init__(env)
        
        # Convert Discrete spaces to Box spaces
        self.observation_space = spaces.Dict({
            "hand": env.observation_space["hand"],
            "trump_card": env.observation_space["trump_card"],
            "cards_played_in_trick": env.observation_space["cards_played_in_trick"],
            "cards_played_in_round": env.observation_space["cards_played_in_round"],
            "player_bids": env.observation_space["player_bids"],
            "player_tricks": env.observation_space["player_tricks"],
            "player_scores": env.observation_space["player_scores"],
            "round_number": spaces.Box(low=0, high=env.MAX_ROUND + 1, shape=(1,), dtype=np.int32),
            "phase": spaces.Box(low=0, high=2, shape=(1,), dtype=np.int32),
            "lead_suit": spaces.Box(low=0, high=env.NUM_SUITS + 1, shape=(1,), dtype=np.int32),
            "position_in_trick": spaces.Box(low=0, high=env.NUM_PLAYERS, shape=(1,), dtype=np.int32),
            "valid_actions": env.observation_space["valid_actions"],
        })

    def reset(self, **kwargs):
        obs, info = self.env.reset(**kwargs)
        return self._convert_obs(obs), info

    def step(self, action):
        # Get valid actions
        valid_actions = self.env.state["valid_actions"]
        
        # If no valid actions at chosen index, choose a random valid action
        if valid_actions[action] == 0:
            valid_indices = np.where(valid_actions == 1)[0]
            if len(valid_indices) > 0:
                action = np.random.choice(valid_indices)
        
        obs, reward, terminated, truncated, info = self.env.step(action)
        return self._convert_obs(obs), reward, terminated, truncated, info

    def _convert_obs(self, obs: Dict) -> Dict:
        """Convert Discrete observations to Box observations"""
        new_obs = obs.copy()
        
        # Convert Discrete observations to Box
        new_obs["round_number"] = np.array([np.argmax(obs["round_number"])], dtype=np.int32)
        new_obs["phase"] = np.array([np.argmax(obs["phase"])], dtype=np.int32)
        new_obs["lead_suit"] = np.array([np.argmax(obs["lead_suit"])], dtype=np.int32)
        new_obs["position_in_trick"] = np.array([np.argmax(obs["position_in_trick"])], dtype=np.int32)
        
        return new_obs

def make_env() -> Callable:
    """Create a function that returns a configured environment"""
    def _init() -> WizardEnv:
        env = WizardEnv()
        env = WizardEnvWrapper(env)
        return env
    return _init

def linear_schedule(initial_value: float) -> Callable[[float], float]:
    """
    Linear learning rate schedule.
    :param initial_value: Initial learning rate.
    :return: schedule that computes current learning rate depending on remaining progress
    """
    def func(progress_remaining: float) -> float:
        """
        Progress will decrease from 1 (beginning) to 0.
        :param progress_remaining:
        :return: current learning rate
        """
        return progress_remaining * initial_value
    return func

def train(
    total_timesteps: int = 1_000_000,
    learning_rate: float = 3e-4,
    n_steps: int = 2048,
    batch_size: int = 256,
    n_epochs: int = 10,
    gamma: float = 0.99,
    eval_freq: int = 10000,
    n_eval_episodes: int = 5,
    model_dir: str = "models",
    tensorboard_log: str = "logs"
):
    """
    Train a PPO agent to play Wizard
    
    Args:
        total_timesteps: Total number of environment steps to train for
        learning_rate: Learning rate
        n_steps: Number of steps to run for each environment per update
        batch_size: Minibatch size
        n_epochs: Number of epoch when optimizing the surrogate loss
        gamma: Discount factor
        eval_freq: Evaluate the agent every n steps
        n_eval_episodes: Number of episodes to evaluate for
        model_dir: Directory to save models
        tensorboard_log: Directory for tensorboard logs
    """
    # Create directories if they don't exist
    os.makedirs(model_dir, exist_ok=True)
    os.makedirs(tensorboard_log, exist_ok=True)
    
    # Create and wrap the environment
    env_fns = [make_env() for _ in range(12)]  # Use 12 environments in parallel
    env = SubprocVecEnv(env_fns)
    env = VecMonitor(env, filename=os.path.join(tensorboard_log, "wizard_monitor"))

    # Create evaluation environment
    eval_env_fn = make_env()
    eval_env = SubprocVecEnv([lambda: eval_env_fn()])  # Wrap in SubprocVecEnv for consistency
    eval_env = VecMonitor(eval_env, filename=os.path.join(tensorboard_log, "wizard_eval_monitor"))

    # Custom network architecture
    policy_kwargs = dict(
        net_arch=dict(
            pi=[256, 256],  # Policy network
            vf=[256, 256]   # Value network
        ),
        activation_fn=nn.ReLU
    )

    # Find latest checkpoint if it exists
    checkpoint_dir = os.path.join(model_dir, "checkpoints")
    if os.path.exists(checkpoint_dir):
        checkpoints = [f for f in os.listdir(checkpoint_dir) if f.endswith('.zip')]
        if checkpoints:
            latest_checkpoint = max(checkpoints, key=lambda x: int(x.split('_')[-2]))
            checkpoint_path = os.path.join(checkpoint_dir, latest_checkpoint)
            console.print(f"[bold green]Loading from checkpoint: {latest_checkpoint}[/bold green]")
            model = PPO.load(
                checkpoint_path,
                env=env,
                tensorboard_log=tensorboard_log,
                device=device
            )
        else:
            console.print("[yellow]No checkpoints found, starting fresh training[/yellow]")
            model = PPO(
                "MultiInputPolicy",
                env,
                learning_rate=linear_schedule(learning_rate),
                n_steps=n_steps,
                batch_size=batch_size,
                n_epochs=n_epochs,
                gamma=gamma,
                verbose=1,
                tensorboard_log=tensorboard_log,
                policy_kwargs=policy_kwargs,
                device=device
            )
    else:
        console.print("[yellow]No checkpoints directory found, starting fresh training[/yellow]")
        model = PPO(
            "MultiInputPolicy",
            env,
            learning_rate=linear_schedule(learning_rate),
            n_steps=n_steps,
            batch_size=batch_size,
            n_epochs=n_epochs,
            gamma=gamma,
            verbose=1,
            tensorboard_log=tensorboard_log,
            policy_kwargs=policy_kwargs,
            device=device
        )
    
    # Create callbacks
    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=os.path.join(model_dir, "best_model"),
        log_path=tensorboard_log,
        eval_freq=eval_freq,
        deterministic=True,
        render=False,
        n_eval_episodes=n_eval_episodes
    )
    
    checkpoint_callback = CheckpointCallback(
        save_freq=eval_freq,
        save_path=os.path.join(model_dir, "checkpoints"),
        name_prefix="wizard_model"
    )
    
    console.print("[bold green]Starting training...[/bold green]")
    
    # Train the agent
    model.learn(
        total_timesteps=total_timesteps,
        callback=[eval_callback, checkpoint_callback],
        progress_bar=True,
        reset_num_timesteps=False  # Continue timestep counting from checkpoint
    )
    
    # Save the final model
    model.save(os.path.join(model_dir, "final_model"))
    console.print("[bold green]Training completed! Final model saved.[/bold green]")

if __name__ == "__main__":
    train(total_timesteps=200_000_000)