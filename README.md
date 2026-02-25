# Iwan — Open Source AI Agent for Slack

Iwan is an open-source AI agent that works as a team coworker in Slack. It crawls and remembers messages from channels, answers questions using Claude AI, and provides context-aware responses based on your team's conversation history.

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/iwan.git
   cd iwan
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. Start the bot:
   ```bash
   npm start
   ```

## Usage

- Add Iwan to your Slack workspace
- Invite Iwan to channels you want it to monitor
- Mention `@Iwan` with a question — it will answer using AI and context from your channels

## Contributing

Contributions are welcome! Please read the code, keep it simple, and submit a Pull Request.

- One function = one task
- Max 30 lines per function
- Comments in Polish above each function
- Do not overwrite existing code — add new functions separately

## License

[MIT](LICENSE)
