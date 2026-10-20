import { createContext, useContext, useState, type ReactNode } from 'react';

interface AssistantState { open: boolean; prompt: string | null; ask: (prompt?: string) => void; close: () => void; consumePrompt: () => void }
const Ctx = createContext<AssistantState | null>(null);

// Lets any screen open the assistant, optionally with a question already asked (e.g. "Investigate dt-…").
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  return (
    <Ctx.Provider value={{ open, prompt, ask: (p) => { setPrompt(p ?? null); setOpen(true); }, close: () => setOpen(false), consumePrompt: () => setPrompt(null) }}>
      {children}
    </Ctx.Provider>
  );
}
export function useAssistant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant outside AssistantProvider');
  return v;
}
