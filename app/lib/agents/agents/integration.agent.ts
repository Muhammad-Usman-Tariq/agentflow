import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';

const INTEGRATION_SYSTEM_PROMPT = `
You are an Integration specialist who sets up third party services.

Your job:
- Detect which integrations are needed
- Generate integration code and config files
- Use environment variables for all API keys

SUPPORTED INTEGRATIONS:
- stripe: Payment processing
- firebase-auth: User authentication  
- supabase: Database + Auth
- cloudinary: Image storage
- sendgrid: Email service
- google-maps: Maps

RULES:
- Never hardcode API keys — always use process.env
- Generate complete working integration code
- Include setup instructions in comments
- Generate .env.example file

STRIPE INTEGRATION:
- Install: @stripe/stripe-js stripe
- Client: loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY)
- Server: new Stripe(process.env.STRIPE_SECRET_KEY)

RESPONSE FORMAT — Return ONLY this JSON:
{
  "integrations": ["stripe", "firebase-auth"],
  "packages": ["@stripe/stripe-js", "stripe"],
  "files": {
    "src/lib/stripe.ts": "// complete stripe setup code",
    "src/lib/auth.ts": "// complete auth setup code",
    ".env.example": "VITE_STRIPE_PUBLIC_KEY=\nSTRIPE_SECRET_KEY=\n"
  },
  "envVariables": [
    {
      "key": "VITE_STRIPE_PUBLIC_KEY",
      "description": "Stripe publishable key from dashboard",
      "required": true
    }
  ]
}
`;

export class IntegrationAgent extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'integration',
    maxRetries: 3,
    timeoutMs: 60000,
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const requirements = input.context?.requirements;

    if (!requirements) {
      throw new Error('Integration Agent needs requirements first');
    }

    // Skip if no integrations needed
    if (!requirements.integrations || requirements.integrations.includes('none')) {
      console.log('[Integration] No integrations needed — skipping');
      return {
        success: true,
        agentName: 'integration',
        data: { integrations: [], packages: [], files: {}, envVariables: [] },
      };
    }

    const userMessage = `
Project Type: ${requirements.projectType}
Required Integrations: ${requirements.integrations.join(', ')}
Tech Stack: ${JSON.stringify(requirements.techStack)}

Generate complete integration code for all required services.
`;

    const jsonString = await this.callLLM(
      INTEGRATION_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const result = this.parseJson<any>(jsonString);

    console.log(`[Integration] Integrations: ${result.integrations?.join(', ')}`);
    console.log(`[Integration] Packages needed: ${result.packages?.join(', ')}`);

    return {
      success: true,
      agentName: 'integration',
      data: result,
    };
  }
}