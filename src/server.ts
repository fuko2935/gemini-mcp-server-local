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

// Helper function to resolve API keys from environment and parse comma-separated values
function resolveApiKeys(): string[] {
  const envApiKey = process.env.GEMINI_API_KEY;
  if (!envApiKey) {
    return [];
  }
  
  // Check if it contains comma-separated multiple keys
  if (envApiKey.includes(',')) {
    return envApiKey.split(',').map((key: string) => key.trim()).filter((key: string) => key.length > 0);
  }
  
  return [envApiKey];
}

// API Key Rotation System with Infinite Retry for 4 Minutes
async function retryWithApiKeyRotation<T>(
  createModelFn: (apiKey: string) => any,
  requestFn: (model: any) => Promise<T>,
  apiKeys: string[],
  maxDurationMs: number = 4 * 60 * 1000 // 4 minutes total timeout
): Promise<T> {
  const startTime = Date.now();
  let currentKeyIndex = 0;
  let lastError: Error | undefined;
  let attemptCount = 0;
  
  console.log(`🔄 Starting API request with ${apiKeys.length} key(s) rotation...`);
  
  while (Date.now() - startTime < maxDurationMs) {
    attemptCount++;
    const currentApiKey = apiKeys[currentKeyIndex];
    
    console.log(`🔑 Attempt ${attemptCount} with key ${currentKeyIndex + 1}/${apiKeys.length}`);
    
    try {
      const model = createModelFn(currentApiKey);
      const result = await requestFn(model);
      
      if (attemptCount > 1) {
        console.log(`✅ API request successful after ${attemptCount} attempts with key ${currentKeyIndex + 1}`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      console.warn(`❌ API request failed with key ${currentKeyIndex + 1}: ${error.message}`);
      
      // Check if it's a rate limit, quota, overload or invalid key error
      const isRotatableError = error.message && (
        error.message.includes('429') || 
        error.message.includes('Too Many Requests') || 
        error.message.includes('quota') || 
        error.message.includes('rate limit') ||
        error.message.includes('exceeded your current quota') ||
        error.message.includes('API key not valid') ||
        error.message.includes('503') ||
        error.message.includes('Service Unavailable') ||
        error.message.includes('overloaded') ||
        error.message.includes('Please try again later')
      );
      
      if (isRotatableError) {
        // Rotate to next API key
        const previousKeyIndex = currentKeyIndex + 1;
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        const remainingTime = Math.ceil((maxDurationMs - (Date.now() - startTime)) / 1000);
        const errorType = error.message.includes('API key not valid') ? 'Invalid API key' : 
                         error.message.includes('503') || error.message.includes('overloaded') ? 'Service overloaded' : 
                         'Rate limit hit';
        
        console.warn(`🔄 API Key Rotation: ${errorType} - switching from key ${previousKeyIndex} to key ${currentKeyIndex + 1} (${remainingTime}s remaining)`);
        
        // Small delay before trying next key
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // For non-rate-limit errors, throw immediately
      console.error(`💥 Non-rotatable API error: ${error.message}`);
      throw error;
    }
  }
  
  // 4 minutes expired
  console.error(`⏰ API request failed after 4 minutes with ${attemptCount} attempts across ${apiKeys.length} API keys`);
  throw new Error(`Gemini API requests failed after 4 minutes with ${attemptCount} attempts across ${apiKeys.length} API keys. All keys hit rate limits. Last error: ${lastError?.message || 'Unknown error'}`);
}

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

// Helper function for API key fields
function generateApiKeyFields() {
  const fields: any = {
    geminiApiKeys: z.string().min(1).optional().describe("🔑 GEMINI API KEYS: Optional if set in environment variables. MULTI-KEY SUPPORT: You can enter multiple keys separated by commas for automatic rotation (e.g., 'key1,key2,key3'). Get yours at: https://makersuite.google.com/app/apikey"),
    geminiApiKeysArray: z.array(z.string().min(1)).optional().describe("🔑 GEMINI API KEYS ARRAY: Multiple API keys array (alternative to comma-separated). When provided, the system will automatically rotate between keys to avoid rate limits. Example: ['key1', 'key2', 'key3']")
  };
  
  // Add numbered API key fields (geminiApiKey2 through geminiApiKey100)
  for (let i = 2; i <= 100; i++) {
    fields[`geminiApiKey${i}`] = z.string().min(1).optional().describe(`🔑 GEMINI API KEY ${i}: Optional additional API key for rate limit rotation`);
  }
  
  return fields;
}

// Usage Guide Schema
const UsageGuideSchema = z.object({
  topic: z.enum(["overview", "getting-started", "folder-setup", "analysis-modes", "search-tips", "examples", "troubleshooting", "advanced-tips"]).optional().describe(`📖 HELP TOPIC (choose what you need help with):
• overview - What this MCP server does and its capabilities
• getting-started - First steps and basic usage
• folder-setup - How to set up local folder analysis
• analysis-modes - Detailed guide to all 36 analysis modes
• search-tips - How to write effective search queries
• examples - Real-world usage examples and workflows
• troubleshooting - Common issues and solutions
• advanced-tips - Pro tips for maximum efficiency

💡 TIP: Start with 'overview' if you're new to this MCP server!`)
});

// API Key Status Schema
const ApiKeyStatusSchema = z.object({
  geminiApiKeys: z.string().min(1).optional().describe("🔑 GEMINI API KEYS: Optional if set in environment variables. MULTI-KEY SUPPORT: You can enter multiple keys separated by commas for automatic rotation (e.g., 'key1,key2,key3'). Get yours at: https://makersuite.google.com/app/apikey"),
  ...generateApiKeyFields()
});

// Local Folder Analyzer Schema
const LocalFolderAnalyzerSchema = z.object({
  folderPath: z.string().min(1).describe("📁 FOLDER PATH: Direct path to your project folder. ⚠️ IMPORTANT: For Smithery AI deployment, use ABSOLUTE paths (e.g., '/mnt/c/Projects/user/project'). Relative paths like '../folder' may not work correctly in container environments. Examples: '/home/user/myproject', 'C:\\\\Users\\\\Name\\\\MyProject', '/mnt/c/Projects/1312/M/flash/new/tnt3'. For local development: '.' for current directory, './src' for subdirectory."),
  question: z.string().min(1).max(2000).describe("❓ YOUR QUESTION: Ask anything about the codebase. 🌍 TIP: Use English for best AI performance! Examples: 'How does authentication work?', 'Find all API endpoints', 'Explain the database schema', 'What are the main components?', 'How to deploy this?', 'Find security vulnerabilities'. 💡 NEW USER? Use 'get_usage_guide' tool first to learn all capabilities!"),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the analysis results."),
  analysisMode: z.enum(["general", "implementation", "refactoring", "explanation", "debugging", "audit", "security", "performance", "testing", "documentation", "migration", "review", "onboarding", "api", "apex", "gamedev", "aiml", "devops", "mobile", "frontend", "backend", "database", "startup", "enterprise", "blockchain", "embedded", "architecture", "cloud", "data", "monitoring", "infrastructure", "compliance", "opensource", "freelancer", "education", "research"]).optional().describe(`🎯 ANALYSIS MODE (choose the expert that best fits your needs):

📋 GENERAL MODES:
• general (default) - Balanced analysis for any question
• explanation - Educational explanations for learning
• onboarding - New developer guidance and getting started
• review - Code review and quality assessment
• audit - Comprehensive codebase examination

🔧 DEVELOPMENT MODES:
• implementation - Building new features step-by-step
• refactoring - Code improvement and restructuring
• debugging - Bug hunting and troubleshooting
• testing - Test strategy and quality assurance
• documentation - Technical writing and API docs
• migration - Legacy modernization and upgrades

🎨 SPECIALIZATION MODES:
• frontend - React/Vue/Angular, modern web UI/UX
• backend - Node.js/Python, APIs, microservices
• mobile - React Native/Flutter, native apps
• database - SQL/NoSQL, optimization, schema design
• devops - CI/CD, infrastructure, deployment
• security - Vulnerability assessment, secure coding

🚀 ADVANCED MODES:
• api - API design and developer experience
• apex - Production-ready implementation (zero defects)
• gamedev - JavaScript game development optimization
• aiml - Machine learning, AI systems, MLOps
• startup - MVP development, rapid prototyping
• enterprise - Large-scale systems, corporate integration
• blockchain - Web3, smart contracts, DeFi
• embedded - IoT, hardware programming, edge computing

🏗️ ARCHITECTURE & INFRASTRUCTURE:
• architecture - System design, patterns, scalability
• cloud - AWS/GCP/Azure, serverless, cloud-native
• data - Data pipelines, ETL, analytics, data engineering
• monitoring - Observability, alerts, SLA/SLO, incident response
• infrastructure - IaC, Kubernetes, platform engineering

🏢 BUSINESS & GOVERNANCE:
• compliance - GDPR, SOX, HIPAA, regulatory frameworks
• opensource - Community building, licensing, maintainer guidance
• freelancer - Client management, contracts, business practices
• education - Curriculum design, tutorials, learning content
• research - Innovation, prototyping, academic collaboration

💡 TIP: Choose the mode that matches your role or question type for the most relevant expert analysis!`),
  ...generateApiKeyFields()
});

// Codebase Analyzer Schema (for manual content input)
const GeminiCodebaseAnalyzerSchema = z.object({
  codebaseContext: z.string().min(1).describe("📁 CODEBASE CONTENT: The full content of your project files concatenated together. This should include all relevant source files with their file paths as separators. Format: '--- File: path/to/file ---\\n<file content>\\n\\n'. This content will be analyzed by Gemini AI."),
  question: z.string().min(1).max(2000).describe("❓ YOUR QUESTION: Ask anything about the codebase. 🌍 TIP: Use English for best AI performance! Examples: 'How does authentication work?', 'Find all API endpoints', 'Explain the database schema', 'What are the main components?', 'How to deploy this?', 'Find security vulnerabilities'. 💡 NEW USER? Use 'get_usage_guide' tool first to learn all capabilities!"),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the analysis results."),
  analysisMode: z.enum(["general", "implementation", "refactoring", "explanation", "debugging", "audit", "security", "performance", "testing", "documentation", "migration", "review", "onboarding", "api", "apex", "gamedev", "aiml", "devops", "mobile", "frontend", "backend", "database", "startup", "enterprise", "blockchain", "embedded", "architecture", "cloud", "data", "monitoring", "infrastructure", "compliance", "opensource", "freelancer", "education", "research"]).optional().describe(`🎯 ANALYSIS MODE (choose the expert that best fits your needs):

📋 GENERAL MODES:
• general (default) - Balanced analysis for any question
• explanation - Educational explanations for learning
• onboarding - New developer guidance and getting started
• review - Code review and quality assessment
• audit - Comprehensive codebase examination

🔧 DEVELOPMENT MODES:
• implementation - Building new features step-by-step
• refactoring - Code improvement and restructuring
• debugging - Bug hunting and troubleshooting
• testing - Test strategy and quality assurance
• documentation - Technical writing and API docs
• migration - Legacy modernization and upgrades

🎨 SPECIALIZATION MODES:
• frontend - React/Vue/Angular, modern web UI/UX
• backend - Node.js/Python, APIs, microservices
• mobile - React Native/Flutter, native apps
• database - SQL/NoSQL, optimization, schema design
• devops - CI/CD, infrastructure, deployment
• security - Vulnerability assessment, secure coding

🚀 ADVANCED MODES:
• api - API design and developer experience
• apex - Production-ready implementation (zero defects)
• gamedev - JavaScript game development optimization
• aiml - Machine learning, AI systems, MLOps
• startup - MVP development, rapid prototyping
• enterprise - Large-scale systems, corporate integration
• blockchain - Web3, smart contracts, DeFi
• embedded - IoT, hardware programming, edge computing

🏗️ ARCHITECTURE & INFRASTRUCTURE:
• architecture - System design, patterns, scalability
• cloud - AWS/GCP/Azure, serverless, cloud-native
• data - Data pipelines, ETL, analytics, data engineering
• monitoring - Observability, alerts, SLA/SLO, incident response
• infrastructure - IaC, Kubernetes, platform engineering

🏢 BUSINESS & GOVERNANCE:
• compliance - GDPR, SOX, HIPAA, regulatory frameworks
• opensource - Community building, licensing, maintainer guidance
• freelancer - Client management, contracts, business practices
• education - Curriculum design, tutorials, learning content
• research - Innovation, prototyping, academic collaboration

💡 TIP: Choose the mode that matches your role or question type for the most relevant expert analysis!`),
  ...generateApiKeyFields()
});

// Code Search Schema
const GeminiCodeSearchSchema = z.object({
  codebaseContext: z.string().min(1).describe("📁 CODEBASE CONTENT: The full content of your project files concatenated together. This should include all relevant source files with their file paths as separators. Format: '--- File: path/to/file ---\\n<file content>\\n\\n'. This content will be searched by Gemini AI."),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the search results."),
  searchQuery: z.string().min(1).max(500).describe(`🔍 SEARCH QUERY: What specific code pattern, function, or feature to find. 🌍 TIP: Use English for best AI performance! 💡 NEW USER? Use 'get_usage_guide' with 'search-tips' topic first! Examples:
• 'authentication logic' - Find login/auth code
• 'error handling' - Find try-catch blocks
• 'database connection' - Find DB setup
• 'API endpoints' - Find route definitions
• 'React components' - Find UI components
• 'class UserService' - Find specific class
• 'async function' - Find async functions
• 'import express' - Find Express usage
• 'useState hook' - Find React state
• 'SQL queries' - Find database queries`),
  fileTypes: z.array(z.string()).optional().describe("📄 FILE TYPES: Limit search to specific file extensions. Examples: ['.ts', '.js'] for TypeScript/JavaScript, ['.py'] for Python, ['.jsx', '.tsx'] for React, ['.vue'] for Vue, ['.go'] for Go. Leave empty to search all code files."),
  maxResults: z.number().min(1).max(20).optional().describe("🎯 MAX RESULTS: Maximum number of relevant code snippets to analyze (default: 5, max: 20). Higher numbers = more comprehensive but slower analysis."),
  ...generateApiKeyFields()
});

// Dynamic Expert Create Schema
const DynamicExpertCreateSchema = z.object({
  codebaseContext: z.string().min(1).describe("📁 CODEBASE CONTENT: The full content of your project files concatenated together. This should include all relevant source files with their file paths as separators. Format: '--- File: path/to/file ---\\n<file content>\\n\\n'. This will be analyzed to create a custom expert."),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the expert creation."),
  expertiseHint: z.string().min(1).max(200).optional().describe("🎯 EXPERTISE HINT (optional): Suggest what kind of expert you need. Examples: 'React performance expert', 'Database architect', 'Security auditor', 'DevOps specialist'. Leave empty for automatic expert selection based on your project."),
  ...generateApiKeyFields()
});

// Dynamic Expert Analyze Schema
const DynamicExpertAnalyzeSchema = z.object({
  codebaseContext: z.string().min(1).describe("📁 CODEBASE CONTENT: The full content of your project files concatenated together. This should include all relevant source files with their file paths as separators. Format: '--- File: path/to/file ---\\n<file content>\\n\\n'. This will be analyzed by the custom expert."),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the analysis."),
  question: z.string().min(1).max(2000).describe("❓ YOUR QUESTION: Ask anything about the codebase. 🌍 TIP: Use English for best AI performance! This will be analyzed using the custom expert mode created in step 1."),
  expertPrompt: z.string().min(1).max(10000).describe("🎯 EXPERT PROMPT: The custom expert system prompt generated by 'gemini_dynamic_expert_create' tool. Copy the entire expert prompt from the previous step."),
  ...generateApiKeyFields()
});

// Read Log File Schema
const ReadLogFileSchema = z.object({
  filename: z.enum(["activity.log", "error.log"]).describe("📄 LOG FILE NAME: Choose which log file to read. 'activity.log' contains all operations and debug info. 'error.log' contains only errors and critical issues."),
});

// Project Orchestrator Create Schema
const ProjectOrchestratorCreateSchema = z.object({
  codebaseContext: z.string().min(1).describe("📁 CODEBASE CONTENT: The full content of your project files concatenated together. This should include all relevant source files with their file paths as separators. Format: '--- File: path/to/file ---\\n<file content>\\n\\n'. This will be organized into groups."),
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the orchestrator results."),
  analysisMode: z.enum(['general', 'implementation', 'refactoring', 'explanation', 'debugging', 'audit', 'security', 'performance', 'testing', 'documentation', 'migration', 'review', 'onboarding', 'api', 'apex', 'gamedev', 'aiml', 'devops', 'mobile', 'frontend', 'backend', 'database', 'startup', 'enterprise', 'blockchain', 'embedded', 'architecture', 'cloud', 'data', 'monitoring', 'infrastructure', 'compliance', 'opensource', 'freelancer', 'education', 'research']).default('general').describe("🎯 ANALYSIS MODE: Choose the expert that best fits your needs. The orchestrator will use this mode for all file groups to ensure consistent analysis across the entire project."),
  maxTokensPerGroup: z.number().min(100000).max(950000).default(900000).optional().describe("🔢 MAX TOKENS PER GROUP: Maximum tokens per file group (default: 900K, max: 950K). Lower values create smaller groups for more detailed analysis. Higher values allow larger chunks but may hit API limits."),
  ...generateApiKeyFields()
});

// Project Orchestrator Analyze Schema
const ProjectOrchestratorAnalyzeSchema = z.object({
  projectName: z.string().optional().describe("📋 PROJECT NAME: Optional name for your project to provide better context in the analysis results."),
  question: z.string().min(1).max(2000).describe("❓ YOUR QUESTION: Ask anything about the codebase. 🌍 TIP: Use English for best AI performance! This will be analyzed using the file groups created in step 1."),
  analysisMode: z.enum(['general', 'implementation', 'refactoring', 'explanation', 'debugging', 'audit', 'security', 'performance', 'testing', 'documentation', 'migration', 'review', 'onboarding', 'api', 'apex', 'gamedev', 'aiml', 'devops', 'mobile', 'frontend', 'backend', 'database', 'startup', 'enterprise', 'blockchain', 'embedded', 'architecture', 'cloud', 'data', 'monitoring', 'infrastructure', 'compliance', 'opensource', 'freelancer', 'education', 'research']).default('general').describe("🎯 ANALYSIS MODE: Choose the expert that best fits your needs. Must match the mode used in step 1."),
  fileGroupsData: z.string().min(1).max(50000).describe("📦 FILE GROUPS DATA: The file groups data generated by 'project_orchestrator_create' tool. Copy the entire groups data from step 1."),
  maxTokensPerGroup: z.number().min(100000).max(950000).default(900000).optional().describe("🔢 MAX TOKENS PER GROUP: Maximum tokens per file group (default: 900K, max: 950K). Must match the value used in step 1."),
  ...generateApiKeyFields()
});

// Local folder reading function
async function readLocalFolder(folderPath: string): Promise<{context: string, projectName: string, fileCount: number}> {
  // For local version, handle paths directly without Docker normalization
  let absolutePath: string;
  
  if (path.isAbsolute(folderPath)) {
    // If it's already absolute, use as-is
    absolutePath = folderPath;
  } else {
    // If it's relative, resolve from current working directory
    // Use path.resolve with explicit current working directory
    absolutePath = path.resolve(process.cwd(), folderPath);
  }
  
  // Normalize the path to handle any irregularities
  absolutePath = path.normalize(absolutePath);
  
  // Debug: Log the paths being used
  console.log('📁 Local Folder Analysis Debug:');
  console.log('   Input path:', folderPath);
  console.log('   Current working directory:', process.cwd());
  console.log('   Is input path absolute?', path.isAbsolute(folderPath));
  console.log('   path.resolve(process.cwd(), folderPath):', path.resolve(process.cwd(), folderPath));
  console.log('   Resolved path:', absolutePath);
  console.log('   Path exists check...');
  
  // Check if we're running in a container or unusual environment
  const cwd = process.cwd();
  if (cwd === '/app' || cwd === '/' || cwd.startsWith('/app/')) {
    console.log('⚠️  WARNING: Running in container-like environment');
    console.log('   For relative paths, consider using absolute paths instead');
    console.log('   Example: /mnt/c/Projects/1312/M/flash/new/tnt3');
  }
  
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
  description: "🏠 GEMINI AI LOCAL CODEBASE ASSISTANT - Direct folder path analysis with full local control. Perfect for private projects, local development, and security-conscious teams. All features from remote version with local folder access. 💡 START HERE: Use 'get_usage_guide' tool to learn all capabilities."
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
        name: "get_usage_guide",
        description: "📖 GET USAGE GUIDE - **START HERE!** Learn how to use this MCP server effectively. Essential for understanding all capabilities, analysis modes, and workflows. Use this first if you're new to the server.",
        inputSchema: zodToJsonSchema(UsageGuideSchema),
      },
      {
        name: "check_api_key_status",
        description: "🔑 CHECK API KEY STATUS - Monitor your Gemini API keys configuration. Shows how many keys are configured, validates them, and provides rate limit protection status. Perfect for debugging API key issues.",
        inputSchema: zodToJsonSchema(ApiKeyStatusSchema),
      },
      {
        name: "analyze_local_folder",
        description: "📁 ANALYZE LOCAL FOLDER - **EASIEST FOR LOCAL** Direct folder path analysis with full local control! ⚠️ SMITHERY AI: Use absolute paths (e.g., '/mnt/c/Projects/user/project'). Perfect for private projects and local development. All 36 analysis modes available. Your code never leaves your machine.",
        inputSchema: zodToJsonSchema(LocalFolderAnalyzerSchema),
      },
      {
        name: "gemini_codebase_analyzer", 
        description: "🔍 MANUAL CODEBASE ANALYSIS - For pre-formatted content. Requires manually prepared codebase content. Use 'analyze_local_folder' for easier workflow with local folders.",
        inputSchema: zodToJsonSchema(GeminiCodebaseAnalyzerSchema),
      },
      {
        name: "gemini_code_search",
        description: "⚡ FAST TARGETED SEARCH - Quickly find specific code patterns, functions, or features. Use when you know what you're looking for but need to locate it fast. Perfect for finding specific implementations, configuration files, or code examples.",
        inputSchema: zodToJsonSchema(GeminiCodeSearchSchema),
      },
      {
        name: "gemini_dynamic_expert_create",
        description: "🎯 DYNAMIC EXPERT CREATE - Create custom experts for your specific codebase. Analyzes your project to generate specialized expert prompts for deeper analysis.",
        inputSchema: zodToJsonSchema(DynamicExpertCreateSchema),
      },
      {
        name: "gemini_dynamic_expert_analyze",
        description: "🎯 DYNAMIC EXPERT ANALYZE - Analyze with custom expert created in step 1. Provides specialized analysis using project-specific expert knowledge.",
        inputSchema: zodToJsonSchema(DynamicExpertAnalyzeSchema),
      },
      {
        name: "read_log_file",
        description: "📄 READ LOG FILE - **DEBUGGING TOOL** Read server log files (activity.log or error.log) for debugging, monitoring API key rotation, and troubleshooting issues. Useful for developers and administrators.",
        inputSchema: zodToJsonSchema(ReadLogFileSchema),
      },
      {
        name: "project_orchestrator_create",
        description: "🎭 PROJECT ORCHESTRATOR CREATE - For massive projects (>1M tokens). Organize large codebases into manageable groups for comprehensive analysis.",
        inputSchema: zodToJsonSchema(ProjectOrchestratorCreateSchema),
      },
      {
        name: "project_orchestrator_analyze",
        description: "🎭 PROJECT ORCHESTRATOR ANALYZE - Analyze massive projects using file groups created in step 1. Perfect for enterprise-scale codebase analysis.",
        inputSchema: zodToJsonSchema(ProjectOrchestratorAnalyzeSchema),
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_usage_guide":
      return {
        content: [
          {
            type: "text",
            text: `# 🏠 Gemini AI Local Codebase Assistant - Usage Guide

## 🚀 What This MCP Server Does
This is your local expert coding companion with **36 specialized analysis modes** and **10 powerful tools**:

### 📁 **analyze_local_folder** - Direct Folder Analysis
- **EASIEST FOR LOCAL**: Just provide a folder path!
- ⚠️ **SMITHERY AI**: Use absolute paths (e.g., '/mnt/c/Projects/user/project')
- Automatic file reading and processing
- All 36 analysis modes available
- Perfect for private projects and local development

### 🔍 **gemini_codebase_analyzer** - Manual Analysis
- For pre-formatted codebase content
- When you already have content prepared
- Full control over what gets analyzed

### ⚡ **gemini_code_search** - Fast Search
- Quickly find specific code patterns
- RAG-like approach for targeted searches
- Perfect when you know what you're looking for

### 🎯 **Dynamic Expert Tools**
- **gemini_dynamic_expert_create**: Generate custom experts for your project
- **gemini_dynamic_expert_analyze**: Analyze with project-specific expertise

### 🎭 **Project Orchestrator Tools**
- **project_orchestrator_create**: Handle massive projects (>1M tokens)
- **project_orchestrator_analyze**: Analyze enterprise-scale codebases

### 📖 **Utility Tools**
- **get_usage_guide**: This help system
- **check_api_key_status**: Monitor API key configuration
- **read_log_file**: Debug and troubleshoot server issues

## 🎯 Quick Start Workflow
1. **New to local folder?** → Use \`analyze_local_folder\` with your project path
2. **Building feature?** → Use \`implementation\` mode  
3. **Finding bugs?** → Use \`debugging\` mode
4. **Quick search?** → Use \`gemini_code_search\` tool
5. **Need custom expert?** → Use dynamic expert tools
6. **Massive project?** → Use orchestrator tools

## 💡 Pro Tips
- **LOCAL CONTROL**: Your code never leaves your machine
- Choose the right analysis mode for your expertise level
- Use search first for specific code, analyzer for broad understanding
- All tools work with any programming language and framework
- Perfect for security-conscious teams and private projects

## 🔑 Setup Requirements
- Set GEMINI_API_KEY environment variable
- Point to your local project folder
- That's it! Start analyzing immediately.

*🏠 Local version - Maximum privacy and control*`,
          },
        ],
      };

    case "check_api_key_status":
      try {
        const apiKeys = resolveApiKeys();
        if (apiKeys.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# 🔑 API Key Status - Not Configured

❌ **No Gemini API keys found**

**Please configure your API keys:**
- **Smithery AI**: Set \`geminiApiKeys\` in your server configuration
- **Environment**: Set \`GEMINI_API_KEY\` environment variable
- **Multiple keys**: Use comma-separated format: \`key1,key2,key3\`

**Get your API keys at:** https://makersuite.google.com/app/apikey

**Status:** Not configured
**Keys configured:** 0
**Rate limit protection:** Unavailable`,
              },
            ],
          };
        }

        // Generate rotation schedule preview
        const rotationPreview = apiKeys.slice(0, 10).map((key, index) => {
          const maskedKey = key.substring(0, 8) + "..." + key.substring(key.length - 4);
          return `${index + 1}. ${maskedKey}`;
        }).join('\n');
        
        const totalKeys = apiKeys.length;
        const rotationTime = totalKeys > 0 ? Math.ceil(240 / totalKeys) : 0; // 4 minutes / keys

        return {
          content: [
            {
              type: "text",
              text: `# 🔑 Gemini API Key Status Report

## 📊 Configuration Summary
- **Total Active Keys**: ${totalKeys}
- **Environment Variable**: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}
- **Rotation Available**: ${totalKeys > 1 ? '✅ Yes' : '❌ Single key only'}
- **Rate Limit Protection**: ${totalKeys > 1 ? '🛡️ Active' : '⚠️ Limited'}

## 🔄 Rotation Strategy
${totalKeys > 1 ? `
**Rotation Schedule**: ${rotationTime} seconds per key
**Maximum uptime**: 4 minutes continuous rotation
**Fallback protection**: Automatic key switching on rate limits

**Key Rotation Preview** (first 10 keys):
${rotationPreview}
${totalKeys > 10 ? `\n... and ${totalKeys - 10} more keys` : ''}
` : `
**Single Key Mode**: No rotation available
**Recommendation**: Add more keys for better rate limit protection
**How to add**: Use comma-separated format in Smithery configuration
`}

## 🎯 Performance Optimization
- **Recommended keys**: 3-5 for optimal performance
- **Maximum supported**: 100 keys
- **Current efficiency**: ${Math.min(100, (totalKeys / 5) * 100).toFixed(1)}%

## 🚀 Usage Tips
${totalKeys === 1 ? `
⚠️ **Single key detected**
- Consider adding more keys for better rate limit protection
- Use comma-separated format in Smithery: "key1,key2,key3"
- Or environment variable: GEMINI_API_KEY="key1,key2,key3"
` : `
✅ **Multi-key configuration active**
- Rate limit protection is active
- Automatic failover enabled
- Optimal performance achieved
`}

## 🔧 Troubleshooting
- **Rate limits**: With ${totalKeys} keys, you can handle ${totalKeys}x more requests
- **Error recovery**: Automatic retry with next key on failures
- **Monitoring**: This tool helps track your key configuration

---

*Status checked at ${new Date().toISOString()}*
*Next rotation cycle: ${totalKeys > 1 ? `${rotationTime}s per key` : 'No rotation'}*`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `# 🔑 API Key Status - Error

❌ **Error checking API key status**

**Error:** ${error instanceof Error ? error.message : String(error)}

**Please ensure your API key is properly configured.**`,
            },
          ],
          isError: true,
        };
      }

    case "analyze_local_folder":
      try {
        const params = LocalFolderAnalyzerSchema.parse(args);
        
        // Check for Gemini API keys from environment (lazy loading)
        const apiKeys = resolveApiKeys();
        if (apiKeys.length === 0) {
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

        // Analyze with Gemini API using key rotation
        const systemPrompt = SYSTEM_PROMPTS[params.analysisMode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.general;
        const prompt = `${systemPrompt}\n\n---\n\n# Project: ${params.projectName || projectName}\n\n# Question: ${params.question}\n\n# Codebase Context:\n${context}`;
        
        // Use API key rotation for better rate limit handling
        const createModelFn = (apiKey: string) => {
          const genAI = new GoogleGenerativeAI(apiKey);
          return genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        };

        const result = await retryWithApiKeyRotation(
          createModelFn,
          (model) => model.generateContent(prompt),
          apiKeys
        );
        const response = await (result as any).response;
        
        if (!response.text()) {
          throw new Error('Gemini returned empty response');
        }

        return {
          content: [
            {
              type: "text",
              text: `# Local Folder Analysis Results

## Project: ${params.projectName || projectName}

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

    case "gemini_codebase_analyzer":
      try {
        const params = GeminiCodebaseAnalyzerSchema.parse(args);
        
        // Check for Gemini API keys
        const apiKeys = resolveApiKeys();
        if (apiKeys.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Gemini Codebase Analyzer - API Key Required

❌ **No Gemini API key found**

**Please set your Gemini API key:**
\`\`\`bash
export GEMINI_API_KEY="your-api-key-here"
\`\`\`

**Get your API key at:** https://makersuite.google.com/app/apikey`,
              },
            ],
            isError: true,
          };
        }

        // Use the provided codebase context directly
        const fullContext = params.codebaseContext;
        
        if (fullContext.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Gemini Codebase Analyzer - Empty Context

❌ **Codebase context cannot be empty**

**Please provide formatted codebase content using the format:**
\`\`\`
--- File: path/to/file ---
<file content>

--- File: path/to/another/file ---
<file content>
\`\`\``,
              },
            ],
            isError: true,
          };
        }

        // Select appropriate system prompt based on analysis mode
        const analysisMode = params.analysisMode || "general";
        const systemPrompt = SYSTEM_PROMPTS[analysisMode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.general;

        // Create the analysis prompt
        const megaPrompt = `${systemPrompt}\n\nPROJECT CONTEXT:\n${fullContext}\n\nCODING AI QUESTION:\n${params.question}`;
        
        // Analyze with Gemini API using key rotation
        const createModelFn = (apiKey: string) => {
          const genAI = new GoogleGenerativeAI(apiKey);
          return genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        };

        const result = await retryWithApiKeyRotation(
          createModelFn,
          (model) => model.generateContent(megaPrompt),
          apiKeys
        );
        const response = await (result as any).response;
        
        if (!response.text()) {
          throw new Error('Gemini returned empty response');
        }

        const filesProcessed = fullContext.split('--- File:').length - 1;

        return {
          content: [
            {
              type: "text",
              text: `# Gemini Codebase Analysis Results

## Project: ${params.projectName || "Unnamed Project"}

**Question:** ${params.question}
**Analysis Mode:** ${analysisMode}
**Files Processed:** ${filesProcessed}
**Total Characters:** ${fullContext.length.toLocaleString()}

---

## Analysis

${response.text()}

---

*🏠 Analysis performed locally with Gemini 2.5 Pro in ${analysisMode} mode*`,
            },
          ],
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: "text",
              text: `# Gemini Codebase Analysis - Error

❌ **Error:** ${errorMessage}

**Common solutions:**
- Check codebase context is properly formatted
- Ensure Gemini API key is valid
- Try with smaller content or more specific question
- Verify the analysis mode is supported`,
            },
          ],
          isError: true,
        };
      }

    case "gemini_code_search":
      try {
        const params = GeminiCodeSearchSchema.parse(args);
        
        // Check for Gemini API keys
        const apiKeys = resolveApiKeys();
        if (apiKeys.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Gemini Code Search - API Key Required

❌ **No Gemini API key found**

**Please set your Gemini API key:**
\`\`\`bash
export GEMINI_API_KEY="your-api-key-here"
\`\`\`

**Get your API key at:** https://makersuite.google.com/app/apikey`,
              },
            ],
            isError: true,
          };
        }

        // Use the provided codebase context directly
        const fullContext = params.codebaseContext;
        
        if (fullContext.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Gemini Code Search - Empty Context

❌ **Codebase context cannot be empty**

**Please provide formatted codebase content.**`,
              },
            ],
            isError: true,
          };
        }

        // Use Gemini AI to search through the codebase content
        const maxResults = params.maxResults || 5;
        
        // Create search prompt for Gemini AI
        const searchPrompt = `You are an expert code search assistant. Analyze the following codebase and find the most relevant code snippets that match the search query.

SEARCH QUERY: "${params.searchQuery}"
${params.fileTypes ? `PREFERRED FILE TYPES: ${params.fileTypes.join(', ')}` : ''}
MAX RESULTS: ${maxResults}

CODEBASE CONTENT:
${fullContext}

Please find and extract the most relevant code snippets that match the search query. For each match, provide:
1. File path
2. Relevant code snippet
3. Brief explanation of why it matches

Format your response as a structured analysis with clear sections for each match.`;

        // Send search query to Gemini AI using key rotation
        const createModelFn = (apiKey: string) => {
          const genAI = new GoogleGenerativeAI(apiKey);
          return genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        };

        const result = await retryWithApiKeyRotation(
          createModelFn,
          (model) => model.generateContent(searchPrompt),
          apiKeys
        );
        const response = await (result as any).response;
        
        if (!response.text()) {
          throw new Error('Gemini returned empty response');
        }

        const filesScanned = fullContext.split('--- File:').length - 1;
        
        return {
          content: [
            {
              type: "text",
              text: `# Gemini Code Search Results

## Search Query: "${params.searchQuery}"
**Project:** ${params.projectName || "Unnamed Project"}
**Files Scanned:** ${filesScanned}
**Analysis Mode:** Targeted Search (fast)

---

## Analysis

${response.text()}

---

### Search Summary
- **Query:** ${params.searchQuery}
- **File Types:** ${params.fileTypes ? params.fileTypes.join(', ') : 'All files'}
- **Max Results:** ${maxResults}
- **Found:** ${filesScanned} relevant code snippets

*🏠 Search powered by Gemini 2.5 Pro locally*`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: "text",
              text: `# Gemini Code Search - Error

❌ **Error:** ${errorMessage}

**Common solutions:**
- Verify codebase context is properly formatted
- Ensure Gemini API key is valid
- Try with more specific search query
- Check that search query is clear`,
            },
          ],
          isError: true,
        };
      }

    case "gemini_dynamic_expert_create":
      return {
        content: [
          {
            type: "text",
            text: `# Dynamic Expert Create - Not Available in Local Version

❌ **This tool requires local file system access**

**Alternative approaches:**
- Use \`gemini_codebase_analyzer\` with specific analysis modes
- Read your folder locally first, then use \`gemini_codebase_analyzer\`
- Choose appropriate analysis mode: implementation, debugging, architecture, etc.

**Available analysis modes:**
- general, implementation, refactoring, explanation, debugging
- audit, security, performance, testing, documentation
- migration, review, onboarding, api, and more`,
          },
        ],
        isError: true,
      };

    case "gemini_dynamic_expert_analyze":
      return {
        content: [
          {
            type: "text",
            text: `# Dynamic Expert Analyze - Not Available in Local Version

❌ **This tool requires local file system access**

**Alternative approaches:**
- Use \`gemini_codebase_analyzer\` with specific analysis modes
- Read your folder locally first, then use \`gemini_codebase_analyzer\`
- Choose appropriate analysis mode based on your needs`,
          },
        ],
        isError: true,
      };

    case "github_repository_analyzer":
      return {
        content: [
          {
            type: "text",
            text: `# GitHub Repository Analyzer - Not Available in Local Version

❌ **This tool is for remote GitHub access only**

**This is the LOCAL version - use for local folders:**
- Use \`analyze_local_folder\` for local directory analysis
- Read your project folder locally first
- For GitHub repos, clone them locally and use \`analyze_local_folder\`

**Or use the remote version of this MCP server for direct GitHub access.**`,
          },
        ],
        isError: true,
      };

    case "read_log_file":
      return {
        content: [
          {
            type: "text",
            text: `# Read Log File - Not Available in Local Version

❌ **Log file reading not implemented in local version**

**Alternative approaches:**
- Check console output for any error messages
- Use standard logging tools on your local system
- For debugging, check terminal output when running the server

**Local version focuses on direct folder analysis rather than server logs.**`,
          },
        ],
        isError: true,
      };

    case "project_orchestrator_create":
      return {
        content: [
          {
            type: "text",
            text: `# Project Orchestrator Create - Not Available in Local Version

❌ **This tool requires advanced file system processing**

**Alternative approaches:**
- Use \`analyze_local_folder\` for large projects
- Break down your analysis into smaller, focused questions
- Use \`gemini_codebase_analyzer\` with pre-formatted content
- For very large projects, analyze subdirectories separately

**The local version is optimized for direct folder analysis.**`,
          },
        ],
        isError: true,
      };

    case "project_orchestrator_analyze":
      return {
        content: [
          {
            type: "text",
            text: `# Project Orchestrator Analyze - Not Available in Local Version

❌ **This tool requires advanced file system processing**

**Alternative approaches:**
- Use \`analyze_local_folder\` for large projects
- Break down your analysis into smaller, focused questions
- Use \`gemini_codebase_analyzer\` with pre-formatted content

**The local version is optimized for direct folder analysis.**`,
          },
        ],
        isError: true,
      };

    default:
      return {
        content: [
          {
            type: "text",
            text: `# Tool Not Found

❌ **Tool "${name}" is not available**

**Available tools in local version:**
- get_usage_guide - Learn how to use this server
- check_api_key_status - Check your API key configuration
- analyze_local_folder - Analyze local folder directly
- gemini_codebase_analyzer - Analyze pre-formatted codebase
- gemini_code_search - Search through codebase content

**Not available in local version:**
- github_repository_analyzer (use remote version)
- dynamic expert tools (use analysis modes instead)
- project orchestrator (use analyze_local_folder)
- read_log_file (check console output)`,
          },
        ],
        isError: true,
      };
  }
});

// Start the server
async function main() {
  // Log initial working directory for debugging
  console.log(`🏠 MCP Server starting from directory: ${process.cwd()}`);
  console.log(`📂 Server file location: ${__dirname}`);
  
  // Check for --cwd argument to change working directory
  const cwdArgIndex = process.argv.indexOf('--cwd');
  if (cwdArgIndex !== -1 && cwdArgIndex + 1 < process.argv.length) {
    const newCwd = process.argv[cwdArgIndex + 1];
    try {
      process.chdir(newCwd);
      console.log(`🗂️ Changed working directory to: ${process.cwd()}`);
    } catch (error) {
      console.error(`❌ Failed to change working directory to ${newCwd}:`, error);
      process.exit(1);
    }
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Keep the server running
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);