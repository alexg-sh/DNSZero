declare module 'electron-prompt' {
  interface PromptOptions {
    title?: string;
    label?: string;
    value?: string;
    type?: 'input' | 'select' | 'checkbox' | 'multiselect';
    selectOptions?: Record<string, string>;
    icon?: string;
    width?: number;
    height?: number;
    inputAttrs?: Record<string, any>;
  }
  export default function prompt(options: PromptOptions): Promise<string | null>;
}
