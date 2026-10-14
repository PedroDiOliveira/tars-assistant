import { create } from "zustand";
import type { AssistantCard } from "@/domain/assistant-cards";
import type { TxProposal } from "@/domain/quick-entry";

export type ProposalStatus = "pending" | "confirmed" | "cancelled";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  period?: string;
  /** cards já montados quando a resposta chegou: ficam congelados, não acompanham mudanças nos dados depois */
  cards?: AssistantCard[];
  proposal?: { value: TxProposal; status: ProposalStatus };
  /** falha ao falar com o assistente: a tela oferece o caminho manual */
  failed?: boolean;
}

export const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: "Oi! Posso responder sobre seus números (finanças, musculação, corrida, estudos e leitura) e propor lançamentos de gasto. Experimente uma das sugestões abaixo.",
};

interface ChatState {
  messages: Message[];
  /** há uma pergunta em andamento (continua valendo se a pessoa sair da tela e voltar) */
  thinking: boolean;
  add: (message: Message) => void;
  /** a resposta chegou: entra na conversa e encerra a espera numa só atualização (uma renderização, uma rolagem) */
  receive: (message: Message) => void;
  setProposalStatus: (id: string, status: ProposalStatus) => void;
  setThinking: (thinking: boolean) => void;
}

/**
 * A conversa vive só na memória do navegador: tocar num link do cartão e voltar não zera o chat, e recarregar a
 * página (inclusive ao sair da conta, que recarrega de propósito) apaga tudo. Nada vai para localStorage nem para o banco.
 */
export const useChatStore = create<ChatState>()((set) => ({
  messages: [WELCOME],
  thinking: false,
  add: (message) => set((s) => ({ messages: [...s.messages, message] })),
  receive: (message) => set((s) => ({ messages: [...s.messages, message], thinking: false })),
  setProposalStatus: (id, status) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m)),
    })),
  setThinking: (thinking) => set({ thinking }),
}));
