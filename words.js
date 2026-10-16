/* Default category lists and accepted alternative spellings.
   Works in Node (module.exports) and in the browser (window.GameWords). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameWords = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const lists = {
    Food: [
      'Pizza', 'Burger', 'Sushi', 'Pasta', 'Tacos', 'French Fries', 'Fried Chicken', 'Ice Cream', 'Chocolate', 'Pancakes',
      'Bread', 'Cheese', 'Rice', 'Steak', 'Salad', 'Sandwich', 'Hot Dog', 'Donut', 'Cake', 'Cookie',
      'Soup', 'Omelette', 'Bacon', 'Sausage', 'Popcorn', 'Apple', 'Banana', 'Orange', 'Strawberry', 'Watermelon',
      'Grapes', 'Pineapple', 'Mango', 'Potato', 'Tomato', 'Carrot', 'Onion', 'Mushroom', 'Couscous', 'Falafel',
      'Kebab', 'Lasagna', 'Ramen', 'Curry', 'Dumplings', 'Croissant', 'Waffles', 'Burrito', 'Nachos', 'Yogurt'
    ],
    Animal: [
      'Dog', 'Cat', 'Horse', 'Cow', 'Pig', 'Sheep', 'Goat', 'Chicken', 'Duck', 'Rabbit',
      'Lion', 'Tiger', 'Elephant', 'Giraffe', 'Zebra', 'Monkey', 'Gorilla', 'Bear', 'Wolf', 'Fox',
      'Deer', 'Camel', 'Kangaroo', 'Koala', 'Panda', 'Hippo', 'Rhino', 'Crocodile', 'Snake', 'Turtle',
      'Frog', 'Lizard', 'Eagle', 'Owl', 'Parrot', 'Penguin', 'Flamingo', 'Dolphin', 'Whale', 'Shark',
      'Octopus', 'Jellyfish', 'Crab', 'Butterfly', 'Bee', 'Ant', 'Spider', 'Mouse', 'Squirrel', 'Bat'
    ],
    Country: [
      'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Colombia', 'Peru', 'Chile', 'UK', 'France',
      'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Switzerland', 'Sweden', 'Norway', 'Greece', 'Turkey',
      'Russia', 'Ukraine', 'Poland', 'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Nigeria', 'South Africa', 'Kenya',
      'Ethiopia', 'Saudi Arabia', 'UAE', 'Iran', 'Iraq', 'Israel', 'India', 'Pakistan', 'China', 'Japan',
      'South Korea', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Australia', 'New Zealand', 'Cuba', 'Jamaica', 'Ireland'
    ],
    'Video Game': [
      'Minecraft', 'Fortnite', 'GTA V', 'Super Mario Bros', 'The Legend of Zelda', 'Pokémon', 'Tetris', 'Pac-Man', 'Call of Duty', 'FIFA',
      'Roblox', 'Among Us', 'The Sims', 'Red Dead Redemption 2', 'The Witcher 3', 'Skyrim', 'Sonic the Hedgehog', 'Halo', 'Mortal Kombat', 'Counter-Strike'
    ],
    Movie: [
      'Titanic', 'Avatar', 'The Lion King', 'Star Wars', 'The Godfather', 'Jurassic Park', 'The Dark Knight', 'Forrest Gump', 'Inception', 'The Matrix',
      'Frozen', 'Toy Story', 'Harry Potter', 'The Lord of the Rings', 'Avengers: Endgame', 'Finding Nemo', 'Shrek', 'Spider-Man', 'Gladiator', 'Back to the Future'
    ]
  };

  // Other ways players might type the same answer. Typos are handled separately.
  const aliases = {
    'USA': ['US', 'United States', 'United States of America', 'America'],
    'UK': ['United Kingdom', 'Great Britain', 'Britain', 'England'],
    'UAE': ['United Arab Emirates', 'Emirates'],
    'South Korea': ['Korea', 'Republic of Korea'],
    'French Fries': ['Fries', 'Chips'],
    'Hot Dog': ['Hotdog'],
    'Ice Cream': ['Icecream'],
    'Donut': ['Doughnut'],
    'Omelette': ['Omelet'],
    'Lasagna': ['Lasagne'],
    'Hippo': ['Hippopotamus'],
    'Fried Chicken': ['Chicken wings'],
    'GTA V': ['GTA 5', 'Grand Theft Auto V', 'Grand Theft Auto 5'],
    'Super Mario Bros': ['Mario', 'Super Mario', 'Mario Bros'],
    'The Legend of Zelda': ['Zelda', 'Legend of Zelda'],
    'Pokémon': ['Pokemon'],
    'Pac-Man': ['Pacman'],
    'Call of Duty': ['COD'],
    'Red Dead Redemption 2': ['RDR2', 'Red Dead 2', 'Red Dead Redemption II'],
    'The Witcher 3': ['Witcher 3', 'The Witcher', 'Witcher', 'Witcher 3 Wild Hunt'],
    'Skyrim': ['The Elder Scrolls V Skyrim', 'Elder Scrolls Skyrim'],
    'Sonic the Hedgehog': ['Sonic'],
    'Counter-Strike': ['CS', 'CSGO', 'CS GO', 'CS2', 'Counter Strike'],
    'Mortal Kombat': ['MK'],
    'The Sims': ['Sims'],
    'The Lion King': ['Lion King'],
    'Star Wars': ['Starwars'],
    'The Godfather': ['Godfather'],
    'The Dark Knight': ['Dark Knight', 'Batman The Dark Knight'],
    'Forrest Gump': ['Forest Gump'],
    'The Matrix': ['Matrix'],
    'Harry Potter': ['Harry Potter and the Sorcerers Stone', 'Harry Potter and the Philosophers Stone'],
    'The Lord of the Rings': ['Lord of the Rings', 'LOTR'],
    'Avengers: Endgame': ['Avengers Endgame', 'Endgame'],
    'Finding Nemo': ['Nemo'],
    'Spider-Man': ['Spiderman', 'Spider Man'],
    'Back to the Future': ['BTTF']
  };

  return {
    lists,
    aliases,
    categories: Object.keys(lists),
    aliasesFor(name) { return aliases[name] || []; }
  };
});
