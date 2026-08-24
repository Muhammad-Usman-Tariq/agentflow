import { AgentBase } from './agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { AgentPlan } from '../types/task.types';
import type { ProjectType } from '../types/project.types';
import { ORCHESTRATOR_SYSTEM_PROMPT, ORCHESTRATOR_USER_PROMPT } from '../prompts/orchestrator.prompt';
import { createAgentRun, updateRunStatus } from './agent-memory';
import { runAgentPlan, type ProgressCallback } from './agent-runner';

interface OrchestratorPlan {
  projectType: ProjectType;
  confidence: number;
  reasoning: string;
  phases: Array<{
    phaseName: string;
    executionType: 'sequential' | 'parallel';
    agents: string[];
  }>;
}

export class Orchestrator extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'orchestrator',
    maxRetries: 3,
    // ⚠️ FIX: was 30000 (30s) — fine for fast cloud APIs (OpenAI/Groq) but far
    // too short for a self-hosted, small-GPU Qwen backend, especially with
    // long user prompts. Every attempt was timing out before Qwen could even
    // finish generating, so planning (and the whole orchestrator run) always
    // failed after 3 wasted attempts.
    timeoutMs: 120000,
  }, env);
}

  // Main entry point — called from API route
  async start(
    userRequest: string,
    chatId: string,
    onProgress?: ProgressCallback
  ): Promise<{
    success: boolean;
    files?: Record<string, string>;
    runId?: number;
    error?: string;
  }> {
    console.log('\n🧠 Orchestrator starting...');
    console.log(`Request: "${userRequest}"`);

    try {
      // Step 1 — Detect project type and build execution plan
      const plan = await this.buildPlan(userRequest);
      console.log(`\n📋 Plan ready — Project: ${plan.projectType}`);
      console.log(`Reasoning: ${plan.reasoning}`);

      // Step 2 — Create DB run record
      const runId = await createAgentRun(chatId, plan.projectType, userRequest, this.env);
      console.log(`\n💾 Run created — ID: ${runId}`);

      // Step 3 — Build agent plan
      const agentPlan: AgentPlan = {
        runId,
        chatId,
        userRequest,
        projectType: plan.projectType,
        phases: plan.phases as any,
        env: this.env,
      };

      // Step 4 — Execute all agents
      const { context, failures } = await runAgentPlan(agentPlan, onProgress);

      if (failures.length > 0) {
        console.warn(`\n⚠️ ${failures.length} agent(s) failed:`);
        failures.forEach(f => console.warn(`  - ${f.agentName}: ${f.error}`));
      }

      // Step 5 — Collect all generated files
      const allFiles: Record<string, string> = {};

      // Files from coder
      if (context.generatedCode) {
        Object.assign(allFiles, context.generatedCode);
      }

      // Files from integration agent
      if ((context as any).integrationData?.files) {
        Object.assign(allFiles, (context as any).integrationData.files);
      }

      // Files from data agent
      if ((context as any).dataFiles?.dataFiles) {
        Object.assign(allFiles, (context as any).dataFiles.dataFiles);
      }

      // Step 6 — Add package.json if missing
      if (!allFiles['package.json']) {
        allFiles['package.json'] = this.generatePackageJson(
          context.requirements?.projectName || 'my-project',
          (context as any).integrationData?.packages || []
        );
      }

      // Step 7 — Add index.html if missing
      if (!allFiles['index.html']) {
        allFiles['index.html'] = this.generateIndexHtml(
          context.requirements?.projectName || 'My Project'
        );
      }

      await updateRunStatus(runId, 'done', undefined, this.env);

      console.log(`\n✅ Orchestrator done — ${Object.keys(allFiles).length} files generated`);

      // ⚠️ FIX: this used to always return success: true, even when Coder —
      // the agent responsible for every real application file — failed
      // completely and the "files" were just DataAgent's sample data plus
      // this class's own hardcoded boilerplate package.json/index.html
      // templates. That made total failures look identical to real success
      // in the API response, so there was no way to tell the run had
      // actually produced no working app. Now a Coder failure is reported
      // as a genuine failure, with its real error message attached.
      const coderFailed = failures.some(f => f.agentName === 'coder');

      return {
        success: !coderFailed,
        files: allFiles,
        runId,
        ...(failures.length > 0 ? { warnings: failures } : {}),
        ...(coderFailed ? { error: `Coder agent failed: ${failures.find(f => f.agentName === 'coder')?.error}` } : {}),
      } as any;

    } catch (error: any) {
      console.error('\n❌ Orchestrator failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Build execution plan from user request
  async execute(input: AgentInput): Promise<AgentOutput> {
    const userMessage = ORCHESTRATOR_USER_PROMPT(input.userRequest);

    const jsonString = await this.callLLM(
      ORCHESTRATOR_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const plan = this.parseJson<OrchestratorPlan>(jsonString);

    return {
      success: true,
      agentName: 'orchestrator',
      data: plan,
    };
  }

  private async buildPlan(userRequest: string): Promise<OrchestratorPlan> {
    const output = await this.run({
      userRequest,
      chatId: '',
    });

    if (!output.success) {
      throw new Error(`Orchestrator planning failed: ${output.error}`);
    }

    return output.data as OrchestratorPlan;
  }

  // Generate default package.json
  private generatePackageJson(
    projectName: string,
    extraPackages: string[] = []
  ): string {
    const slug = projectName.toLowerCase().replace(/\s+/g, '-');

    const dependencies: Record<string, string> = {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.8.0',
    };

    // Add extra packages from integration agent
    for (const pkg of extraPackages) {
      if (pkg === '@stripe/stripe-js') dependencies['@stripe/stripe-js'] = '^2.0.0';
      if (pkg === 'stripe') dependencies['stripe'] = '^14.0.0';
      if (pkg === 'firebase') dependencies['firebase'] = '^10.0.0';
      if (pkg === '@supabase/supabase-js') dependencies['@supabase/supabase-js'] = '^2.0.0';
    }

    const devDependencies: Record<string, string> = {
      '@vitejs/plugin-react': '^4.0.0',
      'autoprefixer': '^10.4.14',
      'postcss': '^8.4.24',
      'tailwindcss': '^3.3.0',
      'typescript': '^5.0.0',
      'vite': '^4.3.9',
    };

    return JSON.stringify({
      name: slug,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
      },
      dependencies,
      devDependencies,
    }, null, 2);
  }

  // Generate default index.html
  private generateIndexHtml(projectName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
  }
}