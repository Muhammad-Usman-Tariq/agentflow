import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';

const DATA_SYSTEM_PROMPT = `
You are a Data Generation specialist.
Your job: Create realistic sample data for web projects.

RULES:
- Real looking names, prices, descriptions
- Use Unsplash URLs for images: https://images.unsplash.com/photo-{id}?w=400
- Proper categories and tags
- Realistic pricing
- No "Lorem ipsum" — write real content

FOR ECOMMERCE — generate:
- 12 products with name, price, description, image, category, rating
- 4-6 categories
- 3-5 testimonials/reviews

FOR BLOG — generate:
- 6 blog posts with title, excerpt, content, author, date, category
- 4 categories
- Author profile

FOR PORTFOLIO — generate:
- 6 projects with title, description, tech stack, image, link
- Skills list with proficiency levels

RESPONSE FORMAT — Return ONLY this JSON:
{
  "sampleData": {
    "products": [...] or "posts": [...] or "projects": [...],
    "categories": [...],
    "testimonials": [...]
  },
  "dataFiles": {
    "src/data/products.ts": "export const products = [...]",
    "src/data/categories.ts": "export const categories = [...]"
  }
}
`;

export class DataAgent extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'data',
    maxRetries: 3,
    timeoutMs: 60000,
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const requirements = input.context?.requirements;

    if (!requirements) {
      throw new Error('Data Agent needs requirements first');
    }

    const userMessage = `
Project Type: ${requirements.projectType}
Project Name: ${requirements.projectName}
Pages: ${requirements.pages?.map((p: any) => p.name).join(', ')}

Generate realistic sample data and data files for this project.
Make it look like a real ${requirements.projectType} with actual content.
`;

    const jsonString = await this.callLLM(
      DATA_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const result = this.parseJson<any>(jsonString);

    console.log(`[Data] Generated data files: ${Object.keys(result.dataFiles || {}).length}`);

    return {
      success: true,
      agentName: 'data',
      data: result,
    };
  }
}