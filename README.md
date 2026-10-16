# Guess the Object

A party game for phones. A few players (the knowers) each secretly hold an object from a shared category. Everyone else takes turns asking one question, then guesses every object at the end.

## Run it

```
npm install
npm start          # http://localhost:3000
```

Players open the address on their phones (same network, or put it behind any host that supports WebSockets), one creates a party and shares the 4-letter code.

- `public/demo.html` is a single-player preview where four bots play with you.
- `npm test` runs the rule tests. `node test/e2e.js` drives four real browsers through a game (needs Playwright).
- `node build-preview.js` bundles the bot preview into `preview.html`.

## Rules as built

- Host picks the category once per game (Food, Animal, Country, Video Game, Movie, or a custom list), the number of knowers (1 to half the players) and the game length: a number of rounds, or total time.
- Knowers are fixed for the game and each holds a different object. A knower can reroll their own object; everyone is told.
- Each round one guesser (rotating, so everyone asks before anyone repeats) asks one question to the knower the screen picks. The knower answers freely. Everyone sees everything.
- In time mode the round in progress finishes after time is up.
- At the end every guesser types one guess per knower (spelling is matched loosely). A right guess is 1 point. A knower gets 1 point if anyone got theirs, never more.
- Highest score wins the game, and the party keeps a tally of game wins across games.

All state lives on the server and each player only receives their own view, so a knower's object never reaches anyone else's browser. Parties are kept in memory and disappear when the server restarts.
