# Codebuff

Codebuff is an AI coding assistant that edits your codebase through natural language instructions. Instead of using one model for everything, it coordinates specialized agents that work together to understand your project and make precise changes.

<div align="center">
  <img src="./assets/codebuff-vs-claude-code.png" alt="Codebuff vs Claude Code" width="400">
</div>

Codebuff beats Claude Code at 61% vs 53% on [our evals](evals/README.md) across 175+ coding tasks over multiple open-source repos that simulate real-world tasks.

![Codebuff Demo](./assets/demo.gif)

## How it works

When you ask Codebuff to "add authentication to my API," it might invoke:

1. A **File Explorer Agent** scans your codebase to understand the architecture and find relevant files
2. An **Planner Agent** plans which files need changes and in what order
3. An **Implementation Agents** make precise edits
4. A **Review Agents** validate changes

<div align="center">
  <img src="./assets/multi-agents.png" alt="Codebuff Multi-Agents" width="250">
</div>

This multi-agent approach gives you better context understanding, more accurate edits, and fewer errors compared to single-model tools.

## CLI: Install and start coding

Install:

```bash
npm install -g codebuff
```

Run:

```bash
cd your-project
codebuff
```

Then just tell Codebuff what you want and it handles the rest:

- "Fix the SQL injection vulnerability in user registration"
- "Add rate limiting to all API endpoints"
- "Refactor the database connection code for better performance"

Codebuff will find the right files, makes changes across your codebase, and runs tests to make sure nothing breaks.

## Create custom agents

To get started building your own agents, run:

```bash
codebuff init-agents
```

You can write agent definition files that give you maximum control over agent behavior.

Implement your workflows by specifying tools, which agents can be spawned, and prompts. We even have TypeScript generators for more programmatic control.

For example, here's a `git-committer` agent that creates git commits based on the current git state. Notice that it runs `git diff` and `git log` to analyze changes, but then hands control over to the LLM to craft a meaningful commit message and perform the actual commit.

```typescript
export default {
  id: 'git-committer',
  displayName: 'Git Committer',
  model: 'openai/gpt-5-nano',
  toolNames: ['read_files', 'run_terminal_command', 'end_turn'],

  instructionsPrompt:
    'You create meaningful git commits by analyzing changes, reading relevant files for context, and crafting clear commit messages that explain the "why" behind changes.',

  async *handleSteps() {
    // Analyze what changed
    yield { tool: 'run_terminal_command', command: 'git diff' }
    yield { tool: 'run_terminal_command', command: 'git log --oneline -5' }

    // Stage files and create commit with good message
    yield 'STEP_ALL'
  },
}
```

## SDK: Run agents in production

Install the [SDK package](https://www.npmjs.com/package/@codebuff/sdk) -- note this is different than the CLI codebuff package.
```bash
npm install @codebuff/sdk
```

Import the client and run agents!

```typescript
import { CodebuffClient } from '@codebuff/sdk'

// 1. Initialize the client
const client = new CodebuffClient({
  apiKey: 'your-api-key',
  cwd: '/path/to/your/project',
  onError: (error) => console.error('Codebuff error:', error.message),
})

// 2. Do a coding task...
const result = await client.run({
  agent: 'base', // Codebuff's base coding agent
  prompt: 'Add comprehensive error handling to all API endpoints',
  handleEvent: (event) => {
    console.log('Progress', event)
  },
})

// 3. Or, run a custom agent!
const myCustomAgent: AgentDefinition = {
  id: 'greeter',
  displayName: 'Greeter',
  model: 'openai/gpt-5',
  instructionsPrompt: 'Say hello!',
}
await client.run({
  agent: 'greeter',
  agentDefinitions: [myCustomAgent],
  prompt: 'My name is Bob.',
  customToolDefinitions: [], // Add custom tools too!
  handleEvent: (event) => {
    console.log('Progress', event)
  },
})
```

Learn more about the SDK [here](https://www.npmjs.com/package/@codebuff/sdk).

## Configuration

Codebuff can be configured using environment variables.

- `CB_KEY`: Your API key.
- `CB_BASE_URL`: The base URL for the API. It should not include any specific paths like `/chat/completions`. For example: `https://api.example.com/v1`.
- `CB_MODEL`: A semicolon-separated list of models to use. The models are assigned to agents based on a fixed order. If there are more agents than models, the first model in the list is used as a fallback.
  - **Agent Order**: `base`, `ask`, `thinker`, `file-explorer`, `file-picker`, `researcher`, `planner`, `reviewer`, `agent-builder`.
  - **Example**: If `CB_MODEL` is `claude-2;gpt-4`, then the `base` agent will use `claude-2`, the `ask` agent will use `gpt-4`, and all other agents will use `claude-2`.
- `CB_ENABLE_CUSTOM_MODELS`: A boolean flag to enable the custom model configuration. Defaults to `false`. If set to `true`, the custom model logic with `CB_KEY`, `CB_BASE_URL`, and `CB_MODEL` is used. Otherwise, the default logic is used.

## Why choose Codebuff

**Deep customizability**: Create sophisticated agent workflows with TypeScript generators that mix AI generation with programmatic control. Define custom agents that spawn subagents, implement conditional logic, and orchestrate complex multi-step processes that adapt to your specific use cases.

**Any model on OpenRouter**: Unlike Claude Code which locks you into Anthropic's models, Codebuff supports any model available on [OpenRouter](https://openrouter.ai/models) - from Claude and GPT to specialized models like Qwen, DeepSeek, and others. Switch models for different tasks or use the latest releases without waiting for platform updates.

**Reuse any published agent**: Compose existing [published agents](https://www.codebuff.com/agents) to get a leg up. Codebuff agents are the new MCP!

**Fully customizable SDK**: Build Codebuff's capabilities directly into your applications with a complete TypeScript SDK. Create custom tools, integrate with your CI/CD pipeline, build AI-powered development environments, or embed intelligent coding assistance into your products.

## Get started

### Install

**CLI**: `npm install -g codebuff`

**SDK**: `npm install @codebuff/sdk`

### Building from Source

If you want to build and run Codebuff from the source code, follow these steps:

1.  **Install dependencies**:
    ```bash
    bun install
    ```

2.  **Build the executable**:
    ```bash
    bun --cwd npm-app run build
    ```
    This will create a standalone executable in the `npm-app/bin` directory.

3.  **Add to PATH (Optional)**:
    To run the `codebuff` command from anywhere, add the `npm-app/bin` directory to your system's PATH.

    -   **Windows (Command Prompt)**:
        ```cmd
        setx PATH "%PATH%;C:\path\to\your\project\npm-app\bin"
        ```
        *Note: You need to replace `C:\path\to\your\project` with the absolute path to the project directory.*

    -   **Windows (PowerShell)**:
        ```powershell
        $newPath = $env:PATH + ";C:\path\to\your\project\npm-app\bin"
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        ```
        *Note: You need to replace `C:\path\to\your\project` with the absolute path to the project directory. Restart your terminal for the changes to take effect.*

    -   **macOS & Linux**:
        ```bash
        echo 'export PATH="$PATH:/path/to/your/project/npm-app/bin"' >> ~/.zshrc
        source ~/.zshrc
        ```
        *Note: You need to replace `/path/to/your/project` with the absolute path to the project directory. If you are using Bash, replace `~/.zshrc` with `~/.bashrc`.*

### Resources

**Running Codebuff locally**: [local-development.md](./local-development.md)

**Documentation**: [codebuff.com/docs](https://codebuff.com/docs)

**Community**: [Discord](https://codebuff.com/discord)

**Support**: [support@codebuff.com](mailto:support@codebuff.com)
