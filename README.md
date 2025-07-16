# Gemini MCP Server - Local Version

🏠 **Local MCP server for Gemini AI codebase analysis with direct folder path support**

Perfect for private projects, local development, and security-conscious teams. Your code never leaves your machine.

## Features

- 📁 **Direct folder path analysis** - No GitHub integration needed
- 🔒 **Complete privacy** - All processing happens locally
- 🎯 **36 specialized analysis modes** - From general to security, performance, architecture
- 🚀 **Gemini 2.5 Pro** - Most capable and intelligent Gemini model
- 🔑 **Multi-key API rotation** - Support for multiple API keys with automatic rotation
- 🛡️ **Rate limit protection** - Automatic key switching on limits (4-minute uptime)
- 📊 **Smart file processing** - Automatic exclusion of build artifacts and dependencies
- 🔍 **Multiple analysis tools** - Local folder analysis, codebase analysis, code search
- 🚀 **Enhanced reliability** - Retry mechanisms and intelligent error handling

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up Gemini API Key(s)

Get your API key(s) from [Google AI Studio](https://makersuite.google.com/app/apikey)

**Single key:**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Multiple keys for rotation (recommended):**
```bash
export GEMINI_API_KEY="key1,key2,key3,key4"
```

**For Smithery AI deployment:**
Configure `geminiApiKeys` in Smithery with comma-separated keys for automatic rotation.

### 3. Build and Run

```bash
npm run build
npm start
```

### 4. Use with Smithery AI

The server will be available for local deployment in Smithery AI using their CLI.

**Smithery deployment:**
```bash
smithery deploy local
```

**Required configuration:**
- `geminiApiKeys`: Your API keys (comma-separated for multiple keys)

**Available tools:**
- `get_usage_guide` - Learn how to use the server
- `check_api_key_status` - Monitor API key rotation
- `analyze_local_folder` - Analyze local directories
- `gemini_codebase_analyzer` - Analyze formatted content
- `gemini_code_search` - Search through code

## Analysis Modes

Choose from 36 specialized analysis modes:

### 📋 General Modes
- **general** - Balanced analysis for any question
- **explanation** - Educational explanations for learning
- **onboarding** - New developer guidance

### 🔧 Development Modes
- **implementation** - Building features step-by-step
- **debugging** - Bug hunting and troubleshooting
- **refactoring** - Code improvement and optimization
- **testing** - Test strategy and quality assurance

### 🎯 Specialized Modes
- **security** - Security analysis and vulnerabilities
- **performance** - Performance optimization
- **audit** - Comprehensive code quality audit
- **architecture** - System design and patterns

### 🚀 Technology Modes
- **frontend** - Web UI, React, Vue analysis
- **backend** - Server-side, API analysis
- **mobile** - Mobile app development
- **devops** - CI/CD, deployment, infrastructure
- **aiml** - AI/ML, data science analysis
- **blockchain** - Web3, smart contracts

*And many more specialized modes available!*

## Example Usage

### Basic Analysis
```bash
# Analyze current directory
node dist/server.js
# Then use MCP client with: {"folderPath": ".", "question": "Analyze this project"}
```

### Security Audit
```bash
# Security-focused analysis
# MCP input: {"folderPath": ".", "question": "Find security vulnerabilities", "analysisMode": "security"}
```

### Architecture Review
```bash
# Architecture analysis
# MCP input: {"folderPath": "./src", "question": "Explain the system architecture", "analysisMode": "architecture"}
```

### Path Examples (Use Your Own Paths)
```bash
# Windows examples
{"folderPath": "C:\\MyProject", "question": "Analyze this"}
{"folderPath": "D:\\Development\\MyApp", "question": "Review code"}

# Linux/Mac examples  
{"folderPath": "/home/user/projects/myapp", "question": "Analyze this"}
{"folderPath": "/Users/name/Development/project", "question": "Review code"}

# Relative paths (recommended)
{"folderPath": ".", "question": "Analyze current directory"}
{"folderPath": "./src", "question": "Analyze source code"}
{"folderPath": "../other-project", "question": "Analyze sibling project"}
```

## Configuration

### Environment Variables

- `GEMINI_API_KEY` - Required. Your Gemini API key(s). Use comma-separated for multiple keys
- `NODE_ENV` - Optional. Set to "production" for production builds

### Multi-Key API Rotation

The server supports multiple API keys for better rate limit handling:

**Benefits:**
- Automatic key rotation on rate limits
- 4-minute continuous operation
- Improved reliability and uptime
- Intelligent error handling

**Configuration:**
```bash
# Single key
export GEMINI_API_KEY="your-key-here"

# Multiple keys (recommended)
export GEMINI_API_KEY="key1,key2,key3,key4,key5"
```

**Monitoring:**
Use `check_api_key_status` tool to monitor rotation and performance.

### Folder Processing

The server automatically ignores:
- `node_modules/`, `.git/`, `dist/`, `build/`
- Log files, lock files, temporary files
- Binary files (images, videos, executables)
- Files larger than 100KB

### Supported File Types

- Source code: `.js`, `.ts`, `.py`, `.java`, `.cpp`, `.cs`, `.php`, `.rb`, `.go`, `.rs`
- Configuration: `.json`, `.yaml`, `.yml`, `.toml`, `.ini`
- Documentation: `.md`, `.txt`, `.rst`
- Web: `.html`, `.css`, `.scss`, `.less`
- Database: `.sql`
- Scripts: `.sh`, `.bat`, `.ps1`

## Deployment

### Local Smithery AI Deployment

1. Build the project:
```bash
npm run build
```

2. Deploy to Smithery AI using their CLI:
```bash
smithery deploy local ./dist/server.js
```

3. The server will be available for local use in Smithery AI

### Direct Usage

You can also run the server directly and connect via stdio:

```bash
node dist/server.js
```

## Privacy & Security

- ✅ **Complete local processing** - Your code never leaves your machine
- ✅ **No remote storage** - All analysis happens in memory
- ✅ **Binary file filtering** - Automatically excludes non-text files
- ✅ **Size limits** - Prevents processing of extremely large files
- ✅ **Ignore patterns** - Skips sensitive directories and files
- ✅ **Environment isolation** - Each analysis is independent

## Troubleshooting

### Common Issues

**No files found:**
- Check folder path exists and is readable
- Ensure folder contains supported file types
- Verify permissions

**API Key errors:**
- Verify `GEMINI_API_KEY` is set correctly
- Check API key has quota remaining
- Ensure key is from Google AI Studio

**Large project performance:**
- The server automatically limits context size to 2MB
- Binary files are automatically excluded
- Use more specific folder paths for better performance

### Debug Mode

Set debug logging:
```bash
export NODE_ENV=development
```

## Development

### Project Structure

```
src/
├── server.ts          # Main MCP server implementation
├── types/             # TypeScript type definitions
└── utils/             # Utility functions

dist/                  # Built JavaScript files
```

### Build Scripts

- `npm run build` - Build TypeScript and make executable
- `npm run dev` - Build and run in development mode
- `npm start` - Run the built server

### Adding New Analysis Modes

1. Add the mode to the enum in `server.ts`
2. Create a corresponding prompt in `SYSTEM_PROMPTS`
3. Update the schema description
4. Rebuild and test

## License

MIT License - feel free to use in your projects!

## Support

- Check the troubleshooting section above
- Verify your Gemini API key and quota
- Ensure proper folder permissions
- Test with a simple folder first

---

*🏠 Local version - Your code stays on your machine*  
*🔒 Privacy-focused - No remote storage or processing*  
*🚀 Powered by Gemini 2.5 Pro*