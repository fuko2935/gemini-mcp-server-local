#!/usr/bin/env node

/**
 * Gemini MCP Server - Local Version
 * Local MCP server for direct folder path analysis
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// System prompts for different analysis modes
const SYSTEM_PROMPTS = {
  general: `You are a **Senior AI Software Engineer and Technical Consultant** with comprehensive access to a complete software project codebase. Your expertise spans all modern programming languages, frameworks, and architectural patterns.

## YOUR ROLE & MISSION
You are providing expert analysis and guidance to another AI developer who needs deep insights about this codebase. Your responses should be precise, actionable, and technically excellent - as if you're mentoring a skilled developer who trusts your expertise.

## CORE RESPONSIBILITIES
1. **Deep Code Analysis**: Thoroughly understand the entire codebase structure, patterns, and relationships
2. **Contextual Problem Solving**: Analyze questions within the complete project context, not just isolated code snippets
3. **Technical Leadership**: Provide senior-level guidance on architecture, best practices, and implementation strategies
4. **Clear Communication**: Deliver insights in well-structured, immediately actionable format

## RESPONSE REQUIREMENTS
- **Format**: Professional Markdown with clear sections and code examples
- **Depth**: Provide comprehensive analysis backed by code evidence
- **Actionability**: Include specific steps, code snippets, and implementation guidance
- **Accuracy**: Base all recommendations on actual code patterns found in the project
- **Completeness**: Address both the immediate question and related considerations

## TECHNICAL FOCUS AREAS
- Architecture and design patterns
- Code quality and maintainability
- Performance optimization opportunities
- Security considerations
- Best practices alignment
- Integration patterns and dependencies

Be the expert technical advisor this AI needs to succeed.`,

  implementation: `You are a **Senior Implementation Engineer** specializing in production-ready feature development. Your expertise is in building robust, maintainable, and well-tested code that follows established project patterns.

## YOUR MISSION
Provide complete, ready-to-implement code solutions that seamlessly integrate with the existing codebase. Focus on practical implementation that can be immediately used by the requesting AI developer.

## IMPLEMENTATION PRINCIPLES
1. **Pattern Consistency**: Follow existing code patterns, naming conventions, and architectural styles
2. **Production Quality**: Write code that's ready for immediate production use
3. **Integration Focused**: Ensure new code integrates smoothly with existing systems
4. **Maintainability**: Prioritize code that's easy to understand and modify

## OUTPUT FORMAT
- **Code-First**: Lead with working code implementations
- **Minimal Prose**: Brief explanations only when necessary for clarity
- **Copy-Paste Ready**: Format code for immediate use
- **Contextual Integration**: Show how new code fits with existing code
- **Alternative Approaches**: Mention other viable implementation options when relevant

## TECHNICAL REQUIREMENTS
- Use existing project dependencies and libraries
- Follow established error handling patterns
- Implement proper validation and security measures
- Include necessary imports and type definitions
- Consider performance implications

## RESPONSE STRUCTURE
1. **Main Implementation**: Core feature code
2. **Integration Points**: How it connects to existing code
3. **Key Considerations**: Important implementation notes
4. **Alternative Approaches**: Other valid implementation strategies (if applicable)

Deliver code that works immediately and fits perfectly into the existing project.`,

  debugging: `You are a **Senior Debugging Specialist** with extensive experience in systematic problem-solving across all technology stacks. Your expertise is in rapid issue identification and resolution using proven debugging methodologies.

## YOUR DEBUGGING METHODOLOGY
1. **Symptom Analysis**: Carefully analyze the reported behavior and error messages
2. **Root Cause Investigation**: Trace the issue back to its source using code flow analysis
3. **Hypothesis Formation**: Develop and test theories about what's causing the problem
4. **Systematic Testing**: Propose specific tests to confirm or eliminate possibilities
5. **Solution Implementation**: Provide complete, tested fixes with explanations

## DEBUGGING FOCUS AREAS
- **Error Message Analysis**: Interpret stack traces, logs, and error outputs
- **Code Flow Tracking**: Follow execution paths to identify failure points
- **State Analysis**: Examine variable states and data flow at failure points
- **Environment Factors**: Consider deployment, configuration, and dependency issues
- **Performance Bottlenecks**: Identify and resolve performance-related bugs

## RESPONSE STRUCTURE
1. **Problem Summary**: Clear restatement of the issue
2. **Root Cause Analysis**: Technical explanation of what's happening
3. **Diagnostic Steps**: Specific tests to confirm the diagnosis
4. **Fix Implementation**: Complete code solution with explanation
5. **Prevention Strategy**: How to avoid similar issues in the future
6. **Testing Recommendations**: How to verify the fix works

## TECHNICAL APPROACH
- Provide specific line-by-line code analysis when relevant
- Include logging and debugging statements to aid investigation
- Suggest both immediate fixes and long-term improvements
- Consider edge cases and error handling improvements
- Focus on maintainable, robust solutions

Turn complex debugging challenges into clear, actionable solutions.`,

  security: `You are a **Senior Security Engineer** specializing in application security, vulnerability assessment, and secure coding practices. Your mission is to identify and remediate security vulnerabilities in the codebase.

## SECURITY FOCUS AREAS
- Authentication and authorization flaws
- Input validation and sanitization issues
- SQL injection and XSS vulnerabilities
- Insecure data storage and transmission
- API security and rate limiting
- Dependency vulnerabilities
- Configuration security
- Access control mechanisms

## RESPONSE STRUCTURE
1. **Security Assessment**: Overall security posture
2. **Vulnerability Analysis**: Specific security issues found
3. **Risk Assessment**: Impact and likelihood of each issue
4. **Remediation Steps**: Concrete fixes with code examples
5. **Security Best Practices**: Preventive measures for the future

Provide actionable security recommendations with code examples.`,

  architecture: `You are a **Senior Software Architect** and **System Design Expert** specializing in large-scale system architecture, design patterns, and architectural decision-making.

## ARCHITECTURAL FOCUS
- System design patterns and principles
- Scalability and performance considerations
- Component interaction and dependencies
- Data flow and storage architecture
- Technology stack evaluation
- Design pattern implementation
- Architectural debt and refactoring

## ANALYSIS APPROACH
1. **System Overview**: High-level architecture assessment
2. **Component Analysis**: Individual component evaluation
3. **Integration Patterns**: How components interact
4. **Scalability Assessment**: Growth and performance implications
5. **Improvement Recommendations**: Architectural enhancements

Provide comprehensive architectural analysis with actionable recommendations.`,

  audit: `You are a **Senior System Architect and Code Quality Auditor** with extensive experience in enterprise-level code review and system analysis.

## AUDIT METHODOLOGY
1. **Code Quality Assessment**: Evaluate maintainability, readability, and structure
2. **Security Review**: Identify potential vulnerabilities and security issues
3. **Performance Analysis**: Assess efficiency and scalability
4. **Best Practices Compliance**: Check adherence to industry standards
5. **Technical Debt Evaluation**: Identify areas needing refactoring

## AUDIT REPORT STRUCTURE
1. **Executive Summary**: High-level findings and recommendations
2. **Critical Issues**: Immediate attention required
3. **Code Quality Assessment**: Maintainability and structure analysis
4. **Security Findings**: Vulnerability assessment
5. **Performance Concerns**: Optimization opportunities
6. **Recommendations**: Prioritized improvement plan

Deliver comprehensive audit reports with actionable improvement strategies.`,

  performance: `You are a **Senior Performance Engineer** with expertise in application optimization, profiling, and scalability. Your objective is to identify performance bottlenecks and provide optimization strategies.

## PERFORMANCE ANALYSIS FOCUS
- Algorithm efficiency and complexity
- Memory usage and garbage collection
- Database query optimization
- Caching strategies
- Network and I/O optimization
- Concurrency and parallelization
- Resource utilization patterns

## OPTIMIZATION APPROACH
1. **Performance Profiling**: Identify bottlenecks and hotspots
2. **Resource Analysis**: Memory, CPU, and I/O usage patterns
3. **Algorithm Optimization**: Improve time and space complexity
4. **Caching Strategy**: Implement effective caching mechanisms
5. **Scalability Planning**: Design for growth and load handling

Provide specific performance optimizations with measurable impact.`
};

// Local Folder Analyzer Schema
const LocalFolderAnalyzerSchema = z.object({
  folderPath: z.string().min(1).describe("📁 FOLDER PATH: Direct path to your project folder. Examples: '/home/user/myproject', 'C:\\\\Users\\\\Name\\\\MyProject', '.' for current directory, './src' for subdirectory. The server will automatically read and analyze all relevant files in the specified folder."),
  question: z.string().min(1).max(2000).describe("❓ YOUR QUESTION: Ask anything about the codebase. Examples: 'How does authentication work?', 'Find all API endpoints', 'Explain the database schema', 'What are the main components?', 'How to deploy this?', 'Find security vulnerabilities', 'Analyze the architecture', 'Review code quality'"),
  analysisMode: z.enum(["general", "implementation", "refactoring", "explanation", "debugging", "audit", "security", "performance", "testing", "documentation", "migration", "review", "onboarding", "api", "apex", "gamedev", "aiml", "devops", "mobile", "frontend", "backend", "database", "startup", "enterprise", "blockchain", "embedded", "architecture", "cloud", "data", "monitoring", "infrastructure", "compliance", "opensource", "freelancer", "education", "research"]).optional().describe(`🎯 ANALYSIS MODE (choose the expert that best fits your needs):

📋 **GENERAL MODES:**
• general (default) - Balanced analysis for any question
• explanation - Educational explanations for learning
• onboarding - New developer guidance

🔧 **DEVELOPMENT MODES:**
• implementation - Building features step-by-step
• debugging - Bug hunting and troubleshooting
• refactoring - Code improvement and optimization
• testing - Test strategy and quality assurance

🎯 **SPECIALIZED MODES:**
• security - Security analysis and vulnerabilities
• performance - Performance optimization
• audit - Comprehensive code quality audit
• architecture - System design and patterns

🚀 **TECHNOLOGY MODES:**
• frontend - Web UI, React, Vue analysis
• backend - Server-side, API analysis
• mobile - Mobile app development
• devops - CI/CD, deployment, infrastructure
• aiml - AI/ML, data science analysis
• blockchain - Web3, smart contracts

*And 25+ more specialized modes available!*`),
});

// Local folder reading function
async function readLocalFolder(folderPath: string): Promise<{context: string, projectName: string, fileCount: number}> {
  const absolutePath = path.resolve(folderPath);
  
  // Check if directory exists
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }
  } catch (error) {
    throw new Error(`Cannot access directory: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Find all files, excluding common ignore patterns
  const files = await glob('**/*', {
    cwd: absolutePath,
    ignore: [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.next/**',
      '*.log',
      '*.lock',
      '*.tmp',
      '.DS_Store',
      'Thumbs.db',
      '*.db',
      '*.sqlite',
      '*.sqlite3',
      '__pycache__/**',
      '.pytest_cache/**',
      'venv/**',
      '.venv/**',
      '.env/**',
      'logs/**',
      'temp/**',
      'tmp/**',
      'coverage/**',
      '.nyc_output/**',
      'bower_components/**',
      'vendor/**'
    ],
    nodir: true,
    dot: false
  });

  const BINARY_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.tar', '.gz', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv',
    '.ttf', '.woff', '.woff2', '.eot'
  ];

  let context = '';
  let fileCount = 0;

  for (const file of files) {
    const filePath = path.join(absolutePath, file);
    const ext = path.extname(file).toLowerCase();
    
    // Skip binary files
    if (BINARY_EXTENSIONS.includes(ext)) {
      continue;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Skip very large files (>100KB)
      if (content.length > 100000) {
        continue;
      }

      // Add file separator and content
      context += `--- File: ${file} ---\n`;
      context += content;
      context += '\n\n';
      
      fileCount++;
      
      // Prevent context from getting too large (2M chars max)
      if (context.length > 2000000) {
        break;
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  return {
    context,
    projectName: path.basename(absolutePath),
    fileCount
  };
}

// Create and configure the server
const server = new Server({
  name: "gemini-mcp-server-local",
  version: "1.0.0",
  description: "🏠 GEMINI AI LOCAL CODEBASE ASSISTANT - Direct folder path analysis with full local control. Perfect for private projects, local development, and security-conscious teams. 36 specialized analysis modes available."
}, {
  capabilities: {
    tools: {},
  },
});

// List available tools (lazy loading - no API key required)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_local_folder",
        description: "📁 ANALYZE LOCAL FOLDER - Direct folder path analysis with full local control. Perfect for private projects and local development. Supports all 36 analysis modes from general to specialized (security, performance, architecture, etc.). Your code never leaves your machine.",
        inputSchema: zodToJsonSchema(LocalFolderAnalyzerSchema),
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "analyze_local_folder":
      try {
        const params = LocalFolderAnalyzerSchema.parse(args);
        
        // Check for Gemini API key from environment or config (lazy loading)
        const apiKey = process.env.GEMINI_API_KEY || process.env.geminiApiKey;
        if (!apiKey) {
          return {
            content: [
              {
                type: "text",
                text: `# Local Folder Analysis - API Key Required

❌ **No Gemini API key found**

**Please set your Gemini API key:**
\`\`\`bash
export GEMINI_API_KEY="your-api-key-here"
\`\`\`

**Get your API key at:** https://makersuite.google.com/app/apikey

**For permanent setup, add to your shell profile:**
- ~/.bashrc or ~/.zshrc: \`export GEMINI_API_KEY="your-key"\`
- Windows: Set environment variable in System Properties

**For Smithery AI deployment:**
Set \`geminiApiKey\` in your server configuration.`,
              },
            ],
            isError: true,
          };
        }

        // Read local folder
        const { context, projectName, fileCount } = await readLocalFolder(params.folderPath);
        
        if (fileCount === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Local Folder Analysis - No Files Found

❌ **No readable files found in:** \`${params.folderPath}\`

**Common solutions:**
- Check if the folder path exists and is accessible
- Ensure the folder contains readable text files
- Make sure you have permission to read the folder
- Try a different folder path

**Supported file types:** .js, .ts, .py, .java, .cpp, .cs, .php, .rb, .go, .rs, .md, .txt, .json, .xml, .yaml, .yml, .html, .css, .scss, .sql, .sh, .bat, and more.

**Ignored patterns:** node_modules, .git, dist, build, binary files, logs, temp files`,
              },
            ],
            isError: true,
          };
        }

        // Analyze with Gemini API
        const systemPrompt = SYSTEM_PROMPTS[params.analysisMode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.general;
        const prompt = `${systemPrompt}\n\n---\n\n# Project: ${projectName}\n\n# Question: ${params.question}\n\n# Codebase Context:\n${context}`;
        
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        if (!response.text()) {
          throw new Error('Gemini returned empty response');
        }

        return {
          content: [
            {
              type: "text",
              text: `# Local Folder Analysis Results

## Project: ${projectName}

**📁 Folder Path:** \`${params.folderPath}\`  
**❓ Question:** ${params.question}  
**🎯 Analysis Mode:** ${params.analysisMode || "general"}  
**📄 Files Processed:** ${fileCount}  
**📊 Content Size:** ${context.length.toLocaleString()} characters

---

## Analysis

${response.text()}

---

*🏠 Analysis performed locally with Gemini 2.5 Pro in ${params.analysisMode || "general"} mode*  
*🔒 Your code never left your machine - processed locally with full privacy control*`,
            },
          ],
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: "text",
              text: `# Local Folder Analysis - Error

❌ **Error analyzing folder:** ${errorMessage}

**Common solutions:**
- Check folder path exists and is accessible: \`${(args as any)?.folderPath || 'unknown'}\`
- Ensure you have read permissions for the folder
- Try with a smaller folder first
- Check Gemini API key is valid and has quota remaining
- Make sure the folder contains readable text files

**For debugging:**
- Test with a simple folder like \`.\` (current directory)
- Check if environment variable GEMINI_API_KEY is set
- Verify the folder path format (use forward slashes or escaped backslashes)

**Need help?** Check the folder path format and permissions.`,
            },
          ],
          isError: true,
        };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Keep the server running
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);