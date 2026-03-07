party-games
===========

This is an implementation of the game "Eat Poop You Cat" meant for
online play.

The main components are:

- a nodejs express server, written in typescript, that accepts http
  connections (no need for https yet) and also websocket connections
  for server-sent events.

- a client, written in typescript, using react, which presents a user
  interface for players to join the game and play it.

There should also be unit tests as appropriate.

The Game
========

When played in person, Eat Poop You Cat involves players passing
around a sheet of paper, which is folded over to reveal only the most
recent "move". A move is either a drawing or a small piece of text.
These moves alternate. So a player either tries to illustrate the text
they see, or tries to interpret the drawing they see. They can't see
earlier drawings or texts, just the most recent one. After the paper
has passed through all players, it is unfolded so all players can see
the often humorous progression of one idea through unexpected
permutations, like a visual version of the game of "telephone".

The Server
==========

The server needs to keep track of the current game state. We don't
need a notion of lobby or multiple active games for now. There are
three high-level states the server can be in:

- waiting
  players are still joining
- underway
  game has begun
- postgame
  game is complete, players can inspect results


Sequence of Online Play
-----------------------

Players after joining will need to signal that they are "ready". When
all players are ready, the game transitions from "waiting" to
"underway".

The server then picks a random cyclic order in which to arrange the
players.

We initialize one virtual "sheet" of paper for each player, and
present it to them. For a given round, the server randomly picks what
the initial move type is, either picture for everybody or text for
everybody.

There is a timer allotting 1 minute per round. When a round is up,
every sheet passes to the next player in the cyclic order in lockstep.

When all the sheets have passed through all players, then server
transitions to the "postgame" phase.

Authentication
--------------

The server is meant to be run by one of the people playing. Therefore,
simple password protection probably suffices to prevent the
possibility of griefing by random people on the internet. The password
could be set by a commandline argument to the server. Players should
be able to simply choose what their handle is when they join, instead
of any complicated notion of account creation or login.

The Client
==========

Modal dialog boxes should happen inside react rather than using native
apis for alerts, so that they can be styled consistently with the rest
of the game.

When a player sees the sheet they need to fill out, it should indicate
clearly whether the player is meant to supply text or a drawing. If
the sheet is not on its "first move" then the previous move should be
displayed immediately above the area where the player is supposed to
supply their move.

Text should be rendered centered in the available region.

There should be some kind of "submit" button attached to each sheet
for submitting the move, which then advances the sheet to the next
player in the cyclic order.

When the server reaches "postgame" phase, then the client should allow
all players to browse through all sheets. When viewing a sheet,
players should see the name of each player associated to the image or
text they created.
