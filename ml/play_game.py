from wizard_env import WizardEnv
import numpy as np

def play_random_game():
    env = WizardEnv(render_mode="human")
    observation, info = env.reset()
    done = False
    total_reward = 0

    while not done:
        # Get valid actions and choose randomly from them
        valid_actions = np.where(observation["valid_actions"] == 1)[0]
        print("\n\n===== AGENT'S TURN =====")
        
        # Print current state
        env.render()
        print("Valid action indices:", valid_actions)

        action = np.random.choice(valid_actions)
        print(f"\nChose action: {action}")

        # Take the action
        observation, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        total_reward += reward
        
        if done:
            print(f"Game Over! Final Score: {total_reward}")

if __name__ == "__main__":
    play_random_game()
