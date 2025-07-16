# Gemini MCP Server - Local Version

[![smithery badge](https://smithery.ai/badge/@fuko2935/gemini-mcp-server-local)](https://smithery.ai/server/@fuko2935/gemini-mcp-server-local)

🏠 **Local MCP server for Gemini AI codebase analysis with direct folder path support**

Perfect for private projects, local development, and security-conscious teams. Your code never leaves your machine.

## Features

- 📁 **Direct folder path analysis** - No GitHub integration needed
- 🔒 **Complete privacy** - All processing happens locally
- 🎯 **36 specialized analysis modes** - From general to security, performance, architecture
- 🚀 **Gemini 2.5 Pro** - Most capable and intelligent Gemini model
- 🛡️ **Security first** - Binary file filtering, size limits, ignore patterns
- 📊 **Smart file processing** - Automatic exclusion of build artifacts and dependencies

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up Gemini API Key

Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 3. Build and Run

```bash
npm run build
npm start
```

### 4. Use with Smithery AI

The server will be available for local deployment in Smithery AI using their CLI.

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
# MCP input: {"folderPath": "/path/to/project", "question": "Find security vulnerabilities", "analysisMode": "security"}
```

### Architecture Review
```bash
# Architecture analysis
# MCP input: {"folderPath": "./src", "question": "Explain the system architecture", "analysisMode": "architecture"}
```

## Configuration

### Environment Variables

- `GEMINI_API_KEY` - Required. Your Gemini API key
- `NODE_ENV` - Optional. Set to "production" for production builds

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