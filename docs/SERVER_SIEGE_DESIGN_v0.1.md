# Server Siege — Design Doc v0.1

*Working draft. Numbers are placeholders until bot simulations. Items marked **(draft)** are suggestions not yet confirmed.*

---

## 1. Pitch

A single-player, asynchronous army auto battler. The old world fell and life went back to a medieval style: peasants, knights, castles. But the old world's **data centers** still stand, and a few factions remember how to wake them. Their tech is seen as magic: firewalls are wards, drones are spirits, sysadmins are wizards.

You lead one faction. Conquer castles, hold the majority, and outlast everyone. You plan; the battles play out on their own.

---

## 2. Core structure

- **Private world:** a full single-player game. Every other faction is a bot.
- **Random map:** about **15 castles** connected by roads, with **5–6 factions** (you plus 4–5 bots).
- **Turns are days**, each split into three phases:

| Phase | What happens |
|---|---|
| **Night** | Decisions: shop/recruit, upkeep, wizard work, give orders |
| **Morning** | Movement: every army moves at the same time along roads |
| **Evening** | Battles at castles. You watch your own; the rest are resolved off-screen and reported as **news** |

- **Road length = number of mornings to travel.** Distance and timing matter for every decision.
- v1: battles only happen at castles, never on the open road.

---

## 3. Win and loss

- **Last faction standing wins.**
- **Dominion:** a faction holding a **majority (8+ of 15 castles)** fills a Dominion meter by 1 each day. A full meter (**~5 days**) wins. While it's filling, every other faction's income drains a little more each day.
  - Bots can win this way too, so you can lose without being wiped out.
  - Bots focus their attacks on whoever holds the majority (natural catch-up).
- **Game over:** your King dies, or your faction has no King and no army left.

---

## 4. The King and wizards

- **Wizards are required to attack.** You can't break a castle's wards without one. Wizards are the real limit on how many attacks you can make.
- **Hired wizards:** cost gold. Weaker. If one dies, you must **train** a replacement at a Shrine (takes days, costs mana). With no wizards left you're stuck on defence.
- **The King:** the strongest wizard, with big battle buffs. **If he dies, it's game over.**
  - **(draft)** The King can only die in a *Routed* outcome. In a *Breached* outcome he's wounded and escapes, out of action for a few days.
- In battle, the wizard stands behind the lines and casts support (ward / heal / buff). He can be hit if the line collapses.
- Wizards also work on castles: repairing and upgrading guardians, running data center effects.

---

## 5. Battle system

### 5.1 Battlefield
- Each side: **3 lanes × 2 rows** (front / back) = **6 squad slots**.
- **The player places squads** in lanes and rows before the battle.
- One **squad** per slot (e.g. 8 pikemen). Squad HP is a pool, and soldiers drop visibly as it shrinks.
- **Defenders** also have guardian turrets / walls in their lanes and the **core** behind them.
- Fully simulated, no interaction.

### 5.2 Targeting
- Attack the enemy in your own lane, front row first.
- If your lane is empty, move to the next lane.
- Back-row ranged units fire over their own front line.
- Attackers damage the core once their lane is clear of defenders and structures.

### 5.3 Damage vs armour (Warcraft 3 style)
- Counter: **1.5×** damage. Countered: **0.75×**. Otherwise 1.0×.
- Core triangle: **melee > ranged > anti-melee > melee**
- **Siege > fortified** (walls, turrets, core)

### 5.4 Unit roster (names are placeholders)

| Unit | Role | Notes |
|---|---|---|
| Levy Swordsman | Basic melee | Beats ranged by closing in |
| Bowman | Basic ranged | Beats anti-melee |
| Pikeman | Basic anti-melee | Beats melee |
| Iron Knight | Reinforced melee | Riot-armour tank, high HP, slow; holds up better against pikes |
| Arc Halberdier | Special anti-melee | Spark-batons that stun melee on hit |
| Siege: Ballista → Catapult → Trebuchet | Premium ranged | Huge splash, big bonus vs fortified, slow fire, minimum range, paper armour |
| Faction unique | 1 per faction | See section 8 |

Siege creates the main attack puzzle: bring siege to crack the walls, and enough front line to protect it.

### 5.5 Outcomes (same for both sides)

| Outcome | Result |
|---|---|
| **Repelled** | Attacker retreats with losses |
| **Breached** | Both sides take losses; castle **wards are down** for ~2 days (debuffed, open to a follow-up attack) |
| **Routed** | Castle changes owner; defenders flee to the nearest friendly castle or are destroyed |

---

