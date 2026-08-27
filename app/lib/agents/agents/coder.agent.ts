import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import {
  FRONTEND_CODER_SYSTEM_PROMPT,
  FRONTEND_CODER_USER_PROMPT,
  BACKEND_CODER_SYSTEM_PROMPT,
  BACKEND_CODER_USER_PROMPT,
  FRONTEND_FILE_SYSTEM_PROMPT,
  FRONTEND_FILE_USER_PROMPT,
  BACKEND_FILE_SYSTEM_PROMPT,
  BACKEND_FILE_USER_PROMPT,
} from '../prompts/coder.prompt';

const BACKEND_PATH_PREFIXES = ['server/', 'backend/', 'database/', 'migrations/'];

function isBackendPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '');
  return BACKEND_PATH_PREFIXES.some((p) => normalized.startsWith(p)) || normalized.endsWith('.sql');
}

const PER_FILE_TIMEOUT_MS = 150000;

const CONFIG_FILE_BASENAMES = new Set([
  'package.json',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'tsconfig.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'postcss.config.cjs',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'index.html',
  '.gitignore',
]);

function isConfigFile(path: string): boolean {
  const basename = path.replace(/^\/+/, '').split('/').pop() || '';
  return CONFIG_FILE_BASENAMES.has(basename);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

function buildConfigFileTemplates(requirements: any, architecture: any): Record<string, string> {
  const projectName = slugify(requirements?.projectName || 'digitalsofts-app');
  const displayTitle = requirements?.projectName || 'App';
  const needsBackend =
    (architecture?.apiRoutes && architecture.apiRoutes.length > 0) ||
    (architecture?.databaseSchema && architecture.databaseSchema.length > 0);

  const packageJson = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      ...(needsBackend ? { server: 'node server/index.js' } : {}),
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.22.0',
      ...(needsBackend
        ? {
            express: '^4.19.2',
            cors: '^2.8.5',
            dotenv: '^16.4.5',
            pg: '^8.11.5',
          }
        : {}),
    },
    devDependencies: {
      '@types/react': '^18.2.66',
      '@types/react-dom': '^18.2.22',
      '@vitejs/plugin-react': '^4.2.1',
      autoprefixer: '^10.4.19',
      postcss: '^8.4.38',
      tailwindcss: '^3.4.3',
      typescript: '^5.4.5',
      vite: '^5.2.0',
    },
  };

  return {
    'package.json': JSON.stringify(packageJson, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
    'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${displayTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    '.gitignore': `node_modules\ndist\n.env\n.env.local\n`,
  };
}

const ENTRY_FILE_PATTERN = /^src\/main\.(tsx|jsx|ts|js)$/;

