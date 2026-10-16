[Roadster Rush](../../README.md) / Driver’s handbook / 06

# Race with friends

**One room code. Up to four drivers. Three laps to settle it.**

Private rooms let you race a group through the same countdown, pickups and finish. You can choose either circuit and start another race together with a rematch.

## Create a room

1. Enter your driver name and choose your paint colour.
2. Select **Race with Friends** on the home screen.
3. Create a room and share its code with your friends.
4. Choose **Neon City** or **Starport Circuit** in the lobby.

## Join and get ready

Guests open Race with Friends and enter the shared room code. Rooms support **two to four drivers**.

Everyone marks themselves ready. Once the group is ready, the host starts the shared countdown. If the host changes the circuit, readiness resets so each driver can confirm the new selection.

## During the race

Boost canisters and mystery boxes are shared. If a rival picks one up first, you must wait for it to respawn. Power-ups affect other drivers, and item effects are part of the shared race state.

The race server calculates movement, collisions, checkpoints and finishing positions from each driver’s controls. Your browser renders the race and displays the updated state.

**Opening the menu does not pause an online race.** Other players keep driving while you are in the menu.

## Rematches and leaving

Choose a rematch after the result to race again. A fresh race resets pickups, inventories and item effects. If the host leaves, the host role transfers to a remaining player.

The current build does not support reconnecting to a race after a disconnect. An empty room is removed, and restarting the race server clears its rooms.

## Availability

Online racing requires a running race server connected to the website. **Publishing the website alone does not start that separate server.** Solo racing and practice work independently in the browser.

| What happens                                  | What to check                                                                  |
| :-------------------------------------------- | :----------------------------------------------------------------------------- |
| **The game opens but rooms will not connect** | The race server must be online and configured for the website.                 |
| **A room code no longer works**               | The room may have emptied or the server may have restarted. Create a new room. |
| **The host cannot start**                     | Check that at least two drivers are present and everyone is ready.             |
| **Ready status disappeared**                  | Changing the circuit resets everyone’s readiness.                              |

Server setup is covered in the [developer guide](../development.md#online-multiplayer). The current release focuses on private rooms; public matchmaking is not included.

---

[← The circuits](circuits.md) · **[Next: v0.5.0 & what’s next →](../releases/v0.5.0.md)**