## 6. Castles

### 6.1 Types (v1)

| Type | Produces | Recruits |
|---|---|---|
| **Granary** | Food | Levies (Swordsmen, Bowmen, Pikemen) |
| **Forge** | Gold | Iron Knights, siege |
| **Shrine** (data center) | Lots of mana | Wizards (training), Arc Halberdiers |

Recruitment depends on the castles you hold, so what you conquer shapes the army you can build.

### 6.2 Neutral castles — the Old Guardians
- Some castles start unowned, guarded by **automated defences** (turrets, golems, sentinel drones seen as spirits).
- Predictable: no intel needed. Good for early expansion.
- Better castles have tougher guardians.
- **When captured, the guardian system becomes yours, but damaged.** Wizards repair and upgrade it with mana (**(draft)** e.g. mounted ballistas).
- Attacking an enemy castle can mean fighting its army **and** whatever guardians they've restored.

### 6.3 Data center effects
- Held castles (especially Shrines) give **permanent effects** to your kingdom or troops while you hold them. They're lost if you're routed.
- **(draft)** Effect list TBD (e.g. weapon buffs, free intel, morale, income).

---

## 7. Economy

| Resource | Main use | Main source |
|---|---|---|
| **Food** | Upkeep: every squad eats each night. A shortage causes desertion | Granaries |
| **Gold** | Recruiting troops, hiring wizards | Forges, all castles |
| **Mana** | Wizard work: guardians, wizard training, battle spells | Shrines (data centers) |

### Army limits
- **Battlefield:** fixed 6 slots per battle.
- **Command limit:** total squads you can own. **Grows with each castle held.** Each castle fields its own garrison of up to 6.
- Food upkeep naturally limits overexpansion.

---

## 8. Factions

Everyone picks from the same list (player and bots). Mirror matches are fine. Each faction has:
- A **unique unit**
- A **perk with a drawback**
- **AI preferences** (how its bot plays): aggressive, defensive, expansionist, opportunist, etc.
- **(draft)** a preferred starting castle type

**(draft)** starting list:

| Faction | Unique unit | Perk / drawback | AI style |
|---|---|---|---|
| Ember Clan | Scrap Golem (slow living wall) | +20% siege damage / −10% food | Aggressive: attacks often, targets the weakest neighbour |
| Order of the Cloud | Drone Falconers (fly over the front line) | +20% mana / levies cost more | Defensive: fortifies, repairs guardians, rarely overreaches |
| Rust Barons | Smoke Rangers (stealth flankers) | +gold income / weaker guardians | Opportunist: hits Breached castles, finishes fights others started |
| Greenline Commune | Harvest Militia (cheap, numerous) | +30% food / weaker Knights | Expansionist: grabs neutral castles first |
| Cold Archive | Sentinel Warden (fortified-armour unit) | Stronger guardians / slow marching | Turtle: stays compact, builds Dominion late |

---

## 9. Bot AI (draft rules)

- Personality weights per faction (aggression, defence, expansion, opportunism).
- Shared rules: target the majority holder; reinforce Breached castles; prefer weak or neutral targets early.
- Off-screen battles use a quick resolve: army strength + castle bonuses + a dice roll.

---

## 10. The Wandering Court (losing all castles)

- The King and his remaining army go on the road instead of being wiped out.
- **Desertion** each night, getting worse every day, plus falling morale.
- **Lower upkeep and faster marching** (no baggage train).
- Comeback path: retake a castle (neutral ones are the lifeline).
- Game over only if the King dies or the army is gone.

---

## 11. First playable scope (v0.1 build)

**In:**
- Random map with ~15 castles, roads with travel times
- Player + 4 bot factions (faction choice at the start)
- Night / Morning / Evening loop
- 3 castle types, 3 resources, command limit
- 6 core units + 1 siege tier (Ballista)
- Lane/row placement, battle simulation and a simple battle view
- 3-tier battle outcomes
- Wizards required to attack; King death = game over
- Neutral castles with guardians
- News feed for off-screen battles
- Simple bot AI with personality weights

**Later:**
- Wandering Court, Dominion tuning, intel / scouting, faction unique units, catapult & trebuchet, data center effects, guardian upgrades, battles on the open road, announcer, save/resume, art pass

---

## 12. Open questions

- Exact stats, costs and upkeep (to be simulated)
- Data center effect list
- How battle spells work (automatic or chosen at night)
- Intel/fog-of-war design (deferred)
- Map generation rules (castle-type mix, distance between factions)
- Tech stack (likely same as the racer: static page, GitHub → VM pipeline)