function ensureEntryPoint(files: Record<string, string>, architecture: any): void {
  const hasEntry = Object.keys(files).some((path) => ENTRY_FILE_PATTERN.test(path));
  if (hasEntry) return;

  const fileList: Array<{ path: string; purpose: string }> = architecture?.fileStructure || [];

  const appFile = Object.keys(files).find((p) => /^src\/App\.(tsx|jsx)$/.test(p));
  const firstPage =
    fileList.find((f) => /\/pages\//.test(f.path) && /\.(tsx|jsx)$/.test(f.path))?.path ||
    Object.keys(files).find((p) => /\/pages\//.test(p) && /\.(tsx|jsx)$/.test(p));

  const targetPath = appFile || firstPage;

  if (!targetPath) {
    console.warn('[Coder] Could not find any component to wire up as the entry point — skipping entry-point fallback');
    return;
  }

  const importPath = './' + targetPath.replace(/^src\//, '').replace(/\.(tsx|jsx)$/, '');
  const componentName = targetPath.split('/').pop()!.replace(/\.(tsx|jsx)$/, '');
  const hasCss = Object.keys(files).some((p) => p === 'src/index.css');

  if (!hasCss) {
    files['src/index.css'] = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
  }

  files['src/main.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import ${componentName} from '${importPath}';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <${componentName} />
  </React.StrictMode>,
);
`;

  console.warn(`[Coder] No entry point was generated — added src/main.tsx (rendering ${componentName}) and src/index.css as a fallback`);
}

export class CoderAgent extends AgentBase {
  constructor(env?: Record<string, string>) {
    super({
      name: 'coder',
      maxRetries: 3,
      timeoutMs: 1200000,
    }, env);
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { requirements, architecture, designDecisions } = input.context || {};

    if (!requirements || !architecture) {
      throw new Error('Coder needs requirements and architecture first');
    }

    const fileList: Array<{ path: string; purpose: string }> = (architecture as any).fileStructure || [];

    let allGeneratedFiles: Record<string, string> = {};

    if (fileList.length > 0) {
      allGeneratedFiles = await this.generatePerFile(fileList, requirements, architecture, designDecisions);
    } else {
      console.warn('[Coder] Architecture has no fileStructure — falling back to blob generation');
      allGeneratedFiles = await this.generateAsBlobsFallback(requirements, architecture, designDecisions);
    }

    const configTemplates = buildConfigFileTemplates(requirements, architecture);
    allGeneratedFiles = { ...allGeneratedFiles, ...configTemplates };

    ensureEntryPoint(allGeneratedFiles, architecture);

    if (Object.keys(allGeneratedFiles).length === 0) {
      throw new Error('Coder generated zero files');
    }

    const dataFiles = (input.context as any)?.dataFiles?.dataFiles || {};
    const integrationFiles = (input.context as any)?.integrationData?.files || {};

    const allFiles = {
      ...allGeneratedFiles,
      ...dataFiles,
      ...integrationFiles,
    };

    console.log(`[Coder] Total files generated: ${Object.keys(allFiles).length}`);
    Object.keys(allFiles).forEach((f) => console.log(`  → ${f}`));

    return {
      success: true,
      agentName: 'coder',
      data: allFiles,
    };
  }

  private async generatePerFile(
    fileList: Array<{ path: string; purpose: string }>,
    requirements: any,
    architecture: any,
    designDecisions: any,
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const failed: string[] = [];

    const frontendFiles = fileList.filter((f) => !isBackendPath(f.path) && !isConfigFile(f.path));
    const backendFiles = fileList.filter((f) => isBackendPath(f.path) && !isConfigFile(f.path));
    const skippedConfigCount = fileList.length - frontendFiles.length - backendFiles.length;

    console.log(
      `[Coder] Generating ${frontendFiles.length} frontend file(s) and ${backendFiles.length} backend/database file(s), one call each` +
        (skippedConfigCount > 0 ? ` (${skippedConfigCount} config file(s) handled by template, no LLM call needed)` : '') +
        '...',
    );

    for (const file of frontendFiles) {
      try {
        console.log(`[Coder] → ${file.path}`);
        const raw = await this.callLLM(
          FRONTEND_FILE_SYSTEM_PROMPT,
          FRONTEND_FILE_USER_PROMPT(requirements, architecture, designDecisions, file.path, file.purpose),
          false,
          PER_FILE_TIMEOUT_MS,
        );
        files[file.path] = this.stripCodeFence(raw);
      } catch (error: any) {
        console.error(`[Coder] ⚠️ Failed to generate ${file.path}, skipping: ${error.message}`);
        failed.push(file.path);
      }
    }

    for (const file of backendFiles) {
      try {
        console.log(`[Coder] → ${file.path}`);
        const raw = await this.callLLM(
          BACKEND_FILE_SYSTEM_PROMPT,
          BACKEND_FILE_USER_PROMPT(architecture, file.path, file.purpose),
          false,
          PER_FILE_TIMEOUT_MS,
        );
        files[file.path] = this.stripCodeFence(raw);
      } catch (error: any) {
        console.error(`[Coder] ⚠️ Failed to generate ${file.path}, skipping: ${error.message}`);
        failed.push(file.path);
      }
    }

    if (failed.length > 0) {
      console.warn(`[Coder] ${failed.length} file(s) failed and were skipped: ${failed.join(', ')}`);
    }

    return files;
  }

  private async generateAsBlobsFallback(
    requirements: any,
    architecture: any,
    designDecisions: any,
  ): Promise<Record<string, string>> {
    const frontendJson = await this.callLLM(
      FRONTEND_CODER_SYSTEM_PROMPT,
      FRONTEND_CODER_USER_PROMPT(requirements, architecture, designDecisions),
      true,
    );
    const frontendResult = this.parseJson<{ files: Record<string, string> }>(frontendJson);

    let backendFiles: Record<string, string> = {};
    const needsBackend =
      (architecture.apiRoutes && architecture.apiRoutes.length > 0) ||
      (architecture.databaseSchema && architecture.databaseSchema.length > 0);

    if (needsBackend) {
      try {
        const backendJson = await this.callLLM(
          BACKEND_CODER_SYSTEM_PROMPT,
          BACKEND_CODER_USER_PROMPT(architecture),
          true,
        );
        const backendResult = this.parseJson<{ files: Record<string, string> }>(backendJson);
        backendFiles = backendResult.files || {};
      } catch (error: any) {
        console.error('[Coder] Backend generation failed, continuing with frontend only:', error.message);
      }
    }

    return {
      ...this.sanitizeFileMap(frontendResult.files),
      ...this.sanitizeFileMap(backendFiles),
    };
  }
}
