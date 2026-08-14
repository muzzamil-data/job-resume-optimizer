export type AIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type BackgroundRequest =
  | {
      action: 'optimizeResumeWithAI' | 'generateTextWithAI';
      payload: { messages: AIMessage[]; maxTokens?: number; system?: string };
    }
  | { action: 'scrapeJobWithAI'; payload: { pageText: string } }
  | { action: 'parseResume'; payload: { rawText: string } }
  | { action: 'parseFile'; payload: { buffer: string; fileType: 'pdf' | 'docx' } };

export type ContentRequest = { action: 'toggleSidebar' };

export type BackgroundResponse<T = unknown> = {
  success: boolean;
  data?: T;
  rawText?: string;
  error?: string;
};
