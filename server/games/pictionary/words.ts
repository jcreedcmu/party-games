const WORDS = [
  // Animals
  'cat', 'dog', 'elephant', 'giraffe', 'penguin', 'butterfly', 'dolphin', 'octopus',
  'horse', 'rabbit', 'snake', 'eagle', 'whale', 'tiger', 'bear', 'monkey',
  // Food
  'pizza', 'hamburger', 'ice cream', 'spaghetti', 'banana', 'apple', 'cake', 'cookie',
  'sandwich', 'taco', 'donut', 'watermelon', 'popcorn', 'pancake', 'sushi', 'cheese',
  // Objects
  'umbrella', 'telescope', 'guitar', 'bicycle', 'airplane', 'rocket', 'camera', 'clock',
  'diamond', 'key', 'lamp', 'mirror', 'phone', 'scissors', 'sword', 'treasure',
  // Nature
  'mountain', 'ocean', 'volcano', 'rainbow', 'tornado', 'waterfall', 'forest', 'desert',
  'island', 'sunrise', 'lightning', 'snowflake', 'cactus', 'mushroom', 'river', 'cave',
  // Places
  'castle', 'hospital', 'library', 'museum', 'pyramid', 'lighthouse', 'bridge', 'barn',
  'church', 'school', 'airport', 'stadium', 'prison', 'restaurant', 'theater', 'factory',
  // Actions
  'swimming', 'dancing', 'sleeping', 'cooking', 'fishing', 'camping', 'surfing', 'skiing',
  'painting', 'singing', 'running', 'flying', 'climbing', 'juggling', 'boxing', 'diving',
  // Body
  'brain', 'skeleton', 'muscle', 'heart', 'lungs', 'stomach', 'eyeball', 'tongue',
  // Vehicles
  'submarine', 'helicopter', 'spaceship', 'sailboat', 'motorcycle', 'ambulance', 'train', 'canoe',
  // Characters
  'pirate', 'wizard', 'astronaut', 'cowboy', 'mermaid', 'vampire', 'ninja', 'clown',
  'princess', 'robot', 'zombie', 'knight', 'alien', 'detective', 'superhero', 'ghost',
  // Space
  'comet', 'planet', 'constellation', 'eclipse', 'meteor', 'satellite', 'galaxy', 'black hole',
  // Household
  'bathtub', 'fireplace', 'staircase', 'chandelier', 'bookshelf', 'television', 'refrigerator', 'toaster',
  // Sports
  'basketball', 'soccer', 'tennis', 'bowling', 'golf', 'baseball', 'hockey', 'volleyball',
  // Misc
  'dragon', 'unicorn', 'dinosaur', 'crown', 'anchor', 'compass', 'feather', 'puzzle',
  'balloon', 'candle', 'kite', 'ladder', 'magnet', 'parachute', 'trophy', 'wheel',
  'scarecrow', 'igloo', 'hammock', 'trampoline', 'snowman', 'maze', 'fountain', 'lantern',
];

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}
