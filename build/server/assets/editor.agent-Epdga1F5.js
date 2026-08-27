import { A as AgentBase, E as EDITOR_SYSTEM_PROMPT, a as EDITOR_USER_PROMPT } from './server-build-CY_Gu9K6.js';
import 'react/jsx-runtime';
import '@remix-run/react';
import 'isbot';
import 'react-dom/server';
import 'remix-island';
import '@nanostores/react';
import 'nanostores';
import 'js-cookie';
import 'chalk';
import 'react';
import 'react-dnd';
import 'react-dnd-html5-backend';
import 'remix-utils/client-only';
import 'react-toastify';
import 'vite-plugin-node-polyfills/shims/process';
import '@remix-run/cloudflare';
import '@ai-sdk/openai';
import '@ai-sdk/anthropic';
import '@ai-sdk/google';
import 'ollama-ai-provider';
import '@openrouter/ai-sdk-provider';
import 'zustand';
import 'ai';
import 'ai/mcp-stdio';
import '@modelcontextprotocol/sdk/client/streamableHttp.js';
import 'zod';
import 'jszip';
import 'crypto';
import 'ignore';
import '@octokit/rest';
import 'rehype-sanitize';
import 'child_process';
import 'fs';
import 'bcryptjs';
import 'jsonwebtoken';
import 'vite-plugin-node-polyfills/shims/buffer';
import 'path-browserify';
import '@webcontainer/api';
import 'istextorbinary';
import 'diff';
import 'file-saver';
import '@radix-ui/react-tooltip';
import 'class-variance-authority';
import 'framer-motion';
import '@radix-ui/react-dialog';
import 'react-qrcode-logo';

class EditorAgent extends AgentBase {
  constructor(env) {
    super(
      {
        name: "editor",
        maxRetries: 2,
        timeoutMs: 3e5
      },
      env
    );
  }
  async execute(input) {
    const { userRequest } = input;
    const existingFiles = input.context?.existingFiles || {};
    if (Object.keys(existingFiles).length === 0) {
      throw new Error("EditorAgent requires existingFiles in input context");
    }
    const allFilePaths = Object.keys(existingFiles).filter((p) => /\.(tsx?|jsx?|css|scss|sql|json|html)$/.test(p)).slice(0, 40);
    const requestWords = userRequest.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const relevantFiles = {};
    for (const [path, content] of Object.entries(existingFiles)) {
      if (Object.keys(relevantFiles).length >= 8) break;
      const pathLower = path.toLowerCase();
      if (requestWords.some((w) => pathLower.includes(w))) {
        relevantFiles[path] = content;
      }
    }
    for (const [path, content] of Object.entries(existingFiles)) {
      if (Object.keys(relevantFiles).length >= 8) break;
      if (!(path in relevantFiles) && /\.(tsx?|jsx?)$/.test(path)) {
        relevantFiles[path] = content;
      }
    }
    const jsonString = await this.callLLM(
      EDITOR_SYSTEM_PROMPT,
      EDITOR_USER_PROMPT(userRequest, relevantFiles, allFilePaths),
      true
    );
    const result = this.parseJson(jsonString);
    const changedFiles = result.changedFiles || {};
    if (Object.keys(changedFiles).length === 0) {
      throw new Error("EditorAgent returned no changed files");
    }
    const mergedFiles = { ...existingFiles, ...changedFiles };
    console.log(
      `[Editor] ✅ Surgical edit complete: ${Object.keys(changedFiles).length} file(s) changed out of ${Object.keys(existingFiles).length} existing`
    );
    Object.keys(changedFiles).forEach((p) => console.log(`[Editor]   → ${p}`));
    return {
      success: true,
      agentName: "editor",
      data: mergedFiles
    };
  }
}

export { EditorAgent };
