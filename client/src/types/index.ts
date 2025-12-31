export interface User {
  id: string;
  email: string;
  role: 'admin' | 'client';
  companyId?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Company {
  id: string;
  name: string;
  email?: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  city?: string;
  cep?: string;
  avatar?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalConfiguration {
  id: string;
  logo?: string;
  favicon?: string;
  cores_primaria: string;
  cores_secundaria: string;
  cores_fundo: string;
  // Campos em camelCase vindos do backend
  coresPrimaria?: string;
  coresSecundaria?: string;
  coresFundo?: string;
  nome_sistema: string;
  nome_rodape: string;
  nome_aba_navegador: string;
  // Campos em camelCase vindos do backend
  nomeSistema?: string;
  nomeRodape?: string;
  nomeAbaNavegador?: string;
  webshare_token?: string;
  updated_at: string;
}

export interface EvolutionApiConfiguration {
  id: string;
  evolutionURL: string;
  evolutionToken: string;
  urlGlobalSistema?: string;
  status: string;
  updatedAt: string;
}

export interface AiConfiguration {
  id: string;
  apiKey: string;
  modelo: string;
  temperatura: string;
  numeroTokens: number;
  updatedAt: string;
}

export interface WhatsappInstance {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  evolutionInstanceId?: string;
  evolutionToken?: string;
  status: string;
  qrCode?: string;
  aiAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiAgent {
  id: string;
  companyId: string;
  name: string;
  prompt: string;
  temperatura: string;
  numeroTokens: number;
  modelo: string;
  trainingFiles?: string[];
  trainingContent?: string;
  agentType?: string; // 'main' | 'secondary'
  parentAgentId?: string;
  specialization?: string;
  delegationKeywords?: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  whatsappInstanceId: string;
  contactName?: string;
  contactPhone: string;
  lastMessage?: string;
  lastMessageAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  sender: 'user' | 'ai' | 'agent';
  messageType: string;
  evolutionMessageId?: string;
  createdAt: string;
}

export interface AdminStats {
  activeCompanies: number;
  whatsappInstances: number;
  aiAgents: number;
  todayConversations: number;
}

export interface MetricValue {
  value: number;
  change: number;
}

export interface ClientStats {
  activeInstances: number;
  aiAgents: number;
  leadsToday: MetricValue;
  scheduledMeetings: MetricValue;
  conversationsToday: MetricValue;
}

export interface RankingItem {
  rank: number;
  name: string;
  value: number;
}

export interface DashboardCharts {
  propertyTypes: RankingItem[];
  transactionTypes: RankingItem[];
}

export interface FunnelStage {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  color: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  funnelStageId: string;
  lastContact?: string;
  notes?: string;
  value?: number;
  source?: string;
  conversationId?: string;
  interestedCityId?: string;
  interestedPropertyType?: string;
  createdAt: string;
  updatedAt: string;
}
