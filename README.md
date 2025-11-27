# 4-in-a-Row Backend - Real-time Multiplayer Game Server

A real-time multiplayer **4-in-a-Row** (Connect Four) game server built with **Node.js**, **WebSockets**, **PostgreSQL**, and **Kafka**.

**Repository:** [https://github.com/Pushparaj13811/4-in-a-row](https://github.com/Pushparaj13811/4-in-a-row)

**Frontend Repository:** [https://github.com/Pushparaj13811/4-in-a-row-frontend](https://github.com/Pushparaj13811/4-in-a-row-frontend)

## What is this?

This is the backend server for a multiplayer Connect Four game. It handles:
- Real-time game connections via WebSockets
- Player matchmaking (finds opponents or matches with a bot)
- Game logic (win detection, move validation)
- Leaderboard and game statistics
- Optional analytics via Kafka

## How to Run This Application

### Prerequisites

Make sure you have these installed on your computer:
- **Node.js** (version 24 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (version 12 or higher) - [Download here](https://www.postgresql.org/download/)
- **Kafka** (optional, only for analytics) - [Setup instructions below](#optional-kafka-analytics)

### Step-by-Step Setup

#### Step 1: Install Dependencies

Open your terminal and navigate to the backend folder, then run:

```bash
npm install
```

This installs all required packages.

#### Step 2: Set Up PostgreSQL Database

First, create a new database:

```bash
# For macOS/Linux
createdb -U postgres four_in_row

# For Windows (using psql)
psql -U postgres
CREATE DATABASE four_in_row;
\q
```

If you get a password error, use the default password or the one you set during PostgreSQL installation.

#### Step 3: Configure Environment Variables

The backend needs to know how to connect to your database. A `.env` file should already exist in the backend folder. Open it and verify these settings:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=four_in_row
DB_USER=postgres
DB_PASSWORD=postgres  # Change this to your PostgreSQL password

# Kafka (leave as false for now)
KAFKA_BROKER=localhost:9092
ENABLE_KAFKA=false
```

**Important**: Update `DB_PASSWORD` with your actual PostgreSQL password.

#### Step 4: Start the Backend Server

```bash
npm run dev
```

You should see output like this:

```
🚀 WebSocket server running on ws://localhost:3001
🎮 4-in-a-Row Game Server Ready!
📊 Matchmaking timeout: 10 seconds
🔄 Reconnection timeout: 30 seconds

✅ Connected to database: four_in_row
✅ Database tables ready
✅ Server initialization complete
```

The backend is now running and ready to accept connections from the frontend!

### Step 5: Start the Frontend

Now you need to start the frontend application to play the game. Open a **new terminal window** and navigate to the frontend folder, then follow the frontend README instructions.

---

## Optional: Kafka Analytics

If you want to track detailed game analytics (optional feature):

### Step 1: Install Kafka

**For macOS (using Homebrew):**
```bash
brew install kafka
```

**For Windows/Linux:**
- Download from [Apache Kafka](https://kafka.apache.org/downloads)
- Follow the installation instructions for your OS

### Step 2: Start Kafka Services

**For macOS:**
```bash
brew services start zookeeper
brew services start kafka
```

**For Windows/Linux:**
```bash
# Start Zookeeper (in one terminal)
bin/zookeeper-server-start.sh config/zookeeper.properties

# Start Kafka (in another terminal)
bin/kafka-server-start.sh config/server.properties
```

### Step 3: Enable Kafka in Backend

Edit your `.env` file:

```bash
ENABLE_KAFKA=true
```

### Step 4: Start Analytics Consumer

Open a **new terminal** and run:

```bash
npm run dev:consumer
```

Now the analytics consumer will track all game events in real-time!

---

## Understanding the Game Flow

1. **Player connects** → Frontend opens WebSocket connection to `ws://localhost:3001`
2. **Player joins** → Sends username, enters matchmaking queue
3. **Matchmaking** → Waits up to 10 seconds for another player
   - If found: Starts game with that player
   - If timeout: Starts game with AI bot
4. **Gameplay** → Players take turns dropping discs (column 0-6)
5. **Win/Draw** → Game ends, stats saved to database
6. **Reconnection** → If disconnected, players have 30 seconds to rejoin

---

## Available Commands

```bash
# Development (with auto-reload)
npm run dev              # Start game server
npm run dev:consumer     # Start analytics consumer (needs Kafka)

# Production
npm run build            # Compile TypeScript to JavaScript
npm start                # Run compiled server
npm run start:consumer   # Run compiled consumer

# Utilities
npm run format           # Format code with Prettier
npm run db:setup         # Manually initialize database
```

---

## Game Rules

- **Board**: 7 columns × 6 rows
- **Objective**: Connect 4 discs in a row (horizontal, vertical, or diagonal)
- **Players**: Red vs Yellow
- **Turns**: Players alternate moves
- **Draw**: If the board fills up with no winner

---

## How the Bot Works

The AI bot is **strategic**, not random. It:
1. **Wins immediately** if it has a winning move
2. **Blocks** your winning moves
3. **Builds threats** by creating 3-in-a-row opportunities
4. **Prefers center columns** for better positioning

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts              # Environment configuration
│   ├── db/
│   │   ├── database.ts         # PostgreSQL connection & queries
│   │   └── setups.ts           # Database initialization
│   ├── game/
│   │   ├── Game.ts             # Game logic (win detection, etc.)
│   │   ├── Bot.ts              # AI bot strategy
│   │   └── GameManager.ts      # Matchmaking & game sessions
│   ├── kafka/
│   │   ├── producer.ts         # Sends game events to Kafka
│   │   └── consumer.ts         # Processes analytics events
│   ├── types/
│   │   └── types.ts            # TypeScript type definitions
│   └── server.ts               # Main WebSocket server
│
├── .env                         # Environment variables
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

---

## Troubleshooting

### "Database connection failed"

**Problem**: Can't connect to PostgreSQL

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready

# If not running, start it:
# macOS
brew services start postgresql

# Linux
sudo service postgresql start

# Windows
# Use pgAdmin or Services app to start PostgreSQL
```

### "Port 3001 already in use"

**Problem**: Another process is using port 3001

**Solution**:
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9

# Or change the port in .env
PORT=3002
```

### "Kafka connection failed"

**Problem**: Kafka is not running (only if `ENABLE_KAFKA=true`)

**Solution**:
```bash
# Either start Kafka:
brew services start zookeeper
brew services start kafka

# Or disable Kafka in .env:
ENABLE_KAFKA=false
```

---

## WebSocket API

The frontend communicates with the backend via WebSocket messages:

### Client → Server

| Message Type | Purpose | Example |
|-------------|---------|---------|
| `join` | Join matchmaking | `{"type": "join", "username": "Alice"}` |
| `move` | Make a move | `{"type": "move", "gameId": "...", "column": 3}` |
| `rejoin` | Reconnect to game | `{"type": "rejoin", "username": "Alice", "gameId": "..."}` |
| `leave` | Leave game | `{"type": "leave", "username": "Alice"}` |
| `getLeaderboard` | Get top players | `{"type": "getLeaderboard"}` |

### Server → Client

| Message Type | Purpose |
|-------------|---------|
| `waiting` | Waiting for opponent |
| `gameStart` | Game started |
| `move` | Board updated |
| `rejoinSuccess` | Successfully rejoined |
| `leaderboard` | Leaderboard data |
| `error` | Error message |

---

## Database Tables

### Core Tables

**`games`** - Stores completed games
- Tracks player names, winner, move count, duration

**`players`** - Leaderboard data
- Tracks wins, losses, draws for each player

### Analytics Tables (Kafka)

**`game_analytics`** - Aggregated game statistics
- Game duration, move count, timestamps

**`move_analytics`** - Individual move tracking
- Every move made by every player

---

## What's Next?

Once the backend is running:
1. Start the frontend (see frontend README)
2. Open the app in your browser
3. Enter a username and click "Join Game"
4. Play against another player or the bot!

---

## Need Help?

- Check the console logs (they contain helpful information)
- Make sure PostgreSQL is running and accessible
- Verify your `.env` file has correct database credentials
- Ensure port 3001 is available

**Happy Gaming!**
