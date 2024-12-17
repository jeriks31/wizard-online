import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Optional, Dict, List, Any, Tuple
from enum import Enum
import random

class CardValue(Enum):
    JESTER = 0
    ONE = 1
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    ELEVEN = 11
    TWELVE = 12
    THIRTEEN = 13
    WIZARD = 14

class CardSuit(Enum):
    HEARTS = 0
    DIAMONDS = 1
    CLUBS = 2
    SPADES = 3

class Card:
    def __init__(self, value: CardValue, suit: CardSuit):
        self.value = value
        self.suit = suit
        
    def to_vector(self, vector_size: int) -> np.ndarray:
        """Convert card to one-hot encoded vector.
        First 52 positions (0-51): Regular cards (13 values * 4 suits)
        Last 8 positions (52-59): Special cards
        - 52-55: Wizards (one per suit)
        - 56-59: Jesters (one per suit)"""
        vector = np.zeros(vector_size, dtype=np.int32)
        
        if self.value == CardValue.WIZARD:
            vector[52 + self.suit.value] = 1  # Wizards at 52-55, one per suit
        elif self.value == CardValue.JESTER:
            vector[56 + self.suit.value] = 1  # Jesters at 56-59, one per suit
        else:
            # Regular cards: suit * 13 + (value - 1)
            index = (self.suit.value * 13) + (self.value.value - 1)
            vector[index] = 1
        return vector

    @classmethod
    def from_vector_idx(cls, vector_idx: int) -> "Card":
        """Create a Card from a vector index"""
        if vector_idx < 52:  # Regular card
            return cls(CardValue(vector_idx % 13 + 1), CardSuit(vector_idx // 13))
        elif vector_idx < 56:  # Wizard
            return cls(CardValue.WIZARD, CardSuit(vector_idx - 52))
        else:  # Jester
            return cls(CardValue.JESTER, CardSuit(vector_idx - 56))
    
    def __str__(self):
        return f"{self.value.name} of {self.suit.name}" if self.value != CardValue.WIZARD and self.value != CardValue.JESTER else f"{self.value.name}"
    
    def __repr__(self):
        return self.__str__()

class WizardEnv(gym.Env):
    """Custom Environment for Wizard card game that follows gym interface"""
    metadata = {"render_modes": ["human"], "render_fps": 4}

    def __init__(self, render_mode: Optional[str] = None):
        super().__init__()
        
        # Constants
        self.NUM_PLAYERS = 4
        self.DECK_SIZE = 60  # 13 cards * 4 suits + 4 wizards + 4 jesters
        self.NUM_SUITS = 4  # hearts, diamonds, clubs, spades
        self.MAX_ROUND = self.DECK_SIZE // self.NUM_PLAYERS
        
        # Game state
        self.round_starter = 0  # Player who starts the current round
        self.trick_leader = 0  # Player who leads the current trick
        
        # Define action spaces - these will be updated dynamically
        self.action_space = spaces.Discrete(self.DECK_SIZE)  # Allows for both card indices (0-59) and bids (0-15)
        
        # Observation space
        self.observation_space = spaces.Dict({
            "hand": spaces.Box(low=0, high=1, shape=(self.DECK_SIZE,), dtype=np.int32),
            "trump_card": spaces.Box(low=0, high=1, shape=(self.DECK_SIZE,), dtype=np.int32),
            "cards_played_in_trick": spaces.Box(low=0, high=1, shape=(self.DECK_SIZE,), dtype=np.int32),  # Simplified to single vector
            "cards_played_in_round": spaces.Box(low=0, high=1, shape=(self.DECK_SIZE,), dtype=np.int32),  # All cards played this round
            "player_bids": spaces.Box(low=0, high=self.MAX_ROUND, shape=(self.NUM_PLAYERS,), dtype=np.int32),
            "player_tricks": spaces.Box(low=0, high=self.MAX_ROUND, shape=(self.NUM_PLAYERS,), dtype=np.int32),
            "player_scores": spaces.Box(low=-float('inf'), high=float('inf'), shape=(self.NUM_PLAYERS,), dtype=np.int32),
            "round_number": spaces.Discrete(self.MAX_ROUND + 1),
            "phase": spaces.Discrete(2),  # 0: bidding, 1: playing
            "lead_suit": spaces.Discrete(self.NUM_SUITS + 1),  # +1 for no lead suit
            "position_in_trick": spaces.Discrete(self.NUM_PLAYERS),  # Position in current trick (0 means we led)
            "valid_actions": spaces.Box(low=0, high=1, shape=(self.DECK_SIZE,), dtype=np.int32),
        })

        self.render_mode = render_mode
        self.reset()

    def _create_deck(self) -> List[Card]:
        """Create a complete deck of cards"""
        deck = []
        
        # Add regular cards
        for suit in [CardSuit.HEARTS, CardSuit.DIAMONDS, CardSuit.CLUBS, CardSuit.SPADES]:
            for value in range(1, 14):  # 1-13
                deck.append(Card(CardValue(value), suit))
            # Add Wizards and Jesters (one of each per suit)
            deck.append(Card(CardValue.WIZARD, suit))
            deck.append(Card(CardValue.JESTER, suit))
        
        return deck

    def _deal_cards(self):
        """Deal cards to all players"""
        deck = self._create_deck()
        random.shuffle(deck)
        
        # Clear existing hands
        self.hands = [[] for _ in range(self.NUM_PLAYERS)]
        
        # Deal cards based on current round
        for _ in range(self.state["round_number"]):
            for player in range(self.NUM_PLAYERS):
                if deck:
                    self.hands[player].append(deck.pop())
        
        # Set trump card if there are cards remaining
        self.trump_card = deck.pop() if deck else None
        
        # Update state
        self.state["hand"] = np.sum([card.to_vector(self.DECK_SIZE) for card in self.hands[0]], axis=0)
        self.state["trump_card"] = self.trump_card.to_vector(self.DECK_SIZE) if self.trump_card else np.zeros(self.DECK_SIZE)

    def _get_valid_bids(self) -> list:
        """Get list of valid bids for current round"""
        valid_bids = list(range(self.state["round_number"] + 1))
        
        # If this is the last player to bid
        num_bids = np.count_nonzero(self.state["player_bids"])
        if num_bids == self.NUM_PLAYERS - 1:
            # Calculate sum of other players' bids
            total_bids = np.sum(self.state["player_bids"])
            # Remove bid that would make total equal to number of tricks
            forbidden_bid = self.state["round_number"] - total_bids
            if forbidden_bid >= 0 and forbidden_bid <= self.state["round_number"]:
                valid_bids.remove(forbidden_bid)
        
        return valid_bids

    def _update_valid_actions(self):
        """Update the valid actions mask in the state"""
        valid_actions = np.zeros(self.DECK_SIZE, dtype=np.int32)
        
        if self.state["phase"] == 0:  # Bidding phase
            valid_bids = self._get_valid_bids()
            valid_actions[valid_bids] = 1
        else:  # Playing phase
            valid_cards = [card for card in self.hands[0] if self._is_valid_play(card, 0)]
            for card in valid_cards:
                valid_actions += card.to_vector(self.DECK_SIZE)
        
        self.state["valid_actions"] = valid_actions
        # Update action space to only allow valid actions
        self.action_space = spaces.Discrete(len(valid_actions))

    def _process_bid(self, bid: int):
        """Process a bid action"""
        valid_bids = self._get_valid_bids()
        if bid not in valid_bids:
            raise ValueError(f"Invalid bid {bid}. Valid bids are {valid_bids}")
        
        #print(f"Player 0 bids {bid}")
        self.state["player_bids"][0] = bid

    def _vector_idx_to_hand_idx(self, vector_idx):
        """Convert a vector index to the corresponding index in the player's hand"""
        target_card = Card.from_vector_idx(vector_idx)
        
        # Find this card in the player's hand
        for i, card in enumerate(self.hands[0]):
            if card.suit == target_card.suit and card.value == target_card.value:
                return i
        return None

    def _process_play(self, action):
        """Process a card play action"""
        if self.state["phase"] != 1:  # Not playing phase
            raise ValueError("Cannot play card during bidding phase")

        # Convert vector index to hand index
        hand_idx = self._vector_idx_to_hand_idx(action)
        if hand_idx is None:
            raise ValueError(f"Invalid card vector index {action}")
            
        # Play the card
        card = self.hands[0].pop(hand_idx)
        #print(f"Player 0 plays {card}")
        self.cards_played_in_trick.append(card)
        self.state["cards_played_in_trick"] += card.to_vector(self.DECK_SIZE)
        self.state["cards_played_in_round"] += card.to_vector(self.DECK_SIZE)
        
        # Update hand state
        self.state["hand"] = np.logical_or.reduce([c.to_vector(self.DECK_SIZE) for c in self.hands[0]]) if self.hands[0] else np.zeros(self.DECK_SIZE, dtype=np.int32)
        
        # Update lead suit if this is the first card
        if len(self.cards_played_in_trick) == 1:
            self.state["lead_suit"] = card.suit.value if (card.value != CardValue.WIZARD and card.value != CardValue.JESTER) else self.NUM_SUITS


    def _evaluate_trick(self) -> int:
        """Determine the winner of the current trick"""
        # Create list of (card, player_index) pairs in play order
        cards_with_players = [(card, (self.trick_leader + i) % self.NUM_PLAYERS) 
                            for i, card in enumerate(self.cards_played_in_trick)]
        
        # Check for wizards first (last wizard played wins)
        for card, player in reversed(cards_with_players):
            if card.value == CardValue.WIZARD:
                return player
        
        # If all cards are jesters, trick leader wins
        if all(card.value == CardValue.JESTER for card, _ in cards_with_players):
            return self.trick_leader
        
        # Find the first non-jester card as initial winner
        winning_card, winner = next((card, player) for card, player in cards_with_players 
                                  if card.value != CardValue.JESTER)
        
        # Compare remaining cards
        for card, player in cards_with_players:
            if card.value == CardValue.JESTER:
                continue
            
            # Handle trump suit
            if (self.trump_card and 
                card.suit == self.trump_card.suit and 
                winning_card.suit != self.trump_card.suit):
                winning_card = card
                winner = player
                continue
            
            # Handle same suit comparison
            if (card.suit == winning_card.suit and 
                card.value.value > winning_card.value.value):
                winning_card = card
                winner = player
        
        return winner

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[Dict, Dict]:
        super().reset(seed=seed)
        
        # Initialize state
        self.state = {
            "hand": np.zeros(self.DECK_SIZE, dtype=np.int32),
            "trump_card": np.zeros(self.DECK_SIZE, dtype=np.int32),
            "cards_played_in_trick": np.zeros(self.DECK_SIZE, dtype=np.int32),
            "cards_played_in_round": np.zeros(self.DECK_SIZE, dtype=np.int32),
            "player_bids": np.zeros(self.NUM_PLAYERS, dtype=np.int32),
            "player_tricks": np.zeros(self.NUM_PLAYERS, dtype=np.int32),
            "player_scores": np.zeros(self.NUM_PLAYERS, dtype=np.int32),
            "round_number": 1,
            "phase": 0,  # Start in bidding phase
            "lead_suit": self.NUM_SUITS,  # No lead suit initially
            "position_in_trick": 0,  # Our position relative to trick leader
            "valid_actions": np.zeros(self.DECK_SIZE, dtype=np.int32),
        }
        
        self.cards_played_in_trick = []
        self.hands = [[] for _ in range(self.NUM_PLAYERS)]
        self.trick_leader = self.round_starter  # First trick is led by round starter
        self._deal_cards()
        self._update_valid_actions()  # Make sure to update valid actions after dealing
        
        return self.state, {}

    def _get_next_player(self, current_player):
        """Get the next player in the trick"""
        return (current_player + 1) % self.NUM_PLAYERS

    def _play_until_agent_turn(self):
        """Simulate other players until it's the agent's turn"""
        # If bidding phase, simulate bids before agent
        if self.state["phase"] == 0:
            if self.round_starter != 0:  # If we're not the round starter
                for i in range(self.round_starter, self.NUM_PLAYERS):
                    valid_bids = list(range(self.state["round_number"] + 1))
                    bid = self.np_random.choice(valid_bids)
                    self.state["player_bids"][i] = bid
                    #print(f"Player {i} bids {bid}")
            self._update_valid_actions()
            return

        # If playing phase, simulate plays until agent's turn
        current_player = self.trick_leader
        while current_player != 0:
            self._simulate_play(current_player)
            current_player = self._get_next_player(current_player)

    def _finish_trick(self) -> float:
        """Handle end of trick logic"""
        winner = self._evaluate_trick()
        reward = 0
        if winner == 0:
            if self.state["player_tricks"][0] < self.state["player_bids"][0]:
                reward = 0.2
            else:
                reward = -0.2 # Winning tricks after reaching bid amount is bad
        #print(f"Player {winner} wins the trick")
        self.state["player_tricks"][winner] += 1
        self.trick_leader = winner
        self.state["position_in_trick"] = (4 - self.trick_leader) % 4
        
        # Clear trick state
        self.cards_played_in_trick = []
        self.state["cards_played_in_trick"].fill(0)
        self.state["lead_suit"] = self.NUM_SUITS
        self._update_valid_actions()
        return reward

    def _finish_round(self):
        """Handle end of round logic"""
        # Calculate scores for this round
        reward = 0
        for i in range(self.NUM_PLAYERS):
            old_score = self.state["player_scores"][i]
            if self.state["player_tricks"][i] == self.state["player_bids"][i]:
                self.state["player_scores"][i] += 1 + 1 * self.state["player_bids"][i]
            else:
                self.state["player_scores"][i] -= abs(self.state["player_bids"][i] - self.state["player_tricks"][i])
            if i == 0:
                reward = (self.state["player_scores"][i] - old_score)
        # Prepare next round
        self.state["round_number"] += 1
        self.state["phase"] = 0
        self.state["player_bids"].fill(0)
        self.state["player_tricks"].fill(0)
        self.state["cards_played_in_round"].fill(0)
        
        # Rotate round starter
        self.round_starter = (self.round_starter + 1) % self.NUM_PLAYERS
        self.trick_leader = self.round_starter
        self.state["position_in_trick"] = (4 - self.round_starter) % 4
        
        # Deal new cards
        self._deal_cards()
        self._update_valid_actions()
        
        return reward

    def step(self, action):
        """Take a step in the environment"""
        done = False
        truncated = False
        reward = 0
        
        # Process agent's action
        if self.state["phase"] == 0:  # Bidding phase
            self._process_bid(action)
            
            # Simulate remaining bids
            for i in range(1, self.round_starter) if self.round_starter != 0 else range(1, self.NUM_PLAYERS):
                valid_bids = list(range(self.state["round_number"] + 1))
                if i == self.NUM_PLAYERS - 1:  # Last bidder
                    forbidden_bid = self.state["round_number"] - sum(self.state["player_bids"])
                    if forbidden_bid >= 0 and forbidden_bid <= self.state["round_number"]:
                        valid_bids.remove(forbidden_bid)
                bid = self.np_random.choice(valid_bids)
                self.state["player_bids"][i] = bid
                #print(f"Player {i} bids {bid}")
            
            # Start playing phase
            self.state["phase"] = 1
            self.trick_leader = self.round_starter
            self.state["position_in_trick"] = (4 - self.trick_leader) % 4
            self._update_valid_actions()
            
            # Simulate plays until agent's turn
            self._play_until_agent_turn()
            
        else:  # Playing phase
            # Process agent's play
            self._process_play(action)
            
            # Simulate remaining plays in trick
            current_player = self._get_next_player(0)  # Start with player after agent
            while current_player != self.trick_leader:
                self._simulate_play(current_player)
                current_player = self._get_next_player(current_player)
            
            # Handle end of trick
            reward = self._finish_trick()
            
            # Check if round is complete
            if all(len(hand) == 0 for hand in self.hands):
                #print("Round complete")
                reward = self._finish_round()
                if self.state["round_number"] > self.MAX_ROUND:
                    #print(f"Game over. Final scores: {self.state['player_scores']}")
                    done = True
                else:
                    # Simulate until agent's next turn
                    self._play_until_agent_turn()
            else:
                # Simulate until agent's next turn in the new trick
                self._play_until_agent_turn()
        
        return self.state, reward, done, truncated, {}

    def render(self):
        if self.render_mode == "human":
            print("\nCurrent State:")
            print(f"Round: {self.state['round_number']}")
            print(f"Phase: {'Bidding' if self.state['phase'] == 0 else 'Playing'}")
            print(f"Trump Card: {self.trump_card}")
            print(f"Hand: {self.hands[0]}")
            print(f"Current Trick: {self.cards_played_in_trick}")
            print(f"Bids: {self.state['player_bids']}")
            print(f"Tricks: {self.state['player_tricks']}")
            print(f"Scores: {self.state['player_scores']}")

    def _simulate_play(self, player_idx):
        """Simulate a play for the given player"""
        valid_cards = [card for card in self.hands[player_idx] if self._is_valid_play(card, player_idx)]

        if valid_cards:
            card = self.np_random.choice(valid_cards)
            #print(f"Player {player_idx} plays {card}")
            if self.state["lead_suit"] == self.NUM_SUITS and card.value != CardValue.WIZARD and card.value != CardValue.JESTER:
                self.state["lead_suit"] = card.suit
            self.hands[player_idx].remove(card)
            self.cards_played_in_trick.append(card)
            self.state["cards_played_in_trick"] += card.to_vector(self.DECK_SIZE)
            self.state["cards_played_in_round"] += card.to_vector(self.DECK_SIZE)

    def _is_valid_play(self, card: Card, player_idx: int) -> bool:
        """Check if a card is a valid play"""
        # Check if card is in hand
        if card not in self.hands[player_idx]:
            return False
        
        # Check if card is a valid play based on current trick
        if len(self.cards_played_in_trick) == 0:
            return True
        
        # Can always play wizard and jester
        if card.value == CardValue.WIZARD or card.value == CardValue.JESTER:
            return True
        
        # Find lead suit
        lead_suit = None
        for c in self.cards_played_in_trick:
            if c and c.value != CardValue.JESTER and c.value != CardValue.WIZARD:
                lead_suit = c.suit
                break
        
        # If no lead suit (only special cards played), all cards valid
        if not lead_suit:
            return True
        
        # Check if player has lead suit
        has_lead_suit = False
        for c in self.hands[player_idx]:
            if c.suit == lead_suit:
                has_lead_suit = True
                break
        
        # If player has lead suit, must play it
        if has_lead_suit:
            return card.suit == lead_suit
        
        # If no lead suit, can play anything
        return True
