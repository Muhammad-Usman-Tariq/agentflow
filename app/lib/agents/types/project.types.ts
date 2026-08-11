export type ProjectType = string;
export type IntegrationType = string;

export interface ProjectRequirements {
  projectType: ProjectType;
  projectName: string;
  pages: PageRequirement[];
  features: string[];
  integrations: IntegrationType[];
  techStack: TechStack;
  designStyle: DesignStyle;
  sampleData: boolean;
}

export interface PageRequirement {
  name: string;
  path: string;
  components: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface TechStack {
  framework: 'react' | 'vanilla' | 'vue';
  styling: 'tailwind' | 'css' | 'scss';
  language: 'typescript' | 'javascript';
  packageManager: 'npm' | 'pnpm';
}

export interface DesignStyle {
  theme: 'light' | 'dark' | 'auto';
  style: 'minimal' | 'modern' | 'classic' | 'bold';
  primaryColor: string;
  fontStyle: 'sans' | 'serif' | 'mono';
}

export interface ProjectArchitecture {
  fileStructure: FileNode[];
  components: ComponentSpec[];
  apiRoutes: ApiRoute[];
  databaseSchema?: TableSchema[];
}

export interface FileNode {
  path: string;
  type: 'file' | 'directory';
  purpose: string;
}

export interface ComponentSpec {
  name: string;
  filePath: string;
  props: string[];
  dependencies: string[];
}

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  purpose: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnDef[];
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DesignDecisions {
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    scale: string;
  };
  spacing: string;
  borderRadius: string;
  shadows: boolean;
  animations: boolean;
}

export interface ReviewFeedback {
  passed: boolean;
  score: number;
  issues: ReviewIssue[];
  suggestions: string[];
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  file?: string;
  message: string;
  fix?: string;
}