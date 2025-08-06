# Claude AI Configuration

A comprehensive configuration system for Claude AI with custom commands, development principles, and workflow optimizations.

## 🎯 Overview

This repository contains personal configurations for Claude AI, including:

- Custom slash commands for systematic development workflows
- Development principles (SOLID, DRY, TDD/RGRC)
- Progressive Enhancement and code readability guidelines
- Japanese language support

## 📁 Structure

```txt
.claude/
├── CLAUDE.md              # Main configuration (AI reads this)
├── COMMANDS.md            # Command reference (English)
├── COMMANDS_JP.md         # Command reference (Japanese)
├── commands/              # Command definitions
│   ├── code.md           # TDD/RGRC implementation
│   ├── fix.md            # Quick bug fixes
│   ├── hotfix.md         # Emergency production fixes
│   ├── research.md       # Investigation without implementation
│   ├── review.md         # Code review orchestration
│   ├── test.md           # Comprehensive testing
│   ├── think.md          # Planning & SOW creation
│   └── gemini/
│       └── search.md     # Google search via Gemini
├── rules/                 # English rule definitions
│   ├── core/             # Core AI principles
│   ├── commands/         # Command selection logic
│   ├── development/      # Development patterns
│   └── reference/        # Development methodologies
└── ja/                    # Japanese translations
    ├── CLAUDE.md         # Main config (Japanese)
    ├── commands/         # Command definitions (Japanese)
    └── rules/            # Rule definitions (Japanese)
```

## 🚀 Quick Start

### Installation

1. Clone this repository to your home directory:

   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-config.git ~/.claude
   ```

2. Or if you already have a `.claude` directory, back it up first:

   ```bash
   mv ~/.claude ~/.claude.backup
   git clone https://github.com/YOUR_USERNAME/claude-config.git ~/.claude
   ```

## 📝 Available Commands

### Core Development Commands

| Command | Purpose |
|---------|---------|
| `/think` | Planning & SOW creation |
| `/research` | Investigation without implementation |
| `/code` | TDD/RGRC implementation |
| `/test` | Comprehensive testing |
| `/review` | Code review via agents |

### Quick Action Commands

| Command | Purpose | Environment |
|---------|---------|-------------|
| `/fix` | Quick bug fixes | 🔧 Development |
| `/hotfix` | Emergency production fixes | 🚨 Production |

### External Tool Commands

| Command | Purpose | Requires |
|---------|---------|----------|
| `/gemini:search` | Google search via Gemini | Gemini CLI |

## 🔄 Standard Workflows

### Feature Development

```txt
/think → /research → /code → /test
```

### Bug Investigation & Fix

```txt
/research → /fix
```

### Emergency Response

```txt
/hotfix (standalone for critical issues)
```

## 🌏 Language Support

- **AI Processing**: English internally
- **User Output**: Japanese (configurable)
- **Documentation**: Available in both English and Japanese

## 🛠️ Key Features

### Development Principles

- **Progressive Enhancement**: CSS-first approach, build simple → enhance
- **Code Readability**: Based on "The Art of Readable Code"
- **Container/Presentational**: React component pattern
- **SOLID, DRY, TDD/RGRC**: Industry best practices

### Safety Features

- File deletion uses trash (`~/.Trash/`) instead of permanent deletion
- Pre-task understanding checks for complex operations
- User confirmation required for file modifications

## 📚 Documentation

- [Commands Reference (English)](./COMMANDS.md)
- [Commands Reference (Japanese)](./COMMANDS_JP.md)
- [Configuration Guide](./CLAUDE.md)
- [Japanese Configuration](./ja/CLAUDE.md)

## 🤝 Contributing

Feel free to fork this repository and customize it for your needs. Pull requests for improvements are welcome!

## 📜 License

MIT License - Feel free to use and modify as needed.

## 👤 Author

thkt

---

*This configuration enhances Claude AI's capabilities for systematic software development with a focus on quality, readability, and maintainability.*
