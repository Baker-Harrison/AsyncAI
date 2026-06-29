# AsyncAI — Domain Glossary

## Agent
A persistent AI entity the user creates and maintains a long-term relationship with. Has a name. Remembers past conversations and work. Not specialized or hardcoded to a specific type of task — can do anything the user asks.

## Computer
A Docker container that belongs to an Agent for its lifetime. Gives the agent a real environment to act in (filesystem, shell, network). Pauses when the app closes; resumes when the app reopens. One Computer per Agent.

## Chat
The primary interface between the user and an Agent. A single ongoing conversation that persists across sessions. The user types natural language; the agent uses its Computer to act.

## Integration
An external service (e.g. GitHub) the agent can interact with from its Computer. Not yet defined — left open.

## Memory
Conversation history for each Agent, persisted in SQLite on the host machine. Loaded on app open, appended to as the conversation progresses.
